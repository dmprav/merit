import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// state-marker.ts imports nothing, so this file still runs before dependencies are installed.
import {
  readRecordsLastPrNumber,
  SCOUT_STATE_ISSUE_NUMBER,
  SCOUT_STATE_ISSUE_TITLE,
} from "./scout/state-marker.ts";

export const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VERIFICATION_FILE_PATTERN = /^verifications\/(\d+)\.md$/;

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

const PRUNE_USAGE =
  "Usage: prune-verifications.ts [--paths] [--retention-days <days>] [--ref <revision>]";

// This file runs before dependencies are installed, so it uses `util.parseArgs` directly.
const readPruneFlags = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: args[0] === "--" ? args.slice(1) : [...args],
      options: {
        paths: { type: "boolean" },
        "retention-days": { type: "string" },
        ref: { type: "string" },
      },
      strict: true,
    }).values;
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${PRUNE_USAGE}`, {
      cause: error,
    });
  }
};

/** Strictly validates CLI flags so typos or invalid retention values fail fast instead of failing open. */
export const parsePruneCliArgs = (args: readonly string[]): PruneCliOptions => {
  const values = readPruneFlags(args);
  const rawDays = values["retention-days"];
  const retentionDays = rawDays === undefined ? RETENTION_DAYS : Number(rawDays);
  if (
    rawDays !== undefined &&
    (!/^[1-9]\d*$/.test(rawDays) || !Number.isSafeInteger(retentionDays))
  ) {
    throw new Error(`--retention-days must be a positive integer (got "${rawDays}").`);
  }
  if (values.ref === "") {
    throw new Error("--ref must be a non-empty git revision.");
  }
  return { pathsOnly: values.paths ?? false, retentionDays, ref: values.ref ?? "HEAD" };
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
  const lastScoutedPr = readRecordsLastPrNumber(issueBody);
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
