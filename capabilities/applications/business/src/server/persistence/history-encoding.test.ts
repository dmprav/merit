import { expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { makeApplication } from "../../../tests/fixtures";
import history from "../../../tests/fixtures/application-history.json";
import { intakeApplicationSchema } from "../../domain/model";
import { encodeApplicationHistory } from "./history-encoding";
import { applicationHistorySchema } from "./history-format";

it("writes the initial format without confusing it with material or intake revisions", () => {
  const snapshot = applicationHistorySchema.parse(history);
  const stored = encodeApplicationHistory({
    ...snapshot,
    application: { ...snapshot.application, requested: fromMinorUnits(9007199254740995n) },
  });
  expect(stored).toEqual(history);
  expect(applicationHistorySchema.parse(JSON.parse(JSON.stringify(stored)))).toEqual(history);
});

it("preserves unknown amounts and no working revision", () => {
  const value = {
    application: intakeApplicationSchema.parse(makeApplication()),
    workingRevision: null,
  };
  const stored = encodeApplicationHistory(value);
  expect(stored).toMatchObject({ formatVersion: 1, workingRevision: null });
  expect(applicationHistorySchema.parse(JSON.parse(JSON.stringify(stored)))).toEqual({
    formatVersion: 1,
    ...value,
  });
});

it.each([undefined, 0, 2, 3, -1, 1.5, "1", null])(
  "rejects unsupported formatVersion %s",
  (formatVersion) => {
    expect(() => applicationHistorySchema.parse({ ...history, formatVersion })).toThrow(
      /formatVersion/,
    );
  },
);

it.each([
  null,
  [],
  { formatVersion: 1 },
  { ...history, workingRevision: undefined },
  { ...history, application: { ...history.application, version: 0 } },
  {
    ...history,
    application: { ...history.application, requested: { minorUnits: "1.5", currency: "EUR" } },
  },
  {
    ...history,
    application: { ...history.application, requested: { minorUnits: "-1", currency: "EUR" } },
  },
])("rejects malformed historical payloads", (stored) => {
  expect(() => applicationHistorySchema.parse(stored)).toThrow();
});

it("retains question identities in material and working revisions", () => {
  const snapshot = applicationHistorySchema.parse(history);
  const value = { ...snapshot, application: { ...snapshot.application, requested: null } };
  const questionId = "10000000-0000-4000-8000-000000000001";
  value.application.submission!.answers[0]!.questionId = questionId;
  value.workingRevision!.content.answers[0]!.questionId = questionId;
  expect(
    applicationHistorySchema.parse(JSON.parse(JSON.stringify(encodeApplicationHistory(value)))),
  ).toEqual(value);
});

it("rejects missing or duplicate question identities in stored material", () => {
  const answer = history.application.submission.answers[0]!;
  for (const answers of [[{ ...answer, questionId: undefined }], [answer, answer]]) {
    expect(() =>
      applicationHistorySchema.parse({
        ...history,
        application: {
          ...history.application,
          submission: { ...history.application.submission, answers },
        },
      }),
    ).toThrow();
  }
});

it("does not copy judgments into intake snapshots", () => {
  const stored = encodeApplicationHistory({
    application: makeApplication(),
    workingRevision: null,
  });
  expect(stored.application).not.toHaveProperty("reviews");
  expect(stored.application).not.toHaveProperty("managerRecommendation");
});
