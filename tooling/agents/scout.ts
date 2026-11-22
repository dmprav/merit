import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { classifyChangedPaths } from "../verification/architecture/mechanisms.ts";
import { MAX_OPEN_PROPOSALS, SCOUT_LENSES, type ScoutLens } from "./proposal.ts";

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
      openProposedCount,
      maxOpenProposals: MAX_OPEN_PROPOSALS,
    };
  }

  return {
    status: "ready" as const,
    lens,
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

const ghStateIssueSchema = z.array(
  z.object({ number: z.number(), title: z.string(), body: z.string() }),
);

const ghIssueSummarySchema = z.array(
  z.object({
    number: z.number(),
    title: z.string(),
    labels: z.array(z.object({ name: z.string() })),
  }),
);

const fetchScoutStateIssue = (repoRoot: string) => {
  const raw = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--state",
      "open",
      "--search",
      `in:title "${SCOUT_STATE_ISSUE_TITLE}"`,
      "--json",
      "number,title,body",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const issues = ghStateIssueSchema.parse(JSON.parse(raw));
  const exact = issues.find((issue) => issue.title === SCOUT_STATE_ISSUE_TITLE);
  if (!exact) {
    throw new Error(`Missing pinned state issue titled "${SCOUT_STATE_ISSUE_TITLE}"`);
  }
  return exact;
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

const parseLensFlag = (args: readonly string[]): ScoutLens =>
  lensNameSchema.parse(readFlagValue(args, "--lens"));

const runContextCommand = (repoRoot: string, lens: ScoutLens) => {
  const stateIssue = fetchScoutStateIssue(repoRoot);
  const state = parseScoutState(stateIssue.body);
  const cursor = state[lens];

  const openProposedCount = ghIssueSummarySchema.parse(
    JSON.parse(
      execFileSync(
        "gh",
        [
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
        ],
        { cwd: repoRoot, encoding: "utf8" },
      ),
    ),
  ).length;

  const openIssues = ghIssueSummarySchema
    .parse(
      JSON.parse(
        execFileSync(
          "gh",
          ["issue", "list", "--state", "open", "--limit", "200", "--json", "number,title,labels"],
          { cwd: repoRoot, encoding: "utf8" },
        ),
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
        execFileSync(
          "gh",
          [
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
          ],
          { cwd: repoRoot, encoding: "utf8" },
        ),
      ),
    )
    .map(({ number, title }) => ({ number, title }));

  const now = new Date();
  const fallbackSinceIso = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
  const ref = "origin/main";
  const logArgs = buildCommitQueryArgs({
    cursor,
    isAncestor: (sha) => isCommitAncestor(repoRoot, sha, ref),
    fallbackSinceIso,
    ref,
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

  const trackedFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", ref], {
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
  const stateIssue = fetchScoutStateIssue(repoRoot);
  const state = parseScoutState(stateIssue.body);
  const commitSha =
    readFlagValue(args, "--commit") ??
    execFileSync("git", ["rev-parse", "origin/main"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const commitDate = execFileSync("git", ["show", "-s", "--format=%cI", commitSha], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const prRaw = readFlagValue(args, "--pr");
  const lastPrNumber = prRaw ? Number.parseInt(prRaw, 10) : state[lens]?.lastPrNumber;

  const nextCursor = lensCursorSchema.parse({
    lastCommitSha: commitSha,
    lastCommitDate: commitDate,
    ...(lastPrNumber !== undefined ? { lastPrNumber } : {}),
    lastRunAt: new Date().toISOString(),
  });
  const nextState: ScoutState = { ...state, [lens]: nextCursor };
  const nextBody = formatScoutStateBody(stateIssue.body, nextState);

  execFileSync("gh", ["issue", "edit", String(stateIssue.number), "--body", nextBody], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  console.log(JSON.stringify({ status: "advanced", lens, cursor: nextCursor }));
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const [command, ...rest] = process.argv.slice(2);
  const lens = parseLensFlag(rest);

  if (command === "context") {
    runContextCommand(repoRoot, lens);
    return;
  }
  if (command === "advance") {
    runAdvanceCommand(repoRoot, lens, rest);
    return;
  }
  throw new Error(`Unknown scout command "${command ?? ""}". Expected "context" or "advance".`);
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
