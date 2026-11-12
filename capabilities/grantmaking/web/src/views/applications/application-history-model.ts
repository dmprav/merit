import type { IntakeState } from "@merit/applications-web/contracts";
import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { decodeMoney } from "@merit/money";

export type HistorySnapshot = Pick<Application, "version" | "title" | "requested" | "submission">;

export type ApplicationHistoryEntry = IntakeState["history"][number];

type Answer = NonNullable<Application["submission"]>["answers"][number];

/** Later records of a version include subsequent contact corrections; current data is authoritative. */
export const applicationHistorySnapshots = (
  application: HistorySnapshot,
  history: readonly ApplicationHistoryEntry[],
): HistorySnapshot[] => {
  const snapshots = new Map<number, HistorySnapshot>();
  for (const entry of [...history].sort((left, right) => left.revision - right.revision)) {
    for (const value of [entry.before, entry.after]) {
      if (!value) {
        continue;
      }

      snapshots.set(value.version, {
        version: value.version,
        title: value.title,
        requested: value.requested === null ? null : decodeMoney(value.requested),
        submission: value.submission,
      });
    }
  }

  snapshots.set(application.version, application);
  return [...snapshots.values()].sort((left, right) => left.version - right.version);
};

export type ComparedAnswer = {
  before: Answer | null;
  after: Answer | null;
  status: "unchanged" | "changed" | "added" | "removed";
};

/** Persisted IDs preserve continuity across renames and reordering. */
export const compareSubmissionAnswers = (
  before: readonly Answer[],
  after: readonly Answer[],
): ComparedAnswer[] => {
  const previousById = new Map(before.map((answer) => [answer.questionId, answer]));

  const matched = new Set<Answer>();
  const compared = after.map((answer): ComparedAnswer => {
    const previous = previousById.get(answer.questionId);
    if (!previous) {
      return { before: null, after: answer, status: "added" };
    }
    matched.add(previous);
    return {
      before: previous,
      after: answer,
      status:
        previous.question === answer.question && previous.response === answer.response
          ? "unchanged"
          : "changed",
    };
  });
  return [
    ...compared,
    ...before
      .filter((answer) => !matched.has(answer))
      .map((answer): ComparedAnswer => ({
        before: answer,
        after: null,
        status: "removed",
      })),
  ];
};

export const comparedHistoryEntries = (
  history: readonly ApplicationHistoryEntry[],
  from: number,
  to: number,
) =>
  history
    .filter(
      (entry) =>
        entry.before &&
        entry.after &&
        entry.before.version !== entry.after.version &&
        entry.before.version >= from &&
        entry.after.version <= to,
    )
    .toSorted((left, right) => left.revision - right.revision);
