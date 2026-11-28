import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

import { canonicalPath } from "./paths.ts";

export type ExecGit = (cwd: string, args: readonly string[]) => string;

export type GitWorktreeEntry = {
  path: string;
  head?: string;
  branch?: string;
  locked?: boolean;
  prunable?: boolean;
};

export const defaultExecGit: ExecGit = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const splitPorcelain = (output: string): string[] =>
  output.includes("\0") ? output.split("\0") : output.split(/\r?\n/);

const readBranch = (ref: string): string =>
  ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;

const hasFlag = (line: string, flag: string): boolean =>
  line === flag || line.startsWith(`${flag} `);

const applyPorcelainAttribute = (entry: GitWorktreeEntry, line: string): void => {
  if (line.startsWith("HEAD ")) {
    entry.head = line.slice("HEAD ".length);
  } else if (line.startsWith("branch ")) {
    entry.branch = readBranch(line.slice("branch ".length));
  } else if (hasFlag(line, "locked")) {
    entry.locked = true;
  } else if (hasFlag(line, "prunable")) {
    entry.prunable = true;
  }
};

/** Parses `git worktree list --porcelain`, with or without `-z`, ignoring unknown attributes. */
export const parseGitWorktreePorcelain = (output: string): GitWorktreeEntry[] => {
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | null = null;
  for (const line of splitPorcelain(output)) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length) };
      entries.push(current);
    } else if (line === "") {
      current = null;
    } else if (current) {
      applyPorcelainAttribute(current, line);
    }
  }
  return entries;
};

/** Paths of the linked worktrees that still have a checkout, excluding the primary checkout. */
export const linkedCheckoutPaths = (
  entries: readonly GitWorktreeEntry[],
  primaryRepoRoot: string,
): string[] =>
  entries
    .filter((entry) => !entry.prunable && canonicalPath(entry.path) !== primaryRepoRoot)
    .map((entry) => entry.path);

export const describeExecError = (error: unknown): string => {
  const parts: string[] = [];
  if (error instanceof Error && error.message) {
    parts.push(error.message);
  }
  if (typeof error === "object" && error !== null && "stderr" in error) {
    const { stderr } = error;
    if (typeof stderr === "string") {
      parts.push(stderr);
    } else if (Buffer.isBuffer(stderr)) {
      parts.push(stderr.toString("utf8"));
    }
  }
  return parts.join("\n");
};

export const resolvePrimaryRepoRoot = (cwd: string, execGit: ExecGit = defaultExecGit): string => {
  const commonDir = execGit(cwd, ["rev-parse", "--git-common-dir"]).trim();
  const resolvedCommonDir = resolve(cwd, commonDir);
  if (resolvedCommonDir.endsWith("/.git") || resolvedCommonDir.endsWith("\\.git")) {
    return canonicalPath(dirname(resolvedCommonDir));
  }
  return canonicalPath(execGit(cwd, ["rev-parse", "--show-toplevel"]).trim());
};

/** The Git queries and commands worktree operations run against the primary repository. */
export type RepoGit = {
  root: string;
  run: (args: readonly string[]) => string;
  refExists: (ref: string) => boolean;
  branchExists: (branch: string) => boolean;
  worktrees: () => GitWorktreeEntry[];
  commonGitDir: () => string;
  currentBranch: () => string | null;
  resolveBaseRef: (requestedBase: string | undefined) => string;
};

const resolveBaseRef = (git: Pick<RepoGit, "refExists">, requestedBase: string | undefined) => {
  if (requestedBase) {
    if (!git.refExists(`${requestedBase}^{commit}`)) {
      throw new Error(`Base ref "${requestedBase}" does not resolve to a commit.`);
    }
    return requestedBase;
  }
  const defaultBase = ["origin/main", "main"].find((ref) => git.refExists(`${ref}^{commit}`));
  if (!defaultBase) {
    throw new Error(
      'Could not resolve default base ref ("origin/main" or "main"). Pass --base <ref>.',
    );
  }
  return defaultBase;
};

export const repoGit = (primaryRepoRoot: string, execGit: ExecGit): RepoGit => {
  const run = (args: readonly string[]) => execGit(primaryRepoRoot, args);

  const refExists = (ref: string) => {
    try {
      run(["rev-parse", "--verify", "--quiet", ref]);
      return true;
    } catch {
      return false;
    }
  };

  return {
    root: primaryRepoRoot,
    run,
    refExists,
    branchExists: (branch) => refExists(`refs/heads/${branch}`),
    worktrees: () => parseGitWorktreePorcelain(run(["worktree", "list", "--porcelain", "-z"])),
    commonGitDir: () =>
      canonicalPath(resolve(primaryRepoRoot, run(["rev-parse", "--git-common-dir"]).trim())),
    currentBranch: () => {
      try {
        return run(["branch", "--show-current"]).trim() || null;
      } catch {
        return null;
      }
    },
    resolveBaseRef: (requestedBase) => resolveBaseRef({ refExists }, requestedBase),
  };
};
