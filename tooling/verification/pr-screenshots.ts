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

import { z } from "zod";

import { errorMessage, normalizeRepoPath, parseCliArgs, parseWholeNumber } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import { parseNameStatusZ } from "./verification-record.ts";

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
  storyFile: z.string().min(1),
  url: z.string().url(),
  passed: z.boolean(),
});

/** How many story files a change affects, and how many of those it affects directly. */
export const affectedStoryFilesSchema = z.object({
  storyFiles: z.number().int().nonnegative(),
  directStoryFiles: z.number().int().nonnegative(),
});

export const prScreenshotManifestSchema = z.object({
  screenshots: z.array(prScreenshotSchema),
  affected: affectedStoryFilesSchema,
});

export type PrScreenshot = z.infer<typeof prScreenshotSchema>;

export type AffectedStoryFiles = z.infer<typeof affectedStoryFilesSchema>;

export type PrScreenshotManifest = z.infer<typeof prScreenshotManifestSchema>;

/** The module list `storybook build --stats-json` writes to `preview-stats.json`. */
export const previewStatsSchema = z.object({
  modules: z.array(
    z.object({
      name: z.string(),
      reasons: z.array(z.object({ moduleName: z.string() })).default([]),
    }),
  ),
});

export type PreviewStats = z.infer<typeof previewStatsSchema>;

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

/** Stands for Storybook's project annotations: what `.storybook/preview` imports reaches every story. */
export const EVERY_STORY = "<every story>";

/**
 * Maps a `preview-stats.json` module name to a repository path. Returns `EVERY_STORY` for the
 * project annotations and null for installed packages and the builder's other virtual modules.
 */
export const resolveStatsModulePath = (name: string): string | null => {
  if (name.startsWith("/virtual:")) {
    return name.endsWith("/project-annotations.js") ? EVERY_STORY : null;
  }
  if (name.startsWith("\0") || name.includes("/node_modules/")) {
    return null;
  }
  return resolveStoryImportPath(name.replace(/\?.*$/u, ""));
};

/** Maps each module the Storybook preview bundles to the modules that import it. */
export const buildImporterGraph = (stats: PreviewStats): Map<string, Set<string>> => {
  const importers = new Map<string, Set<string>>();
  for (const module of stats.modules) {
    const path = resolveStatsModulePath(module.name);
    if (!path) {
      continue;
    }
    const set = importers.get(path) ?? new Set<string>();
    importers.set(path, set);
    for (const reason of module.reasons) {
      const importer = resolveStatsModulePath(reason.moduleName);
      if (importer && importer !== path) {
        set.add(importer);
      }
    }
  }
  return importers;
};

/** What `select` prints and `publish` reads: the chosen stories and the files the change affects. */
export const prStorySelectionSchema = z.object({
  storyIds: z.array(z.string().min(1)),
  selected: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      name: z.string(),
      storyFile: z.string().min(1),
    }),
  ),
  affected: affectedStoryFilesSchema,
});

export type PrStorySelection = z.infer<typeof prStorySelectionSchema>;

export type SelectedStory = PrStorySelection["selected"][number];

/** Groups Storybook stories by the repository path of the file that defines them. */
const groupStoriesByFile = (
  indexEntries: Readonly<Record<string, StorybookIndexEntry>>,
): Map<string, SelectedStory[]> => {
  const storiesByFile = new Map<string, SelectedStory[]>();
  for (const entry of Object.values(indexEntries)) {
    if (entry.type !== "story" || !entry.importPath) {
      continue;
    }
    const storyFile = resolveStoryImportPath(entry.importPath);
    const list = storiesByFile.get(storyFile) ?? [];
    list.push({ id: entry.id, title: entry.title, name: entry.name, storyFile });
    storiesByFile.set(storyFile, list);
  }
  return storiesByFile;
};

/** Counts the import steps from each module back to the nearest changed module. */
const importDistances = (
  changed: readonly string[],
  importers: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> => {
  const distance = new Map(changed.map((path) => [path, 0]));
  let frontier = [...changed];
  for (let steps = 1; frontier.length > 0; steps += 1) {
    const next: string[] = [];
    for (const path of frontier) {
      for (const importer of importers.get(path) ?? []) {
        if (!distance.has(importer)) {
          distance.set(importer, steps);
          next.push(importer);
        }
      }
    }
    frontier = next;
  }
  return distance;
};

/** Orders the story files a change reaches, nearest first, then by path. */
const rankAffectedStoryFiles = (
  changed: readonly string[],
  storyFiles: readonly string[],
  importers: ReadonlyMap<string, ReadonlySet<string>>,
): Array<{ storyFile: string; distance: number }> => {
  const distance = importDistances(
    changed.filter((path) => importers.has(path) || storyFiles.includes(path)),
    importers,
  );
  const everyStory = distance.get(EVERY_STORY);
  return storyFiles
    .map((storyFile) => ({
      storyFile,
      distance: Math.min(distance.get(storyFile) ?? Infinity, everyStory ?? Infinity),
    }))
    .filter((ranked) => Number.isFinite(ranked.distance))
    .sort((a, b) => a.distance - b.distance || a.storyFile.localeCompare(b.storyFile));
};

/** Takes one story from each queue in turn until `max` are taken or every queue is empty. */
const takeRoundRobin = <T>(queues: readonly T[][], max: number): T[] => {
  const taken: T[] = [];
  const longest = Math.max(0, ...queues.map((queue) => queue.length));
  for (let round = 0; round < longest; round += 1) {
    for (const queue of queues) {
      const next = queue[round];
      if (next && taken.length < max) {
        taken.push(next);
      }
    }
  }
  return taken;
};

/**
 * Selects desktop Storybook stories for changed PR paths from the preview's import graph:
 * a story file is affected when it changed or imports a changed module, however indirectly,
 * and every story is affected when `.storybook/preview` does. Affected files are ranked by
 * import distance, then path, and stories are taken one per file in turn, so the closest
 * screens are shown before any file contributes a second variant.
 * "Direct" files changed themselves or import a changed module.
 */
export const selectStoriesForPr = ({
  changedPaths,
  indexEntries,
  importers,
  maxStories = MAX_SCREENSHOT_STORIES,
}: {
  changedPaths: readonly string[];
  indexEntries: Readonly<Record<string, StorybookIndexEntry>>;
  importers: ReadonlyMap<string, ReadonlySet<string>>;
  maxStories?: number;
}): { selected: SelectedStory[]; affected: AffectedStoryFiles } => {
  const changed = [...new Set(changedPaths.map(normalizeRepoPath).filter(Boolean))];
  const storiesByFile = groupStoriesByFile(indexEntries);
  const ranked = rankAffectedStoryFiles(changed, [...storiesByFile.keys()], importers);
  const queues = ranked.map(({ storyFile }) => storiesByFile.get(storyFile) ?? []);
  return {
    selected: takeRoundRobin(queues, maxStories),
    affected: {
      storyFiles: ranked.length,
      directStoryFiles: ranked.filter(({ distance }) => distance <= 1).length,
    },
  };
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
 * Inspects whether `branch` exists on `remoteUrl` using `git ls-remote`.
 * Throws on transport/auth errors instead of misclassifying them as a missing branch.
 */
const inspectRemoteBranchSha = (
  cwd: string,
  remoteUrl: string,
  branch: string,
  extraEnv?: Readonly<Record<string, string>>,
): string | null => {
  const output = runGit(cwd, ["ls-remote", "--heads", remoteUrl, `refs/heads/${branch}`], extraEnv);
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return null;
  }
  const sha = firstLine.split(/\s+/u)[0] ?? "";
  if (!/^[0-9a-f]{40}$/iu.test(sha)) {
    throw new Error(`Unexpected ls-remote output for ${branch}: ${firstLine}`);
  }
  return sha;
};

/**
 * Runs `attempt` in a fresh temporary directory, up to MAX_PUSH_RETRIES times, until it returns.
 * An attempt throws when its leased push is rejected, so the next one re-reads the branch.
 */
const retryLeasedPush = <T>(
  tempPrefix: string,
  attempt: (workDir: string, attemptNumber: number) => T,
  failure: string,
): T => {
  let lastError: unknown;
  for (let attemptNumber = 1; attemptNumber <= MAX_PUSH_RETRIES; attemptNumber += 1) {
    const workDir = mkdtempSync(join(tmpdir(), tempPrefix));
    try {
      return attempt(workDir, attemptNumber);
    } catch (error) {
      lastError = error;
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
  throw new Error(`${failure}: ${errorMessage(lastError)}`);
};

type RemoteBranch = {
  existingDir: string;
  remoteSha: string | null;
  authEnv: Record<string, string> | undefined;
};

/** Checks out the branch's current tip, when it exists, and returns its SHA for the push lease. */
const checkoutRemoteBranch = (
  workDir: string,
  remoteUrl: string,
  branch: string,
  token: string | undefined,
): RemoteBranch => {
  const existingDir = join(workDir, "existing");
  const authEnv = createGitAuthEnv(workDir, token);
  runGit(workDir, ["init", "--quiet", existingDir]);
  runGit(existingDir, ["remote", "add", "origin", remoteUrl]);

  const remoteSha = inspectRemoteBranchSha(existingDir, remoteUrl, branch, authEnv);
  if (remoteSha) {
    runGit(existingDir, ["fetch", "--depth=1", "origin", remoteSha], authEnv);
    runGit(existingDir, ["checkout", "--quiet", "FETCH_HEAD"]);
  }
  return { existingDir, remoteSha, authEnv };
};

/** Starts a new orphan `branch` that carries over every other pull request's screenshots. */
const startOrphanBranch = (
  workDir: string,
  remoteUrl: string,
  branch: string,
  remote: RemoteBranch,
  prDirName: string,
): string => {
  const nextDir = join(workDir, "next");
  runGit(workDir, ["init", "--quiet", nextDir]);
  configureBotGit(nextDir);
  runGit(nextDir, ["remote", "add", "origin", remoteUrl]);
  runGit(nextDir, ["checkout", "--quiet", "--orphan", branch]);
  if (remote.remoteSha) {
    copyOtherPrDirs(remote.existingDir, nextDir, prDirName);
  }
  return nextDir;
};

const commitAll = (cwd: string, message: string) => {
  runGit(cwd, ["add", "."]);
  runGit(cwd, ["commit", "--quiet", "-m", message]);
};

/** Pushes `source` (empty to delete) to `branch` only if the branch still points at `remote.remoteSha`. */
const pushWithLease = (
  nextDir: string,
  branch: string,
  remote: RemoteBranch,
  source: "HEAD" | "",
): boolean =>
  tryGit(
    nextDir,
    [
      "push",
      `--force-with-lease=refs/heads/${branch}:${remote.remoteSha ?? ""}`,
      "origin",
      `${source}:refs/heads/${branch}`,
    ],
    remote.authEnv,
  );

/**
 * Publishes `pr-<prNumber>/*.png` to a single squashed orphan commit on `branch`
 * so PNG history never accumulates across pushes while preserving other open PRs' directories.
 * Uses `--force-with-lease` against the observed remote SHA so concurrent PR jobs retry cleanly.
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
  return retryLeasedPush(
    "merit-pr-shots-",
    (workDir, attempt) => {
      const remote = checkoutRemoteBranch(workDir, remoteUrl, branch, token);
      const nextDir = startOrphanBranch(workDir, remoteUrl, branch, remote, prDirName);

      const targetPrDir = join(nextDir, prDirName);
      rmSync(targetPrDir, { recursive: true, force: true });
      for (const file of files) {
        cpSync(file.sourcePath, join(targetPrDir, file.filename), { force: true });
      }

      commitAll(nextDir, `chore(ci): update PR #${prNumber} screenshots`);
      const commitSha = runGit(nextDir, ["rev-parse", "HEAD"]).trim();
      if (pushWithLease(nextDir, branch, remote, "HEAD")) {
        return { commitSha };
      }
      throw new Error(`Leased push rejected for ${branch} (attempt ${attempt}).`);
    },
    `Failed to push screenshots to ${branch} after ${MAX_PUSH_RETRIES} attempts`,
  );
};

/**
 * Removes `pr-<prNumber>/` from the squashed orphan screenshot branch when a PR closes,
 * deleting the branch entirely if no open PR screenshot directories remain.
 * Uses `--force-with-lease` against the observed remote SHA so concurrent publishes are never clobbered.
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
  return retryLeasedPush(
    "merit-pr-shots-clean-",
    (workDir, attempt): { action: "noop" | "updated" | "deleted" } => {
      const remote = checkoutRemoteBranch(workDir, remoteUrl, branch, token);
      if (!remote.remoteSha || !existsSync(join(remote.existingDir, prDirName))) {
        return { action: "noop" };
      }

      const nextDir = startOrphanBranch(workDir, remoteUrl, branch, remote, prDirName);
      const remaining = readdirSync(nextDir).filter((name) => name.startsWith("pr-"));
      if (remaining.length > 0) {
        commitAll(nextDir, `chore(ci): remove PR #${prNumber} screenshots`);
      }
      const action = remaining.length === 0 ? "deleted" : "updated";
      if (pushWithLease(nextDir, branch, remote, action === "deleted" ? "" : "HEAD")) {
        return { action };
      }
      throw new Error(`Leased cleanup push rejected for ${branch} (attempt ${attempt}).`);
    },
    `Failed to clean screenshots for PR #${prNumber} on ${branch}`,
  );
};

const resolveRemoteUrl = (repoRoot: string): string => {
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo) {
    return `https://github.com/${repo}.git`;
  }
  return runGit(repoRoot, ["remote", "get-url", "origin"]).trim();
};

const DEFAULT_STORYBOOK_INDEX = "tooling/storybook/dist/index.json";
const DEFAULT_PREVIEW_STATS = "tooling/storybook/dist/preview-stats.json";

const SELECT_USAGE =
  "Usage: pr-screenshots.ts select [--base <ref>] [--head <ref>] [--index <path>] [--stats <path>] [--max <count>]";

/** Reads `select` flags strictly, falling back to the pull request refs CI sets. */
export const parseSelectArgs = (args: readonly string[], env: NodeJS.ProcessEnv = process.env) => {
  const { values } = parseCliArgs(args, {
    options: {
      base: { type: "string" },
      head: { type: "string" },
      index: { type: "string" },
      stats: { type: "string" },
      max: { type: "string" },
    },
    usage: SELECT_USAGE,
  });
  return {
    baseRef: values.base ?? env.PR_BASE_SHA ?? "origin/main",
    headRef: values.head ?? env.PR_HEAD_SHA ?? "HEAD",
    index: values.index ?? DEFAULT_STORYBOOK_INDEX,
    stats: values.stats ?? DEFAULT_PREVIEW_STATS,
    maxStories:
      values.max === undefined ? MAX_SCREENSHOT_STORIES : parseWholeNumber(values.max, "--max"),
  };
};

const runSelectCli = (repoRoot: string, args: readonly string[]) => {
  const { baseRef, headRef, index, stats, maxStories } = parseSelectArgs(args);
  const indexPath = resolve(repoRoot, index);
  const statsPath = resolve(repoRoot, stats);

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
  const parsedStats = previewStatsSchema.parse(JSON.parse(readFileSync(statsPath, "utf8")));
  const result = selectStoriesForPr({
    changedPaths: changedFiles.filter((f) => f.status !== "deleted").map((f) => f.path),
    indexEntries: parsedIndex.entries,
    importers: buildImporterGraph(parsedStats),
    maxStories,
  });

  const selection: PrStorySelection = {
    storyIds: result.selected.map((story) => story.id),
    ...result,
  };
  process.stdout.write(`${JSON.stringify(selection, null, 2)}\n`);
};

/**
 * Filters `ui:verify` targets to desktop story screenshots whose exact `target` ID
 * appears in `selectedStoryIds` (when supplied), preventing substring matches from
 * exceeding the screenshot cap.
 */
export const filterSelectedDesktopTargets = <
  T extends {
    kind: "story" | "route";
    target: string;
    viewport: "desktop" | "mobile";
    screenshot: string | null;
  },
>(
  targets: readonly T[],
  selectedStoryIds?: readonly string[],
): T[] => {
  const allowed =
    selectedStoryIds && selectedStoryIds.length > 0 ? new Set(selectedStoryIds) : null;
  const filtered = targets.filter(
    (item) =>
      item.kind === "story" &&
      item.viewport === "desktop" &&
      Boolean(item.screenshot) &&
      (!allowed || allowed.has(item.target)),
  );
  if (!selectedStoryIds || selectedStoryIds.length === 0) {
    return filtered;
  }
  const order = new Map(selectedStoryIds.map((id, idx) => [id, idx]));
  return [...filtered].sort(
    (a, b) =>
      (order.get(a.target) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.target) ?? Number.MAX_SAFE_INTEGER),
  );
};

/** Reads a pull request number from `--pr` or `PR_NUMBER`, rejecting malformed values. */
const readPrNumber = (flag: string | undefined, env: NodeJS.ProcessEnv): number | undefined => {
  const raw = flag ?? env.PR_NUMBER;
  return raw ? parseWholeNumber(raw, flag === undefined ? "PR_NUMBER" : "--pr") : undefined;
};

const PUBLISH_USAGE =
  "Usage: pr-screenshots.ts publish --results <results.json> --selection <selection.json> --out-manifest <path> [--pr <number>] [--repo <owner/name>]";

/** Reads `publish` flags strictly; the pull request and repository may come from CI's environment. */
export const parsePublishArgs = (args: readonly string[], env: NodeJS.ProcessEnv = process.env) => {
  const { values } = parseCliArgs(args, {
    options: {
      pr: { type: "string" },
      repo: { type: "string" },
      results: { type: "string" },
      selection: { type: "string" },
      "out-manifest": { type: "string" },
    },
    usage: PUBLISH_USAGE,
  });
  const prNumber = readPrNumber(values.pr, env);
  const repo = values.repo ?? env.GITHUB_REPOSITORY ?? "";
  const { results, selection, "out-manifest": outManifest } = values;
  if (!prNumber || !repo || !results || !selection || !outManifest) {
    throw new Error(
      `publish requires --pr, --repo (or GITHUB_REPOSITORY), --results, --selection, and --out-manifest.\n${PUBLISH_USAGE}`,
    );
  }
  return { prNumber, repo, results, selection, outManifest };
};

export type CapturedScreenshot = Omit<PrScreenshot, "url"> & {
  filename: string;
  sourcePath: string;
};

/** Pairs each selected story's captured desktop screenshot with its selection details. */
export const collectCapturedScreenshots = (
  resultsPath: string,
  selection: PrStorySelection,
): CapturedScreenshot[] => {
  const results = uiVerifySubsetSchema.parse(JSON.parse(readFileSync(resultsPath, "utf8")));
  const stories = new Map(selection.selected.map((story) => [story.id, story]));
  const captured: CapturedScreenshot[] = [];
  for (const target of filterSelectedDesktopTargets(results.targets, selection.storyIds)) {
    const story = stories.get(target.target);
    const sourcePath = target.screenshot ? resolve(dirname(resultsPath), target.screenshot) : null;
    if (!story || !sourcePath || !existsSync(sourcePath)) {
      continue;
    }
    captured.push({
      storyId: story.id,
      title: story.title || story.id,
      name: story.name || target.name,
      storyFile: story.storyFile,
      passed: target.passed,
      filename: basename(sourcePath),
      sourcePath,
    });
  }
  return captured;
};

const writeManifest = (path: string, manifest: PrScreenshotManifest) =>
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const runPublishCli = (repoRoot: string, args: readonly string[]) => {
  const options = parsePublishArgs(args);
  const { prNumber, repo } = options;
  const outManifest = resolve(repoRoot, options.outManifest);
  const selection = prStorySelectionSchema.parse(
    JSON.parse(readFileSync(resolve(repoRoot, options.selection), "utf8")),
  );
  const captured = collectCapturedScreenshots(resolve(repoRoot, options.results), selection);
  if (captured.length === 0) {
    writeManifest(outManifest, { screenshots: [], affected: selection.affected });
    return;
  }

  const { commitSha } = publishScreenshotsToOrphanBranch({
    remoteUrl: resolveRemoteUrl(repoRoot),
    prNumber,
    files: captured.map(({ filename, sourcePath }) => ({ filename, sourcePath })),
    token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
  });
  writeManifest(outManifest, {
    screenshots: captured.map(({ filename, sourcePath: _sourcePath, ...shot }) => ({
      ...shot,
      url: buildScreenshotRawUrl({ repo, commitSha, prNumber, filename }),
    })),
    affected: selection.affected,
  });
  process.stdout.write(`Published ${captured.length} desktop screenshot(s) at ${commitSha}.\n`);
};

const CLEANUP_USAGE = "Usage: pr-screenshots.ts cleanup [--pr <number>]";

/** Reads the `cleanup` pull request number from `--pr` or `PR_NUMBER`. */
export const parseCleanupArgs = (
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): number => {
  const { values } = parseCliArgs(args, {
    options: { pr: { type: "string" } },
    usage: CLEANUP_USAGE,
  });
  const prNumber = readPrNumber(values.pr, env);
  if (!prNumber) {
    throw new Error(`cleanup requires --pr or PR_NUMBER.\n${CLEANUP_USAGE}`);
  }
  return prNumber;
};

const runCleanupCli = (repoRoot: string, args: readonly string[]) => {
  const prNumber = parseCleanupArgs(args);
  const remoteUrl = resolveRemoteUrl(repoRoot);
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const result = cleanupPrScreenshotsFromOrphanBranch({ remoteUrl, prNumber, token });
  process.stdout.write(`Screenshot cleanup for PR #${prNumber}: ${result.action}.\n`);
};

const runCli = () => {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "select") {
    runSelectCli(REPO_ROOT, rest);
    return;
  }
  if (command === "publish") {
    runPublishCli(REPO_ROOT, rest);
    return;
  }
  if (command === "cleanup") {
    runCleanupCli(REPO_ROOT, rest);
    return;
  }
  throw new Error(`Unknown command "${command ?? ""}". Expected select, publish, or cleanup.`);
};

if (import.meta.main) {
  runCli();
}
