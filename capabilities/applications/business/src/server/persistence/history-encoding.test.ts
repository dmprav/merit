import { expect, it, vi } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { makeApplication } from "../../../tests/fixtures";
import history from "../../../tests/fixtures/application-history.json";
import { intakeApplicationSchema } from "../../domain/model";
import { decodeApplicationHistory, encodeApplicationHistory } from "./history-encoding";

it("reads fixed historical JSON independently of the current application schema", () => {
  const stored = history;
  const original = structuredClone(stored);
  const parse = vi.spyOn(intakeApplicationSchema, "parse").mockImplementation(() => {
    throw new Error("A future model requires another field");
  });
  try {
    const restored = decodeApplicationHistory(stored);
    expect(restored).toEqual({
      workingRevision: history.workingRevision,
      application: {
        ...history.application,
        requested: fromMinorUnits(9007199254740995n),
      },
    });
    expect(stored).toEqual(original);
  } finally {
    parse.mockRestore();
  }
});

it("writes the initial format without confusing it with material or intake revisions", () => {
  const stored = encodeApplicationHistory(decodeApplicationHistory(history));
  expect(stored).toEqual(history);
  expect(decodeApplicationHistory(JSON.parse(JSON.stringify(stored)))).toEqual(
    decodeApplicationHistory(history),
  );
});

it("preserves unknown amounts and no working revision", () => {
  const value = {
    application: intakeApplicationSchema.parse(makeApplication()),
    workingRevision: null,
  };
  const stored = encodeApplicationHistory(value);
  expect(stored).toMatchObject({ formatVersion: 1, workingRevision: null });
  expect(decodeApplicationHistory(JSON.parse(JSON.stringify(stored)))).toEqual(value);
});

it.each([undefined, 0, 2, 3, -1, 1.5, "1", null])(
  "rejects unsupported formatVersion %s",
  (formatVersion) => {
    expect(() => decodeApplicationHistory({ ...history, formatVersion })).toThrow(/formatVersion/);
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
  expect(() => decodeApplicationHistory(stored)).toThrow();
});

it("retains question identities in material and working revisions", () => {
  const value = decodeApplicationHistory(history);
  const questionId = "10000000-0000-4000-8000-000000000001";
  value.application.submission!.answers[0]!.questionId = questionId;
  value.workingRevision!.content.answers[0]!.questionId = questionId;
  expect(
    decodeApplicationHistory(JSON.parse(JSON.stringify(encodeApplicationHistory(value)))),
  ).toEqual(value);
});

it("rejects missing or duplicate question identities in stored material", () => {
  const answer = history.application.submission.answers[0]!;
  for (const answers of [[{ ...answer, questionId: undefined }], [answer, answer]]) {
    expect(() =>
      decodeApplicationHistory({
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
