import { assert, describe, expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { encodeApplicationDetail, applicationView, roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits, toDecimal } from "@merit/money";

import {
  applicationHistorySnapshots,
  comparedHistoryEntries,
  compareSubmissionAnswers,
  type ApplicationHistoryEntry,
} from "./application-history-model";

const round = roundView(makeRound());
const original = applicationView(makeApplication());

const snapshot = (version: number, title = original.title) =>
  encodeApplicationDetail({
    round,
    application: {
      ...original,
      version: materialVersionSchema.parse(version),
      title,
      submission: { version, answers: [] },
      requested: fromMinorUnits(BigInt(version) * 100000n),
    },
  }).application;

const entry = (revision: number, from: number, to: number): ApplicationHistoryEntry => ({
  revision,
  action: "application.revision_recorded",
  actor: "Dana Reed",
  provenance: { interface: "web" },
  reason: `Update ${revision}`,
  recordedAt: "2027-01-19T11:00:00Z",
  before: snapshot(from),
  after: snapshot(to),
});

describe("application history snapshots", () => {
  it("collects recorded versions in order and uses current application data for the current version", () => {
    const current = {
      ...original,
      version: materialVersionSchema.parse(3),
      submission: { version: materialVersionSchema.parse(3), answers: [] },
      title: "Current title",
    };
    const snapshots = applicationHistorySnapshots(current, [entry(3, 2, 3), entry(2, 1, 2)]);

    expect(snapshots.map((value) => value.version)).toEqual([1, 2, 3]);
    assert.isDefined(snapshots[0]);
    expect(toDecimal(snapshots[0].requested!)).toBe("1000.00");
    expect(snapshots[2]).toBe(current);
  });

  it("does not manufacture an earlier version when no snapshot exists", () => {
    const current = {
      ...original,
      version: materialVersionSchema.parse(5),
      submission: { version: 5, answers: [] },
    };

    expect(applicationHistorySnapshots(current, [])).toEqual([current]);
    expect(
      applicationHistorySnapshots(current, [{ ...entry(1, 1, 2), before: null, after: null }]),
    ).toEqual([current]);
  });

  it("uses the latest recorded details of an earlier version without depending on input order", () => {
    const correction = { ...entry(3, 2, 2), after: snapshot(2, "Corrected contact record") };

    expect(
      applicationHistorySnapshots(
        {
          ...original,
          version: materialVersionSchema.parse(3),
          submission: { version: materialVersionSchema.parse(3), answers: [] },
        },
        [correction, entry(2, 1, 2)],
      )[1]?.title,
    ).toBe("Corrected contact record");
  });

  it("attributes a nonadjacent comparison to all included version-changing events", () => {
    const history = [entry(4, 3, 4), entry(3, 2, 3), entry(2, 1, 2), entry(5, 3, 3)];

    expect(comparedHistoryEntries(history, 1, 3).map((value) => value.reason)).toEqual([
      "Update 2",
      "Update 3",
    ]);
    expect(comparedHistoryEntries(history, 2, 3).map((value) => value.revision)).toEqual([3]);
  });
});

it("compares identities across renaming, duplicate headings, reordering, and replacement", () => {
  const a = {
    questionId: "10000000-0000-4000-8000-000000000001",
    question: "Plan",
    response: "First",
  };
  const b = {
    questionId: "10000000-0000-4000-8000-000000000002",
    question: "Plan",
    response: "Second",
  };
  const renamed = { ...a, question: "Project plan" };
  expect(compareSubmissionAnswers([a, b], [b, renamed])).toEqual([
    { before: b, after: b, status: "unchanged" },
    { before: a, after: renamed, status: "changed" },
  ]);
  expect(compareSubmissionAnswers([a], [{ ...a, response: "Changed" }])[0]?.status).toBe("changed");
  const replacement = { ...a, questionId: "10000000-0000-4000-8000-000000000003" };
  expect(compareSubmissionAnswers([a], [replacement]).map((answer) => answer.status)).toEqual([
    "added",
    "removed",
  ]);
  expect(
    compareSubmissionAnswers([{ ...a, question: "" }], [{ ...a, question: "" }])[0]?.status,
  ).toBe("unchanged");
});
