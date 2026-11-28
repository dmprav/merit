import { z } from "zod";

import { hasRunIdForm } from "./runs.ts";
import {
  formatScoutStateBody,
  LEGACY_RECORDS_KEY,
  type MarkerEntries,
  RECORDS_RUN_ID,
  readLastPrNumber,
  readMarker,
} from "./state-marker.ts";

export {
  formatScoutStateBody,
  SCOUT_STATE_ISSUE_NUMBER,
  SCOUT_STATE_ISSUE_TITLE,
} from "./state-marker.ts";

const runCursorSchema = z
  .object({
    lastCommitSha: z.string().min(7).optional(),
    lastCommitDate: z.string().min(10).optional(),
    lastPrNumber: z.number().int().positive().optional(),
    /** When the last finished run advanced the cursor; absent until a run first finishes. */
    lastRunAt: z.string().min(10).optional(),
    /** When a session was last started for the run; `advance` clears it. */
    startedAt: z.string().min(10).optional(),
  })
  .refine((cursor) => cursor.lastRunAt !== undefined || cursor.startedAt !== undefined, {
    message: "a cursor needs lastRunAt or startedAt",
  });

export type RunCursor = z.infer<typeof runCursorSchema>;

/** Cursors keyed by run id: `change-batch`, `area:<area>`, `mechanism:<id>`, and `records`. */
export type ScoutState = Record<string, RunCursor>;

export type ScoutStateRead =
  | { kind: "absent" }
  | { kind: "parsed"; state: ScoutState }
  | { kind: "corrupt"; error: string };

/** Starts the `records` cursor from the old `verification-flakes` lens so read records stay read. */
const seedRecordsCursor = (entries: MarkerEntries): RunCursor | undefined => {
  const lastPrNumber = readLastPrNumber(entries[LEGACY_RECORDS_KEY]);
  if (lastPrNumber === undefined) {
    return undefined;
  }
  const legacy = runCursorSchema.safeParse(entries[LEGACY_RECORDS_KEY]);
  return {
    lastPrNumber,
    lastRunAt: legacy.success ? legacy.data.lastRunAt : new Date(0).toISOString(),
  };
};

/**
 * Reads the state marker from the state issue body. A marker that is missing reads as `absent`; one
 * that is present but unreadable reads as `corrupt` so callers never mistake it for empty state.
 * Cursors inside a readable marker are parsed independently, so one corrupt entry is dropped
 * without wiping its siblings, and keys that are not run ids (the old lens names) are ignored.
 */
export const parseScoutState = (issueBody: string): ScoutStateRead => {
  const read = readMarker(issueBody);
  if (read.kind !== "parsed") {
    return read;
  }
  const state: ScoutState = {};
  for (const [key, value] of Object.entries(read.entries)) {
    const cursorResult = runCursorSchema.safeParse(value);
    if (hasRunIdForm(key) && cursorResult.success) {
      state[key] = cursorResult.data;
    }
  }
  const seeded = state[RECORDS_RUN_ID] ? undefined : seedRecordsCursor(read.entries);
  if (seeded) {
    state[RECORDS_RUN_ID] = seeded;
  }
  return { kind: "parsed", state };
};

const describeCorruptScoutState = (issueNumber: number, error: string): string =>
  `Scout state marker in issue #${issueNumber} is corrupt (${error}). ` +
  `Repair the "<!-- merit-scout-state: {...} -->" marker with \`gh issue edit ${issueNumber}\` ` +
  "so it holds one JSON object of run cursors, or delete the marker to reset every run.";

/** Returns the recorded cursors for read-only use, warning instead of failing when the marker is corrupt. */
export const scoutStateForReading = (
  read: ScoutStateRead,
  issueNumber: number,
  warn: (message: string) => void,
): ScoutState => {
  if (read.kind === "corrupt") {
    warn(
      `Warning: ${describeCorruptScoutState(issueNumber, read.error)} Treating every run as having no cursor.`,
    );
  }
  return read.kind === "parsed" ? read.state : {};
};

/**
 * Computes the state issue body after `update` rewrites the cursors of `runIds`. Entries under
 * run-id keys stay exactly as stored, even when they fail validation, except that a missing or
 * invalid `records` entry is replaced by the cursor seeded from the old `verification-flakes` one
 * when that exists; entries under any other key, such as the old lens cursors, are dropped. Refuses
 * before computing any cursor when the marker is corrupt, because rewriting it would erase the
 * cursors it still holds.
 */
const rewriteScoutStateBody = ({
  issueNumber,
  issueBody,
  runIds,
  verb,
  update,
}: {
  issueNumber: number;
  issueBody: string;
  runIds: readonly string[];
  verb: string;
  update: (previous: RunCursor | undefined) => RunCursor;
}): { body: string; cursors: Record<string, RunCursor> } => {
  const read = readMarker(issueBody);
  if (read.kind === "corrupt") {
    throw new Error(
      `Refusing to ${verb}: ${describeCorruptScoutState(issueNumber, read.error)} Then rerun ${verb}.`,
    );
  }
  const stored = read.kind === "parsed" ? read.entries : {};
  const entries: MarkerEntries = Object.fromEntries(
    Object.entries(stored).filter(([key]) => hasRunIdForm(key)),
  );
  if (!runCursorSchema.safeParse(entries[RECORDS_RUN_ID]).success) {
    const seeded = seedRecordsCursor(stored);
    if (seeded) {
      entries[RECORDS_RUN_ID] = seeded;
    }
  }
  const cursors: Record<string, RunCursor> = {};
  for (const runId of runIds) {
    const previous = runCursorSchema.safeParse(entries[runId]);
    cursors[runId] = update(previous.success ? previous.data : undefined);
  }
  return { body: formatScoutStateBody(issueBody, { ...entries, ...cursors }), cursors };
};

/** Computes the state issue body that records the next cursor for `runId`. */
export const advanceScoutStateBody = ({
  issueNumber,
  issueBody,
  runId,
  nextCursor,
}: {
  issueNumber: number;
  issueBody: string;
  runId: string;
  nextCursor: (previous: RunCursor | undefined) => RunCursor;
}): { body: string; cursor: RunCursor } => {
  const { body, cursors } = rewriteScoutStateBody({
    issueNumber,
    issueBody,
    runIds: [runId],
    verb: "advance",
    update: nextCursor,
  });
  const cursor = cursors[runId];
  if (!cursor) {
    throw new Error(`No cursor computed for run "${runId}".`);
  }
  return { body, cursor };
};

/**
 * Computes the state issue body that marks each run in `runIds` as started at `startedAt`, creating
 * a cursor that holds only `startedAt` where a run has none and keeping every other field.
 */
export const startScoutStateBody = ({
  issueNumber,
  issueBody,
  runIds,
  startedAt,
}: {
  issueNumber: number;
  issueBody: string;
  runIds: readonly string[];
  startedAt: Date;
}): { body: string; cursors: Record<string, RunCursor> } =>
  rewriteScoutStateBody({
    issueNumber,
    issueBody,
    runIds,
    verb: "start",
    update: (previous) => ({ ...previous, startedAt: startedAt.toISOString() }),
  });

/** Records a finished run at `commitSha`; the pull request number carries over unless this run passes a new one. */
export const nextRunCursor = ({
  previous,
  commitSha,
  commitDate,
  prNumber,
  runAt,
}: {
  previous: RunCursor | undefined;
  commitSha: string;
  commitDate: string;
  prNumber: number | undefined;
  runAt: Date;
}): RunCursor => {
  const lastPrNumber = prNumber ?? previous?.lastPrNumber;
  return runCursorSchema.parse({
    lastCommitSha: commitSha,
    lastCommitDate: commitDate,
    ...(lastPrNumber !== undefined ? { lastPrNumber } : {}),
    lastRunAt: runAt.toISOString(),
  });
};
