import { execFileSync } from "node:child_process";

import type { RunCursor } from "./state.ts";

/** The branch a scout run scans; its tip is the commit `advance` records. */
export const SCAN_REF = "origin/main";

/** Where a run's history starts: its cursor, or the lookback date when it has none. */
export type HistoryQuery = {
  cursor: RunCursor | undefined;
  tipSha: string;
  fallbackSinceIso: string;
};

/** Lines one commit added to and deleted from one path. */
export type ChurnEntry = {
  path: string;
  additions: number;
  deletions: number;
};

export type CommitSummary = {
  sha: string;
  date: string;
  subject: string;
};

/** The commit a checkout's HEAD names and the paths whose contents differ from it. */
export type CheckoutState = {
  headSha: string;
  /** Staged, unstaged, and untracked paths, which fallow and the reading agent would also see. */
  changedPaths: string[];
  /**
   * Tracked paths flagged skip-worktree (as a sparse checkout does) or assume-unchanged, whose
   * absence or edits `git status` does not report.
   */
  hiddenPaths: string[];
};

/** The repository history and tree a scout run reads. */
export type GitPort = {
  /** Resolves a ref to its commit SHA. */
  revParse: (ref: string) => string;
  /** Resolves a revision to the full SHA of the commit it names, failing when it names none. */
  verifyCommit: (revision: string) => string;
  /** The committer date of `sha` in strict ISO 8601. */
  commitDate: (sha: string) => string;
  /** First-parent commits after the run cursor up to `tipSha`, oldest first. */
  listCommitsSince: (query: HistoryQuery) => CommitSummary[];
  /** Per-path lines added and deleted by those same commits; binary files count as zero. */
  churnSince: (query: HistoryQuery) => ChurnEntry[];
  /** Paths a commit changed relative to its first parent. */
  filesChangedIn: (sha: string) => string[];
  /** Every path tracked at `sha`. */
  trackedFiles: (sha: string) => string[];
  /** Whether history is truncated, which makes hotspot and churn data partial. */
  isShallow: () => boolean;
  /** The commit the working tree is checked out at and every path that differs from it. */
  checkoutState: () => CheckoutState;
};

/** The revision range after a cursor commit still on the branch, else history since a date. */
const buildHistoryRange = ({
  cursor,
  isAncestor,
  fallbackSinceIso,
  ref = SCAN_REF,
}: {
  cursor: RunCursor | undefined;
  isAncestor: (sha: string) => boolean;
  fallbackSinceIso: string;
  ref?: string;
}): string[] =>
  cursor?.lastCommitSha && isAncestor(cursor.lastCommitSha)
    ? [`${cursor.lastCommitSha}..${ref}`]
    : [`--since=${cursor?.lastCommitDate ?? fallbackSinceIso}`, ref];

export const buildCommitQueryArgs = (query: Parameters<typeof buildHistoryRange>[0]): string[] => [
  "log",
  "--reverse",
  "--first-parent",
  "--format=%H\t%cI\t%s",
  ...buildHistoryRange(query),
];

/** The `git log` arguments that list per-path line counts for the same commits as `buildCommitQueryArgs`. */
export const buildChurnQueryArgs = (query: Parameters<typeof buildHistoryRange>[0]): string[] => [
  "-c",
  "core.quotePath=false",
  "log",
  "-m",
  "--first-parent",
  "--no-renames",
  "--numstat",
  "--format=",
  ...buildHistoryRange(query),
];

export const parseCommitLog = (raw: string): CommitSummary[] =>
  raw
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line): CommitSummary[] => {
      const [sha, date, ...rest] = line.split("\t");
      const subject = rest.join("\t");
      return sha && date ? [{ sha, date, subject }] : [];
    });

/** Reads `git log --numstat` lines (`<added>\t<deleted>\t<path>`); binary files report `-` and count as zero. */
export const parseChurn = (raw: string): ChurnEntry[] =>
  raw.split(/\r?\n/).flatMap((line): ChurnEntry[] => {
    const [additions, deletions, ...path] = line.split("\t");
    if (additions === undefined || deletions === undefined || path.length === 0) {
      return [];
    }
    if (!/^(?:\d+|-)$/.test(additions) || !/^(?:\d+|-)$/.test(deletions)) {
      return [];
    }
    return [
      {
        path: path.join("\t"),
        additions: Number.parseInt(additions, 10) || 0,
        deletions: Number.parseInt(deletions, 10) || 0,
      },
    ];
  });

// With `-z`, Git separates paths with NUL and leaves them unquoted, however unusual their names.
const splitPaths = (raw: string): string[] => raw.split("\0").filter(Boolean);

/**
 * Reads the paths from `git status --porcelain -z`. Each entry is `XY <path>`; a rename or copy is
 * followed by its source path as a separate entry, which is skipped.
 */
export const parseStatusPaths = (raw: string): string[] => {
  const entries = splitPaths(raw);
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? "";
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) {
      index += 1;
    }
  }
  return paths;
};

/**
 * Reads the paths `git ls-files -v -z` tags as hidden from `git status`: `S` marks skip-worktree, and
 * a lowercase tag marks assume-unchanged.
 */
export const parseHiddenPaths = (raw: string): string[] =>
  splitPaths(raw).flatMap((entry) => {
    const tag = entry.charAt(0);
    return tag === "S" || /[a-z]/.test(tag) ? [entry.slice(2)] : [];
  });

const MAX_LISTED_CHANGED_PATHS = 5;

const describeChangedPaths = (paths: readonly string[]): string => {
  const listed = paths.slice(0, MAX_LISTED_CHANGED_PATHS).join(", ");
  const rest = paths.length - MAX_LISTED_CHANGED_PATHS;
  return rest > 0 ? `${listed}, and ${rest} more` : listed;
};

/**
 * Refuses a checkout that is not a clean copy of `scanTipSha`. Telemetry and the reading agent both
 * read the working tree, so anything else would describe different code from the commit reported.
 */
export const assertCheckoutAt = (git: Pick<GitPort, "checkoutState">, scanTipSha: string): void => {
  const { headSha, changedPaths, hiddenPaths } = git.checkoutState();
  const elsewhere = headSha !== scanTipSha;
  const dirty = changedPaths.length > 0;
  const hiding = hiddenPaths.length > 0;
  if (!elsewhere && !dirty && !hiding) {
    return;
  }
  const problems = [
    ...(elsewhere ? [`is at ${headSha}`] : []),
    ...(dirty
      ? [
          `has ${changedPaths.length} changed or untracked paths (${describeChangedPaths(changedPaths)})`,
        ]
      : []),
    ...(hiding
      ? [
          `hides ${hiddenPaths.length} tracked paths from git status (${describeChangedPaths(hiddenPaths)})`,
        ]
      : []),
  ];
  const remedies = [
    ...(dirty ? ["commit, stash, or remove the changed paths"] : []),
    ...(hiding
      ? [
          'run "git sparse-checkout disable" or clear the paths\' skip-worktree and assume-unchanged flags',
        ]
      : []),
    ...(elsewhere ? [`run "git switch --detach ${scanTipSha}"`] : []),
  ];
  const remedy = remedies.join(", then ");
  throw new Error(
    `Scout reads the working tree as scan tip ${scanTipSha}, but the checkout ${problems.join(" and ")}. ` +
      `${remedy.charAt(0).toUpperCase()}${remedy.slice(1)} and retry.`,
  );
};

/** A week of per-path line counts outgrows Node's 1 MiB default output buffer. */
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/** Reads history with the `git` command line in `repoRoot`. */
export const createGitPort = (repoRoot: string): GitPort => {
  const git = (args: readonly string[]) =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER_BYTES });

  const isAncestor = (sha: string, ref: string): boolean => {
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

  const withAncestry = ({ cursor, tipSha, fallbackSinceIso }: HistoryQuery) => ({
    cursor,
    isAncestor: (sha: string) => isAncestor(sha, tipSha),
    fallbackSinceIso,
    ref: tipSha,
  });

  return {
    revParse: (ref) => git(["rev-parse", ref]).trim(),
    verifyCommit: (revision) => git(["rev-parse", "--verify", `${revision}^{commit}`]).trim(),
    commitDate: (sha) => git(["show", "-s", "--format=%cI", sha]).trim(),
    listCommitsSince: (query) => parseCommitLog(git(buildCommitQueryArgs(withAncestry(query)))),
    churnSince: (query) => parseChurn(git(buildChurnQueryArgs(withAncestry(query)))),
    filesChangedIn: (sha) =>
      splitPaths(
        git([
          "diff-tree",
          "-m",
          "--first-parent",
          "--root",
          "--no-commit-id",
          "--name-only",
          "-r",
          "-z",
          sha,
        ]),
      ),
    trackedFiles: (sha) => splitPaths(git(["ls-tree", "-r", "-z", "--name-only", sha])),
    isShallow: () => {
      try {
        return git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
      } catch {
        return false;
      }
    },
    checkoutState: () => ({
      headSha: git(["rev-parse", "HEAD"]).trim(),
      changedPaths: parseStatusPaths(
        git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      ),
      hiddenPaths: parseHiddenPaths(git(["ls-files", "-v", "-z"])),
    }),
  };
};
