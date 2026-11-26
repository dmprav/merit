import { execFileSync } from "node:child_process";

import type { LensCursor } from "./state.ts";

/** The branch a scout run scans; its tip is the commit `advance` records. */
export const SCAN_REF = "origin/main";

export type CommitSummary = {
  sha: string;
  date: string;
  subject: string;
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
  };
};
