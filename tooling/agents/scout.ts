import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { classifyChangedPaths } from "../verification/architecture/mechanisms.ts";
import { MAX_OPEN_PROPOSALS, runScoutGh, SCOUT_LENSES, type ScoutLens } from "./proposal.ts";

export const SCOUT_STATE_ISSUE_NUMBER = 219;
export const SCOUT_STATE_ISSUE_TITLE = "chore: agent scout state";
const ROTATION_EPOCH_UTC_MS = Date.UTC(2026, 10, 13);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STATE_MARKER_PATTERN = /<!--\s*merit-scout-state:\s*(\{[\s\S]*?\})\s*-->/;

export const lensCursorSchema = z.object({
  lastCommitSha: z.string().min(7).optional(),
  lastCommitDate: z.string().min(10).optional(),
  lastPrNumber: z.number().int().positive().optional(),
  lastRunAt: z.string().min(10),
});

export type LensCursor = z.infer<typeof lensCursorSchema>;

export type ScoutState = Partial<Record<ScoutLens, LensCursor>>;

export type CommitSummary = {
  sha: string;
  date: string;
  subject: string;
};

export type VerificationFileEntry = {
  prNumber: number;
  path: string;
};

const lensNameSchema = z.enum(SCOUT_LENSES);

export const LENS_TARGET_INTERVAL_DAYS: Record<ScoutLens, number> = {
  docs: 2,
  tests: 2,
  "verification-flakes": 3,
  architecture: 4,
  simplification: 5,
  security: 5,
  "mcp-db": 5,
};

export type AutoLensSelection =
  | {
      due: true;
      lens: ScoutLens;
      targetIntervalDays: number;
      lastRunAt: string | null;
    }
  | {
      due: false;
      nextLens: ScoutLens;
      nextDueInHours: number;
    };

/** Picks the most overdue lens relative to its target cadence, or reports the next due lens when all are fresh. */
export const selectAutoLens = ({
  state,
  nowMs,
}: {
  state: ScoutState;
  nowMs: number;
}): AutoLensSelection => {
  let mostOverdue: {
    lens: ScoutLens;
    overdueRatio: number;
    targetIntervalDays: number;
    lastRunAt: string | null;
  } | null = null;
  let soonestUpcoming: { lens: ScoutLens; remainingMs: number } | null = null;

  for (const lens of SCOUT_LENSES) {
    const targetIntervalDays = LENS_TARGET_INTERVAL_DAYS[lens];
    const targetMs = targetIntervalDays * MS_PER_DAY;
    const cursor = state[lens];
    const lastRunMs = cursor ? Date.parse(cursor.lastRunAt) : Number.NaN;

    if (!cursor || Number.isNaN(lastRunMs)) {
      return {
        due: true,
        lens,
        targetIntervalDays,
        lastRunAt: null,
      };
    }

    const ageMs = Math.max(0, nowMs - lastRunMs);
    const overdueRatio = ageMs / targetMs;
    if (overdueRatio >= 1 && (!mostOverdue || overdueRatio > mostOverdue.overdueRatio)) {
      mostOverdue = {
        lens,
        overdueRatio,
        targetIntervalDays,
        lastRunAt: cursor.lastRunAt,
      };
    }

    const remainingMs = Math.max(0, lastRunMs + targetMs - nowMs);
    if (!soonestUpcoming || remainingMs < soonestUpcoming.remainingMs) {
      soonestUpcoming = { lens, remainingMs };
    }
  }

  if (mostOverdue) {
    return {
      due: true,
      lens: mostOverdue.lens,
      targetIntervalDays: mostOverdue.targetIntervalDays,
      lastRunAt: mostOverdue.lastRunAt,
    };
  }

  const nextLens = soonestUpcoming?.lens ?? SCOUT_LENSES[0];
  const nextDueInHours = Math.ceil((soonestUpcoming?.remainingMs ?? 0) / (60 * 60 * 1000));
  return {
    due: false,
    nextLens,
    nextDueInHours,
  };
};

/** Parses each lens cursor independently so one corrupt entry cannot wipe sibling lenses. */
export const parseScoutState = (issueBody: string): ScoutState => {
  const match = STATE_MARKER_PATTERN.exec(issueBody);
  if (!match?.[1]) {
    return {};
  }
  try {
    const raw: unknown = JSON.parse(match[1]);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const state: ScoutState = {};
    for (const [key, value] of Object.entries(raw)) {
      const lensResult = lensNameSchema.safeParse(key);
      const cursorResult = lensCursorSchema.safeParse(value);
      if (lensResult.success && cursorResult.success) {
        state[lensResult.data] = cursorResult.data;
      }
    }
    return state;
  } catch {
    return {};
  }
};

export const formatScoutStateBody = (existingBody: string, state: ScoutState): string => {
  const marker = `<!-- merit-scout-state: ${JSON.stringify(state)} -->`;
  if (STATE_MARKER_PATTERN.test(existingBody)) {
    return existingBody.replace(STATE_MARKER_PATTERN, marker);
  }
  const trimmed = existingBody.trimEnd();
  return `${trimmed}\n\n${marker}\n`;
};

export const pickRotationItem = (items: readonly string[], now: Date): string | null => {
  const sorted = [...new Set(items)].sort();
  if (sorted.length === 0) {
    return null;
  }
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((todayUtcMs - ROTATION_EPOCH_UTC_MS) / MS_PER_DAY);
  const index = ((days % sorted.length) + sorted.length) % sorted.length;
  return sorted[index] ?? null;
};

export const listDocAreas = (trackedFiles: readonly string[]): string[] => {
  const areas = new Set<string>();
  for (const filePath of trackedFiles) {
    if (!/\.(?:md|mdx)$/.test(filePath)) {
      continue;
    }
    if (
      filePath.startsWith(".github/") ||
      filePath.startsWith(".agents/") ||
      filePath.startsWith("verifications/")
    ) {
      continue;
    }
    const parts = filePath.split("/");
    areas.add(parts.length <= 2 ? "." : `${parts[0]}/${parts[1]}`);
  }
  return [...areas].sort();
};

export const listPackageSlices = (trackedFiles: readonly string[]): string[] => {
  const slices = new Set<string>();
  for (const filePath of trackedFiles) {
    const parts = filePath.split("/");
    if (
      (parts[0] === "capabilities" || parts[0] === "foundation" || parts[0] === "interfaces") &&
      parts[1]
    ) {
      slices.add(`${parts[0]}/${parts[1]}`);
    } else if (filePath.startsWith("tooling/testing/")) {
      slices.add("tooling/testing");
    }
  }
  return [...slices].sort();
};

export const collectUnreadVerifications = (
  trackedFiles: readonly string[],
  lastPrNumber: number | undefined,
): VerificationFileEntry[] => {
  const minPr = lastPrNumber ?? 0;
  const entries: VerificationFileEntry[] = [];
  for (const filePath of trackedFiles) {
    const match = /^verifications\/(\d+)\.md$/.exec(filePath);
    if (!match?.[1]) {
      continue;
    }
    const prNumber = Number.parseInt(match[1], 10);
    if (prNumber > minPr) {
      entries.push({ prNumber, path: filePath });
    }
  }
  return entries.sort((a, b) => a.prNumber - b.prNumber);
};

export const buildCommitQueryArgs = ({
  cursor,
  isAncestor,
  fallbackSinceIso,
  ref = "origin/main",
}: {
  cursor: LensCursor | undefined;
  isAncestor: (sha: string) => boolean;
  fallbackSinceIso: string;
  ref?: string;
}): string[] => {
  if (cursor?.lastCommitSha && isAncestor(cursor.lastCommitSha)) {
    return [
      "log",
      "--reverse",
      "--first-parent",
      "--format=%H\t%cI\t%s",
      `${cursor.lastCommitSha}..${ref}`,
    ];
  }
  const since = cursor?.lastCommitDate ?? fallbackSinceIso;
  return ["log", "--reverse", "--first-parent", `--since=${since}`, "--format=%H\t%cI\t%s", ref];
};

export const parseCommitLog = (raw: string): CommitSummary[] =>
  raw
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line): CommitSummary[] => {
      const [sha, date, ...rest] = line.split("\t");
      const subject = rest.join("\t");
      return sha && date ? [{ sha, date, subject }] : [];
    });

export const buildScoutContext = ({
  lens,
  cursor,
  scanTipSha,
  openProposedCount,
  commits,
  changedFiles,
  rotationTarget,
  unreadVerifications,
  openIssues,
  wontfixIssues,
}: {
  lens: ScoutLens;
  cursor: LensCursor | undefined;
  scanTipSha: string;
  openProposedCount: number;
  commits: readonly CommitSummary[];
  changedFiles: readonly string[];
  rotationTarget: string | null;
  unreadVerifications: readonly VerificationFileEntry[];
  openIssues: ReadonlyArray<{ number: number; title: string; labels: string[] }>;
  wontfixIssues: ReadonlyArray<{ number: number; title: string }>;
}) => {
  if (openProposedCount >= MAX_OPEN_PROPOSALS) {
    return {
      status: "cap_reached" as const,
      lens,
      scanTipSha,
      openProposedCount,
      maxOpenProposals: MAX_OPEN_PROPOSALS,
    };
  }

  return {
    status: "ready" as const,
    lens,
    scanTipSha,
    cursor: cursor ?? null,
    openProposedCount,
    maxOpenProposals: MAX_OPEN_PROPOSALS,
    commits,
    changedFiles,
    matchedMechanisms: classifyChangedPaths({ paths: changedFiles }),
    rotationTarget,
    unreadVerifications,
    openIssues,
    wontfixIssues,
  };
};

const ghStateIssueSchema = z.object({
  number: z.number(),
  state: z.string(),
  title: z.string(),
  body: z.string(),
});

const ghIssueSummarySchema = z.array(
  z.object({
    number: z.number(),
    title: z.string(),
    labels: z.array(z.object({ name: z.string() })),
  }),
);

const fetchScoutStateIssue = (repoRoot: string) => {
  const raw = runScoutGh(repoRoot, [
    "issue",
    "view",
    String(SCOUT_STATE_ISSUE_NUMBER),
    "--json",
    "number,state,title,body",
  ]);
  const issue = ghStateIssueSchema.parse(JSON.parse(raw));
  if (issue.state !== "OPEN" || issue.title !== SCOUT_STATE_ISSUE_TITLE) {
    throw new Error(
      `Pinned scout state issue #${SCOUT_STATE_ISSUE_NUMBER} must be OPEN and titled "${SCOUT_STATE_ISSUE_TITLE}" (got ${issue.state}: "${issue.title}").`,
    );
  }
  return issue;
};

const isCommitAncestor = (repoRoot: string, sha: string, ref: string): boolean => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, ref], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const readFlagValue = (args: readonly string[], flag: string): string | null => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
};

export const parseContextLensFlag = (args: readonly string[]): ScoutLens | "auto" => {
  const raw = readFlagValue(args, "--lens");
  if (raw === "auto") {
    return "auto";
  }
  return lensNameSchema.parse(raw);
};

export const parseAdvanceLensFlag = (args: readonly string[]): ScoutLens => {
  const raw = readFlagValue(args, "--lens");
  if (raw === "auto") {
    throw new Error(
      'Cannot pass "--lens auto" to advance. Pass the explicit lens emitted by "scout.ts context".',
    );
  }
  return lensNameSchema.parse(raw);
};

const runContextCommand = (repoRoot: string, requestedLens: ScoutLens | "auto") => {
  const stateIssue = fetchScoutStateIssue(repoRoot);
  const state = parseScoutState(stateIssue.body);
  const now = new Date();
  let lens: ScoutLens;
  if (requestedLens === "auto") {
    const selection = selectAutoLens({ state, nowMs: now.getTime() });
    if (!selection.due) {
      console.log(
        JSON.stringify(
          {
            status: "idle",
            reason: "all_lenses_fresh",
            nextLens: selection.nextLens,
            nextDueInHours: selection.nextDueInHours,
          },
          null,
          2,
        ),
      );
      return;
    }
    lens = selection.lens;
  } else {
    lens = requestedLens;
  }
  const cursor = state[lens];

  const openProposedCount = ghIssueSummarySchema.parse(
    JSON.parse(
      runScoutGh(repoRoot, [
        "issue",
        "list",
        "--state",
        "open",
        "--label",
        "agent:proposed",
        "--limit",
        "200",
        "--json",
        "number,title,labels",
      ]),
    ),
  ).length;

  const openIssues = ghIssueSummarySchema
    .parse(
      JSON.parse(
        runScoutGh(repoRoot, [
          "issue",
          "list",
          "--state",
          "open",
          "--limit",
          "200",
          "--json",
          "number,title,labels",
        ]),
      ),
    )
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      labels: issue.labels.map((label) => label.name),
    }));

  const wontfixIssues = ghIssueSummarySchema
    .parse(
      JSON.parse(
        runScoutGh(repoRoot, [
          "issue",
          "list",
          "--state",
          "closed",
          "--label",
          "wontfix",
          "--limit",
          "200",
          "--json",
          "number,title,labels",
        ]),
      ),
    )
    .map(({ number, title }) => ({ number, title }));

  const fallbackSinceIso = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
  const scanTipSha = execFileSync("git", ["rev-parse", "origin/main"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const logArgs = buildCommitQueryArgs({
    cursor,
    isAncestor: (sha) => isCommitAncestor(repoRoot, sha, scanTipSha),
    fallbackSinceIso,
    ref: scanTipSha,
  });
  const commits = parseCommitLog(execFileSync("git", logArgs, { cwd: repoRoot, encoding: "utf8" }));

  const changedFilesSet = new Set<string>();
  for (const commit of commits) {
    const filesRaw = execFileSync(
      "git",
      [
        "diff-tree",
        "-m",
        "--first-parent",
        "--root",
        "--no-commit-id",
        "--name-only",
        "-r",
        commit.sha,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    for (const filePath of filesRaw.split(/\r?\n/).filter(Boolean)) {
      changedFilesSet.add(filePath);
    }
  }

  const trackedFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", scanTipSha], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const rotationTarget =
    lens === "docs"
      ? pickRotationItem(listDocAreas(trackedFiles), now)
      : lens === "tests"
        ? pickRotationItem(listPackageSlices(trackedFiles), now)
        : null;
  const unreadVerifications =
    lens === "verification-flakes"
      ? collectUnreadVerifications(trackedFiles, cursor?.lastPrNumber)
      : [];

  const context = buildScoutContext({
    lens,
    cursor,
    scanTipSha,
    openProposedCount,
    commits,
    changedFiles: [...changedFilesSet].sort(),
    rotationTarget,
    unreadVerifications,
    openIssues,
    wontfixIssues,
  });
  console.log(JSON.stringify(context, null, 2));
};

const runAdvanceCommand = (repoRoot: string, lens: ScoutLens, args: readonly string[]) => {
  const commitSha = readFlagValue(args, "--commit");
  if (!commitSha) {
    throw new Error(
      'Missing required --commit <scanTipSha> flag. Pass the scanTipSha emitted by "scout.ts context".',
    );
  }
  const stateIssue = fetchScoutStateIssue(repoRoot);
  const state = parseScoutState(stateIssue.body);
  const resolvedSha = execFileSync("git", ["rev-parse", "--verify", `${commitSha}^{commit}`], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const commitDate = execFileSync("git", ["show", "-s", "--format=%cI", resolvedSha], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const prRaw = readFlagValue(args, "--pr");
  const lastPrNumber = prRaw ? Number.parseInt(prRaw, 10) : state[lens]?.lastPrNumber;

  const nextCursor = lensCursorSchema.parse({
    lastCommitSha: resolvedSha,
    lastCommitDate: commitDate,
    ...(lastPrNumber !== undefined ? { lastPrNumber } : {}),
    lastRunAt: new Date().toISOString(),
  });
  const nextState: ScoutState = { ...state, [lens]: nextCursor };
  const nextBody = formatScoutStateBody(stateIssue.body, nextState);

  runScoutGh(repoRoot, ["issue", "edit", String(stateIssue.number), "--body", nextBody]);
  console.log(JSON.stringify({ status: "advanced", lens, cursor: nextCursor }));
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const [command, ...rest] = process.argv.slice(2);

  if (command === "context") {
    runContextCommand(repoRoot, parseContextLensFlag(rest));
    return;
  }
  if (command === "advance") {
    runAdvanceCommand(repoRoot, parseAdvanceLensFlag(rest), rest);
    return;
  }
  throw new Error(`Unknown scout command "${command ?? ""}". Expected "context" or "advance".`);
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
