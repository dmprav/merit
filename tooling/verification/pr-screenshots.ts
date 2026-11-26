import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { normalizeRepoPath, readFlagValue } from "../cli.ts";
import { parseNameStatusZ } from "./agent-policy.ts";

export const SCREENSHOT_BRANCH = "ci/pr-screenshots";
export const MAX_SCREENSHOT_STORIES = 8;

const STORYBOOK_REL_DIR = "tooling/storybook";
const MAX_PUSH_RETRIES = 3;

export const storybookIndexEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  name: z.string().default(""),
  type: z.string().optional(),
  importPath: z.string().optional(),
});

export const storybookIndexSchema = z.object({
  entries: z.record(z.string(), storybookIndexEntrySchema),
});

export type StorybookIndexEntry = z.infer<typeof storybookIndexEntrySchema>;

export const prScreenshotSchema = z.object({
  storyId: z.string().min(1),
  title: z.string(),
  name: z.string(),
  url: z.string().url(),
  passed: z.boolean(),
});

export const prScreenshotManifestSchema = z.object({
  screenshots: z.array(prScreenshotSchema),
  omittedCount: z.number().int().nonnegative(),
});

export type PrScreenshot = z.infer<typeof prScreenshotSchema>;

export type PrScreenshotManifest = z.infer<typeof prScreenshotManifestSchema>;

const uiVerifySubsetSchema = z.object({
  targets: z.array(
    z.object({
      kind: z.enum(["story", "route"]),
      target: z.string(),
      name: z.string(),
      viewport: z.enum(["desktop", "mobile"]),
      passed: z.boolean(),
      screenshot: z.string().nullable(),
    }),
  ),
});

/** Resolves a Storybook `index.json` `importPath` (relative to `tooling/storybook`) to a repo path. */
export const resolveStoryImportPath = (importPath: string): string =>
  normalizeRepoPath(posix.normalize(posix.join(STORYBOOK_REL_DIR, importPath)));

const isUiRelevantPath = (path: string) =>
  path.endsWith(".stories.tsx") ||
  path.startsWith("foundation/ui/src/") ||
  /^capabilities\/[^/]+\/web\/src\//u.test(path) ||
  /^interfaces\/(?:product|admin)\/src\//u.test(path);

const parentDirectoriesWithinSrc = (filePath: string): string[] => {
  const dirs: string[] = [];
  let current = posix.dirname(normalizeRepoPath(filePath));
  while (current && current !== "." && current !== "/") {
    dirs.push(current);
    if (current.endsWith("/src")) {
      break;
    }
    const next = posix.dirname(current);
    if (next === current) {
      break;
    }
    current = next;
  }
  return dirs;
};

export type SelectedStory = {
  id: string;
  title: string;
  name: string;
  storyFile: string;
};

/**
 * Selects affected desktop Storybook stories for changed PR paths:
 * 1. Directly changed `*.stories.tsx` files
 * 2. Stories in the same or nearest parent directory of changed UI source files
 * Round-robins across matched story files so every changed component/screen gets
 * its primary story represented before taking extra variants.
 */
export const selectStoriesForPr = ({
  changedPaths,
  indexEntries,
  maxStories = MAX_SCREENSHOT_STORIES,
}: {
  changedPaths: readonly string[];
  indexEntries: Readonly<Record<string, StorybookIndexEntry>>;
  maxStories?: number;
}): { selected: SelectedStory[]; omittedCount: number } => {
  const normalizedChanged = [...new Set(changedPaths.map(normalizeRepoPath).filter(Boolean))];
  const uiChanged = normalizedChanged.filter(isUiRelevantPath);
  if (uiChanged.length === 0) {
    return { selected: [], omittedCount: 0 };
  }

  const storiesByFile = new Map<string, SelectedStory[]>();
  for (const entry of Object.values(indexEntries)) {
    if (entry.type !== "story" || !entry.importPath) {
      continue;
    }
    const storyFile = resolveStoryImportPath(entry.importPath);
    const list = storiesByFile.get(storyFile) ?? [];
    list.push({
      id: entry.id,
      title: entry.title,
      name: entry.name,
      storyFile,
    });
    storiesByFile.set(storyFile, list);
  }

  const matchedFiles = new Set<string>();
  const changedStoryFiles = uiChanged.filter((p) => p.endsWith(".stories.tsx"));
  for (const storyFile of changedStoryFiles) {
    if (storiesByFile.has(storyFile)) {
      matchedFiles.add(storyFile);
    }
  }

  const storiesByDir = new Map<string, string[]>();
  for (const storyFile of storiesByFile.keys()) {
    const dir = posix.dirname(storyFile);
    const existing = storiesByDir.get(dir) ?? [];
    existing.push(storyFile);
    storiesByDir.set(dir, existing);
  }

  const nonStoryUiFiles = uiChanged.filter((p) => !p.endsWith(".stories.tsx"));
  for (const filePath of nonStoryUiFiles) {
    for (const dir of parentDirectoriesWithinSrc(filePath)) {
      const siblingStories = storiesByDir.get(dir);
      if (siblingStories && siblingStories.length > 0) {
        for (const storyFile of siblingStories) {
          matchedFiles.add(storyFile);
        }
        break;
      }
    }
  }

  const orderedFiles = [...matchedFiles].sort();
  if (orderedFiles.length === 0) {
    return { selected: [], omittedCount: 0 };
  }

  const queues = orderedFiles.map((file) => [...(storiesByFile.get(file) ?? [])]);
  const totalAvailable = queues.reduce((sum, q) => sum + q.length, 0);
  const selected: SelectedStory[] = [];

  while (selected.length < maxStories) {
    let progressed = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        selected.push(next);
        progressed = true;
        if (selected.length >= maxStories) {
          break;
        }
      }
    }
    if (!progressed) {
      break;
    }
  }

  return { selected, omittedCount: Math.max(0, totalAvailable - selected.length) };
};

export const buildScreenshotRawUrl = ({
  repo,
  commitSha,
  prNumber,
  filename,
}: {
  repo: string;
  commitSha: string;
  prNumber: number;
  filename: string;
}): string =>
  `https://raw.githubusercontent.com/${repo}/${commitSha}/pr-${prNumber}/${encodeURIComponent(filename)}`;

const runGit = (
  cwd: string,
  args: readonly string[],
  extraEnv?: Readonly<Record<string, string>>,
): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  });

const tryGit = (
  cwd: string,
  args: readonly string[],
  extraEnv?: Readonly<Record<string, string>>,
): boolean => {
  try {
    runGit(cwd, args, extraEnv);
    return true;
  } catch {
    return false;
  }
};

const createGitAuthEnv = (
  workDir: string,
  token: string | undefined,
): Record<string, string> | undefined => {
  if (!token) {
    return undefined;
  }
  const askpassPath = join(workDir, "git-askpass.sh");
  writeFileSync(
    askpassPath,
    '#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s\\n" "x-access-token" ;;\n  *) printf "%s\\n" "$MERIT_GIT_TOKEN" ;;\nesac\n',
    "utf8",
  );
  chmodSync(askpassPath, 0o700);
  return {
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: askpassPath,
    MERIT_GIT_TOKEN: token,
  };
};

const configureBotGit = (cwd: string) => {
  runGit(cwd, ["config", "user.name", "github-actions[bot]"]);
  runGit(cwd, ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
};

const copyOtherPrDirs = (sourceDir: string, targetDir: string, excludeDirName: string) => {
  if (!existsSync(sourceDir)) {
    return;
  }
  for (const entry of readdirSync(sourceDir)) {
    if (entry === ".git" || entry === excludeDirName || !entry.startsWith("pr-")) {
      continue;
    }
    cpSync(join(sourceDir, entry), join(targetDir, entry), { recursive: true });
  }
};

/**
 * Publishes `pr-<prNumber>/*.png` to a single squashed orphan commit on `branch`
 * so PNG history never accumulates across pushes while preserving other open PRs' directories.
 */
export const publishScreenshotsToOrphanBranch = ({
  remoteUrl,
  prNumber,
  files,
  branch = SCREENSHOT_BRANCH,
  token,
}: {
  remoteUrl: string;
  prNumber: number;
  files: ReadonlyArray<{ filename: string; sourcePath: string }>;
  branch?: string;
  token?: string;
}): { commitSha: string } => {
  const prDirName = `pr-${prNumber}`;

  for (let attempt = 1; attempt <= MAX_PUSH_RETRIES; attempt += 1) {
    const workDir = mkdtempSync(join(tmpdir(), "merit-pr-shots-"));
    const existingDir = join(workDir, "existing");
    const nextDir = join(workDir, "next");
    try {
      const authEnv = createGitAuthEnv(workDir, token);
      runGit(workDir, ["init", "--quiet", existingDir]);
      runGit(existingDir, ["remote", "add", "origin", remoteUrl]);
      const hadBranch = tryGit(existingDir, ["fetch", "--depth=1", "origin", branch], authEnv);
      if (hadBranch) {
        runGit(existingDir, ["checkout", "--quiet", "FETCH_HEAD"]);
      }

      runGit(workDir, ["init", "--quiet", nextDir]);
      configureBotGit(nextDir);
      runGit(nextDir, ["remote", "add", "origin", remoteUrl]);
      runGit(nextDir, ["checkout", "--quiet", "--orphan", branch]);

      if (hadBranch) {
        copyOtherPrDirs(existingDir, nextDir, prDirName);
      }

      const targetPrDir = join(nextDir, prDirName);
      rmSync(targetPrDir, { recursive: true, force: true });
      for (const file of files) {
        cpSync(file.sourcePath, join(targetPrDir, file.filename), { force: true });
      }

      runGit(nextDir, ["add", "."]);
      runGit(nextDir, ["commit", "--quiet", "-m", `chore(ci): update PR #${prNumber} screenshots`]);
      const commitSha = runGit(nextDir, ["rev-parse", "HEAD"]).trim();
      if (tryGit(nextDir, ["push", "--force", "origin", `HEAD:refs/heads/${branch}`], authEnv)) {
        return { commitSha };
      }
      if (attempt === MAX_PUSH_RETRIES) {
        throw new Error(
          `Failed to push screenshots to ${branch} after ${MAX_PUSH_RETRIES} attempts.`,
        );
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  throw new Error(`Failed to push screenshots to ${branch}.`);
};

/**
 * Removes `pr-<prNumber>/` from the squashed orphan screenshot branch when a PR closes,
 * deleting the branch entirely if no open PR screenshot directories remain.
 */
export const cleanupPrScreenshotsFromOrphanBranch = ({
  remoteUrl,
  prNumber,
  branch = SCREENSHOT_BRANCH,
  token,
}: {
  remoteUrl: string;
  prNumber: number;
  branch?: string;
  token?: string;
}): { action: "noop" | "updated" | "deleted" } => {
  const prDirName = `pr-${prNumber}`;

  for (let attempt = 1; attempt <= MAX_PUSH_RETRIES; attempt += 1) {
    const workDir = mkdtempSync(join(tmpdir(), "merit-pr-shots-clean-"));
    const existingDir = join(workDir, "existing");
    const nextDir = join(workDir, "next");
    try {
      const authEnv = createGitAuthEnv(workDir, token);
      runGit(workDir, ["init", "--quiet", existingDir]);
      runGit(existingDir, ["remote", "add", "origin", remoteUrl]);
      if (!tryGit(existingDir, ["fetch", "--depth=1", "origin", branch], authEnv)) {
        return { action: "noop" };
      }
      runGit(existingDir, ["checkout", "--quiet", "FETCH_HEAD"]);

      if (!existsSync(join(existingDir, prDirName))) {
        return { action: "noop" };
      }

      runGit(workDir, ["init", "--quiet", nextDir]);
      configureBotGit(nextDir);
      runGit(nextDir, ["remote", "add", "origin", remoteUrl]);
      runGit(nextDir, ["checkout", "--quiet", "--orphan", branch]);
      copyOtherPrDirs(existingDir, nextDir, prDirName);

      const remaining = readdirSync(nextDir).filter((name) => name.startsWith("pr-"));
      if (remaining.length === 0) {
        if (tryGit(nextDir, ["push", "origin", "--delete", branch], authEnv)) {
          return { action: "deleted" };
        }
      } else {
        runGit(nextDir, ["add", "."]);
        runGit(nextDir, [
          "commit",
          "--quiet",
          "-m",
          `chore(ci): remove PR #${prNumber} screenshots`,
        ]);
        if (tryGit(nextDir, ["push", "--force", "origin", `HEAD:refs/heads/${branch}`], authEnv)) {
          return { action: "updated" };
        }
      }

      if (attempt === MAX_PUSH_RETRIES) {
        throw new Error(`Failed to clean screenshots for PR #${prNumber} on ${branch}.`);
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  return { action: "noop" };
};

const resolveRemoteUrl = (repoRoot: string): string => {
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo) {
    return `https://github.com/${repo}.git`;
  }
  return runGit(repoRoot, ["remote", "get-url", "origin"]).trim();
};

const runSelectCli = (repoRoot: string, args: readonly string[]) => {
  const baseRef = readFlagValue(args, "--base") ?? process.env.PR_BASE_SHA ?? "origin/main";
  const headRef = readFlagValue(args, "--head") ?? process.env.PR_HEAD_SHA ?? "HEAD";
  const indexPath = resolve(
    repoRoot,
    readFlagValue(args, "--index") ?? "tooling/storybook/dist/index.json",
  );
  const maxRaw = readFlagValue(args, "--max");
  const maxStories = maxRaw ? Number.parseInt(maxRaw, 10) : MAX_SCREENSHOT_STORIES;

  const mergeBase = runGit(repoRoot, ["merge-base", baseRef, headRef]).trim();
  const changedFiles = parseNameStatusZ(
    runGit(repoRoot, [
      "diff",
      "--name-status",
      "--find-renames",
      "-z",
      `${mergeBase}...${headRef}`,
    ]),
  );
  const parsedIndex = storybookIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  const result = selectStoriesForPr({
    changedPaths: changedFiles.filter((f) => f.status !== "deleted").map((f) => f.path),
    indexEntries: parsedIndex.entries,
    maxStories,
  });

  process.stdout.write(
    `${JSON.stringify({ storyIds: result.selected.map((s) => s.id), ...result }, null, 2)}\n`,
  );
};

const runPublishCli = (repoRoot: string, args: readonly string[]) => {
  const prRaw = readFlagValue(args, "--pr") ?? process.env.PR_NUMBER;
  const prNumber = prRaw ? Number.parseInt(prRaw, 10) : Number.NaN;
  const repo = readFlagValue(args, "--repo") ?? process.env.GITHUB_REPOSITORY ?? "";
  const resultsPath = resolve(repoRoot, readFlagValue(args, "--results") ?? "");
  const indexPath = resolve(
    repoRoot,
    readFlagValue(args, "--index") ?? "tooling/storybook/dist/index.json",
  );
  const outManifest = resolve(repoRoot, readFlagValue(args, "--out-manifest") ?? "");
  const omittedCount = Number.parseInt(readFlagValue(args, "--omitted") ?? "0", 10) || 0;

  if (!Number.isInteger(prNumber) || prNumber <= 0 || !repo || !outManifest) {
    throw new Error(
      "publish requires --pr, --repo (or GITHUB_REPOSITORY), --results, and --out-manifest.",
    );
  }

  const results = uiVerifySubsetSchema.parse(JSON.parse(readFileSync(resultsPath, "utf8")));
  const index = storybookIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  const resultsDir = dirname(resultsPath);

  const captured: Array<{
    storyId: string;
    title: string;
    name: string;
    passed: boolean;
    filename: string;
    sourcePath: string;
  }> = [];

  for (const target of results.targets) {
    if (target.kind !== "story" || target.viewport !== "desktop" || !target.screenshot) {
      continue;
    }
    const sourcePath = resolve(resultsDir, target.screenshot);
    if (!existsSync(sourcePath)) {
      continue;
    }
    const entry = index.entries[target.target];
    captured.push({
      storyId: target.target,
      title: entry?.title || target.target,
      name: entry?.name || target.name,
      passed: target.passed,
      filename: basename(sourcePath),
      sourcePath,
    });
  }

  if (captured.length === 0) {
    writeFileSync(
      outManifest,
      `${JSON.stringify({ screenshots: [], omittedCount }, null, 2)}\n`,
      "utf8",
    );
    return;
  }

  const remoteUrl = resolveRemoteUrl(repoRoot);
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const { commitSha } = publishScreenshotsToOrphanBranch({
    remoteUrl,
    prNumber,
    files: captured.map(({ filename, sourcePath }) => ({ filename, sourcePath })),
    token,
  });

  const manifest: PrScreenshotManifest = {
    screenshots: captured.map((item) => ({
      storyId: item.storyId,
      title: item.title,
      name: item.name,
      passed: item.passed,
      url: buildScreenshotRawUrl({ repo, commitSha, prNumber, filename: item.filename }),
    })),
    omittedCount,
  };
  writeFileSync(outManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Published ${captured.length} desktop screenshot(s) at ${commitSha}.\n`);
};

const runCleanupCli = (repoRoot: string, args: readonly string[]) => {
  const prRaw = readFlagValue(args, "--pr") ?? process.env.PR_NUMBER;
  const prNumber = prRaw ? Number.parseInt(prRaw, 10) : Number.NaN;
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error("cleanup requires --pr or PR_NUMBER.");
  }
  const remoteUrl = resolveRemoteUrl(repoRoot);
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const result = cleanupPrScreenshotsFromOrphanBranch({ remoteUrl, prNumber, token });
  process.stdout.write(`Screenshot cleanup for PR #${prNumber}: ${result.action}.\n`);
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const [command, ...rest] = process.argv.slice(2);
  if (command === "select") {
    runSelectCli(repoRoot, rest);
    return;
  }
  if (command === "publish") {
    runPublishCli(repoRoot, rest);
    return;
  }
  if (command === "cleanup") {
    runCleanupCli(repoRoot, rest);
    return;
  }
  throw new Error(`Unknown command "${command ?? ""}". Expected select, publish, or cleanup.`);
};

if (import.meta.main) {
  runCli();
}
