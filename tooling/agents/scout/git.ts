import { execFileSync } from "node:child_process";

import type { LensCursor } from "./state.ts";

/** The branch a scout run scans; its tip is the commit `advance` records. */
export const SCAN_REF = "origin/main";

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
};

/** The repository history and tree a scout run reads. */
export type GitPort = {
  /** Resolves a ref to its commit SHA. */
  revParse: (ref: string) => string;
  /** Resolves a revision to the full SHA of the commit it names, failing when it names none. */
  verifyCommit: (revision: string) => string;
  /** The committer date of `sha` in strict ISO 8601. */
  commitDate: (sha: string) => string;
  /** First-parent commits after the lens cursor up to `tipSha`, oldest first. */
  listCommitsSince: (query: {
    cursor: LensCursor | undefined;
    tipSha: string;
    fallbackSinceIso: string;
  }) => CommitSummary[];
  /** Paths a commit changed relative to its first parent. */
  filesChangedIn: (sha: string) => string[];
  /** Every path tracked at `sha`. */
  trackedFiles: (sha: string) => string[];
  /** Whether history is truncated, which makes hotspot and churn data partial. */
  isShallow: () => boolean;
  /** The commit the working tree is checked out at and every path that differs from it. */
  checkoutState: () => CheckoutState;
};

export const buildCommitQueryArgs = ({
  cursor,
  isAncestor,
  fallbackSinceIso,
  ref = SCAN_REF,
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
  const { headSha, changedPaths } = git.checkoutState();
  const problems = [
    ...(headSha === scanTipSha ? [] : [`is at ${headSha}`]),
    ...(changedPaths.length === 0
      ? []
      : [
          `has ${changedPaths.length} changed or untracked paths (${describeChangedPaths(changedPaths)})`,
        ]),
  ];
  if (problems.length > 0) {
    throw new Error(
      `Scout reads the working tree as scan tip ${scanTipSha}, but the checkout ${problems.join(" and ")}. ` +
        `Run "git switch --detach ${scanTipSha}" on a clean checkout and retry.`,
    );
  }
};

/** Reads history with the `git` command line in `repoRoot`. */
export const createGitPort = (repoRoot: string): GitPort => {
  const git = (args: readonly string[]) =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });

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

  return {
    revParse: (ref) => git(["rev-parse", ref]).trim(),
    verifyCommit: (revision) => git(["rev-parse", "--verify", `${revision}^{commit}`]).trim(),
    commitDate: (sha) => git(["show", "-s", "--format=%cI", sha]).trim(),
    listCommitsSince: ({ cursor, tipSha, fallbackSinceIso }) =>
      parseCommitLog(
        git(
          buildCommitQueryArgs({
            cursor,
            isAncestor: (sha) => isAncestor(sha, tipSha),
            fallbackSinceIso,
            ref: tipSha,
          }),
        ),
      ),
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
    }),
  };
};
