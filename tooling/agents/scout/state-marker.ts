// This module imports nothing, so `prune-verifications.ts` can read the state issue in a workflow
// that runs before dependencies are installed.

export const SCOUT_STATE_ISSUE_NUMBER = 219;
export const SCOUT_STATE_ISSUE_TITLE = "chore: agent scout state";

/** The `records` run's cursor key, and the lens key whose `lastPrNumber` seeds it. */
export const RECORDS_RUN_ID = "records";
export const LEGACY_RECORDS_KEY = "verification-flakes";

const STATE_MARKER_PATTERN = /<!--\s*merit-scout-state:\s*(\{[\s\S]*?\})\s*-->/;
const STATE_MARKER_PREFIX_PATTERN = /<!--\s*merit-scout-state:/;

export type MarkerEntries = Record<string, unknown>;

export type MarkerRead =
  | { kind: "absent" }
  | { kind: "parsed"; entries: MarkerEntries }
  | { kind: "corrupt"; error: string };

/** Reads the marker's JSON object as it is stored, before any cursor is validated. */
export const readMarker = (issueBody: string): MarkerRead => {
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
  return { kind: "parsed", entries: { ...raw } };
};

export const formatScoutStateBody = (existingBody: string, state: MarkerEntries): string => {
  const marker = `<!-- merit-scout-state: ${JSON.stringify(state)} -->`;
  if (STATE_MARKER_PATTERN.test(existingBody)) {
    // A function inserts the marker literally; a string would expand `$&` and similar patterns.
    return existingBody.replace(STATE_MARKER_PATTERN, () => marker);
  }
  const trimmed = existingBody.trimEnd();
  return `${trimmed}\n\n${marker}\n`;
};

/** A positive whole-number `lastPrNumber` from a stored cursor entry, or undefined. */
export const readLastPrNumber = (entry: unknown): number | undefined => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }
  const value = "lastPrNumber" in entry ? entry.lastPrNumber : undefined;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

/**
 * The last verification record pull request the `records` run read: its own cursor, or the old
 * `verification-flakes` lens cursor before the first `records` run.
 */
export const readRecordsLastPrNumber = (issueBody: string): number | null => {
  const read = readMarker(issueBody);
  if (read.kind !== "parsed") {
    return null;
  }
  return (
    readLastPrNumber(read.entries[RECORDS_RUN_ID]) ??
    readLastPrNumber(read.entries[LEGACY_RECORDS_KEY]) ??
    null
  );
};
