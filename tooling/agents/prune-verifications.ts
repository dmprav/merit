import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCOUT_STATE_ISSUE_NUMBER = 219;
export const SCOUT_STATE_ISSUE_TITLE = "chore: agent scout state";
export const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STATE_MARKER_PATTERN = /<!--\s*merit-scout-state:\s*(\{[\s\S]*?\})\s*-->/;
const VERIFICATION_FILE_PATTERN = /^verifications\/(\d+)\.md$/;
const POSITIVE_INT_PATTERN = /^\d+$/;

export type VerificationRecordEntry = {
  path: string;
  prNumber: number;
  lastCommitMs: number;
};

export type PruneCliOptions = {
  pathsOnly: boolean;
  retentionDays: number;
  ref: string;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Strictly validates CLI flags so typos or invalid retention values fail fast instead of failing open. */
export const parsePruneCliArgs = (args: readonly string[]): PruneCliOptions => {
  let pathsOnly = false;
  let retentionDays = RETENTION_DAYS;
  let ref = "HEAD";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--paths") {
      pathsOnly = true;
      continue;
    }
    if (arg === "--retention-days") {
      const value = args[index + 1];
      if (!value || !POSITIVE_INT_PATTERN.test(value)) {
        throw new Error("--retention-days must be a positive integer.");
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error("--retention-days must be a positive integer.");
      }
      retentionDays = parsed;
      index += 1;
      continue;
    }
    if (arg === "--ref") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--ref must be a non-empty git revision.");
      }
      ref = value;
      index += 1;
      continue;
    }
    throw new Error(
      `Unknown argument "${arg ?? ""}". Expected --paths, --retention-days, or --ref.`,
    );
  }

  return { pathsOnly, retentionDays, ref };
};

/** Extracts `verification-flakes.lastPrNumber` from issue #219, failing closed to `null`. */
export const extractVerificationFlakesLastPr = (issueBody: string): number | null => {
  const match = STATE_MARKER_PATTERN.exec(issueBody);
  if (!match?.[1]) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!isPlainRecord(parsed)) {
      return null;
    }
    const lensEntry = parsed["verification-flakes"];
    if (!isPlainRecord(lensEntry)) {
      return null;
    }
    const lastPrNumber = lensEntry.lastPrNumber;
    if (
      typeof lastPrNumber !== "number" ||
      !Number.isSafeInteger(lastPrNumber) ||
      lastPrNumber <= 0
    ) {
      return null;
    }
    return lastPrNumber;
  } catch {
    return null;
  }
};

export const selectPrunableVerifications = ({
  records,
  lastScoutedPr,
  nowMs,
  retentionDays = RETENTION_DAYS,
}: {
  records: readonly VerificationRecordEntry[];
  lastScoutedPr: number | null;
  nowMs: number;
  retentionDays?: number;
}): string[] => {
  if (
    lastScoutedPr === null ||
    !Number.isSafeInteger(lastScoutedPr) ||
    lastScoutedPr <= 0 ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(retentionDays) ||
    retentionDays <= 0
  ) {
    return [];
  }
  const minAgeMs = retentionDays * MS_PER_DAY;
  const prunable: VerificationRecordEntry[] = [];
  for (const record of records) {
    const match = VERIFICATION_FILE_PATTERN.exec(record.path);
    if (!match?.[1]) {
      continue;
    }
    const parsedPr = Number.parseInt(match[1], 10);
    if (parsedPr !== record.prNumber || parsedPr > lastScoutedPr) {
      continue;
    }
    if (!Number.isFinite(record.lastCommitMs) || !(nowMs - record.lastCommitMs >= minAgeMs)) {
      continue;
    }
    prunable.push(record);
  }
  return prunable.toSorted((a, b) => a.prNumber - b.prNumber).map((entry) => entry.path);
};

const fetchScoutStateBody = (repoRoot: string): string => {
  const raw = execFileSync(
    "gh",
    ["issue", "view", String(SCOUT_STATE_ISSUE_NUMBER), "--json", "state,title,body"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  const parsed: unknown = JSON.parse(raw);
  if (
    !isPlainRecord(parsed) ||
    parsed.state !== "OPEN" ||
    parsed.title !== SCOUT_STATE_ISSUE_TITLE ||
    typeof parsed.body !== "string"
  ) {
    throw new Error(
      `Pinned scout state issue #${SCOUT_STATE_ISSUE_NUMBER} must be open with title "${SCOUT_STATE_ISSUE_TITLE}".`,
    );
  }
  return parsed.body;
};

const listTrackedVerificationRecords = (
  repoRoot: string,
  ref: string,
): VerificationRecordEntry[] => {
  const tracked = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", "verifications"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  )
    .split(/\r?\n/)
    .filter(Boolean);

  const records: VerificationRecordEntry[] = [];
  for (const filePath of tracked) {
    const match = VERIFICATION_FILE_PATTERN.exec(filePath);
    if (!match?.[1]) {
      continue;
    }
    const prNumber = Number.parseInt(match[1], 10);
    const epochSecondsRaw = execFileSync(
      "git",
      ["log", "-1", "--format=%ct", ref, "--", filePath],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    ).trim();
    const epochSeconds = Number.parseInt(epochSecondsRaw, 10);
    if (!Number.isSafeInteger(epochSeconds) || epochSeconds <= 0) {
      continue;
    }
    records.push({
      path: filePath,
      prNumber,
      lastCommitMs: epochSeconds * 1000,
    });
  }
  return records;
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const { pathsOnly, retentionDays, ref } = parsePruneCliArgs(process.argv.slice(2));

  const issueBody = fetchScoutStateBody(repoRoot);
  const lastScoutedPr = extractVerificationFlakesLastPr(issueBody);
  const records = listTrackedVerificationRecords(repoRoot, ref);
  const prunable = selectPrunableVerifications({
    records,
    lastScoutedPr,
    nowMs: Date.now(),
    retentionDays,
  });

  if (pathsOnly) {
    for (const filePath of prunable) {
      console.log(filePath);
    }
    return;
  }

  console.log(
    JSON.stringify(
      {
        ref,
        lastScoutedPr,
        retentionDays,
        prunable,
      },
      null,
      2,
    ),
  );
};

if (import.meta.main) {
  runCli();
}
