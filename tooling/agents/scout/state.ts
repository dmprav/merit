import { z } from "zod";

import { SCOUT_LENSES, type ScoutLens } from "../proposal.ts";

export const SCOUT_STATE_ISSUE_NUMBER = 219;
export const SCOUT_STATE_ISSUE_TITLE = "chore: agent scout state";

const STATE_MARKER_PATTERN = /<!--\s*merit-scout-state:\s*(\{[\s\S]*?\})\s*-->/;
const STATE_MARKER_PREFIX_PATTERN = /<!--\s*merit-scout-state:/;

const lensCursorSchema = z.object({
  lastCommitSha: z.string().min(7).optional(),
  lastCommitDate: z.string().min(10).optional(),
  lastPrNumber: z.number().int().positive().optional(),
  lastRotationTarget: z.string().min(1).optional(),
  lastRunAt: z.string().min(10),
});

export type LensCursor = z.infer<typeof lensCursorSchema>;

export type ScoutState = Partial<Record<ScoutLens, LensCursor>>;

export const lensNameSchema = z.enum(SCOUT_LENSES);

export type ScoutStateRead =
  | { kind: "absent" }
  | { kind: "parsed"; state: ScoutState }
  | { kind: "corrupt"; error: string };

/**
 * Reads the state marker from the state issue body. A marker that is missing reads as `absent`; one
 * that is present but unreadable reads as `corrupt` so callers never mistake it for empty state.
 * Lens cursors inside a readable marker are parsed independently, so one corrupt entry is dropped
 * without wiping sibling lenses.
 */
export const parseScoutState = (issueBody: string): ScoutStateRead => {
  const match = STATE_MARKER_PATTERN.exec(issueBody);
  if (!match?.[1]) {
    return STATE_MARKER_PREFIX_PATTERN.test(issueBody)
      ? { kind: "corrupt", error: "the marker is not closed by a JSON object and -->" }
      : { kind: "absent" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch (error) {
    return {
      kind: "corrupt",
      error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "corrupt", error: "the marker JSON is not an object" };
  }
  const state: ScoutState = {};
  for (const [key, value] of Object.entries(raw)) {
    const lensResult = lensNameSchema.safeParse(key);
    const cursorResult = lensCursorSchema.safeParse(value);
    if (lensResult.success && cursorResult.success) {
      state[lensResult.data] = cursorResult.data;
    }
  }
  return { kind: "parsed", state };
};

const describeCorruptScoutState = (issueNumber: number, error: string): string =>
  `Scout state marker in issue #${issueNumber} is corrupt (${error}). ` +
  `Repair the "<!-- merit-scout-state: {...} -->" marker with \`gh issue edit ${issueNumber}\` ` +
  "so it holds one JSON object of lens cursors, or delete the marker to reset every lens.";

/** Returns the recorded cursors for read-only use, warning instead of failing when the marker is corrupt. */
export const scoutStateForReading = (
  read: ScoutStateRead,
  issueNumber: number,
  warn: (message: string) => void,
): ScoutState => {
  if (read.kind === "corrupt") {
    warn(
      `Warning: ${describeCorruptScoutState(issueNumber, read.error)} Treating every lens as having no cursor.`,
    );
  }
  return read.kind === "parsed" ? read.state : {};
};

export const formatScoutStateBody = (existingBody: string, state: ScoutState): string => {
  const marker = `<!-- merit-scout-state: ${JSON.stringify(state)} -->`;
  if (STATE_MARKER_PATTERN.test(existingBody)) {
    return existingBody.replace(STATE_MARKER_PATTERN, marker);
  }
  const trimmed = existingBody.trimEnd();
  return `${trimmed}\n\n${marker}\n`;
};

/**
 * Computes the state issue body that records the next cursor for `lens`, keeping every sibling lens
 * cursor. Refuses before computing the cursor when the marker is corrupt, because rewriting it would
 * erase the cursors it still holds.
 */
export const advanceScoutStateBody = ({
  issueNumber,
  issueBody,
  lens,
  nextCursor,
}: {
  issueNumber: number;
  issueBody: string;
  lens: ScoutLens;
  nextCursor: (previous: LensCursor | undefined) => LensCursor;
}): { body: string; cursor: LensCursor } => {
  const read = parseScoutState(issueBody);
  if (read.kind === "corrupt") {
    throw new Error(
      `Refusing to advance: ${describeCorruptScoutState(issueNumber, read.error)} Then rerun advance.`,
    );
  }
  const state = read.kind === "parsed" ? read.state : {};
  const cursor = nextCursor(state[lens]);
  return { body: formatScoutStateBody(issueBody, { ...state, [lens]: cursor }), cursor };
};

/**
 * Records a finished run at `commitSha`. The pull request and rotation target carry over from the
 * previous cursor unless this run passes new ones.
 */
export const nextLensCursor = ({
  previous,
  commitSha,
  commitDate,
  target,
  prNumber,
  runAt,
}: {
  previous: LensCursor | undefined;
  commitSha: string;
  commitDate: string;
  target: string | undefined;
  prNumber: number | undefined;
  runAt: Date;
}): LensCursor => {
  const lastPrNumber = prNumber ?? previous?.lastPrNumber;
  const lastRotationTarget = target ?? previous?.lastRotationTarget;
  return lensCursorSchema.parse({
    lastCommitSha: commitSha,
    lastCommitDate: commitDate,
    ...(lastPrNumber !== undefined ? { lastPrNumber } : {}),
    ...(lastRotationTarget ? { lastRotationTarget } : {}),
    lastRunAt: runAt.toISOString(),
  });
};
