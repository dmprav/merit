import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type WorkspacePackage = {
  name: string;
  dir: string;
  deps: string[];
};

/** The `changes` job outputs `.github/workflows/verify.yml` reads, named as the workflow spells them. */
export type ChangeClassification = {
  renovate: boolean;
  docs_only: boolean;
  renovate_only: boolean;
  full_run: boolean;
  run_app: boolean;
  run_storybook: boolean;
  run_tooling: boolean;
  run_package_tests: boolean;
  package_filters: string[];
  dependencies_changed: boolean;
};

const WORKSPACE_PACKAGE_PATTERNS = [
  "app/package.json",
  "capabilities/access/package.json",
  "interfaces/*/package.json",
  "foundation/*/package.json",
  "capabilities/*/ai/package.json",
  "capabilities/*/business/package.json",
  "capabilities/*/web/package.json",
  "tooling/checkly/package.json",
  "tooling/storybook/package.json",
  "tooling/testing/package.json",
];

const ALL_PACKAGES_FILTER = ["@merit/*", "!@merit/storybook"];

const DOC_FILE_PATTERN =
  /^(docs\/|\.remarkrc\.mjs$|\.github\/pull_request_template\.md$|\.github\/ISSUE_TEMPLATE\/)/;
// Verification records accompany any change, so they never widen its checks.
const RECORD_FILE_PATTERN = /^verifications\//;
const README_OR_ROOT_MD_PATTERN = /(^|\/)README\.md$|^[^/]+\.md$/;

const ROOT_OR_INFRA_PATTERN =
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.node-version|vite\.config\.ts|tsconfig(\.base)?\.json|stylelint\.config\.mjs|\.fallowrc\.jsonc|commitlint\.config\.mjs|compose\.yaml|tooling\/react-compiler\.ts)$/;
const GITHUB_INFRA_PATTERN = /^\.github\/(workflows|actions|rulesets)\//;
// Files that decide which dependency versions are installed, and so what the audit reports.
const DEPENDENCY_FILE_PATTERN = /(^|\/)package\.json$|^pnpm-lock\.yaml$|^pnpm-workspace\.yaml$/;

// Storybook loads stories directly from these source trees without declaring them as package.json dependencies.
const STORYBOOK_SOURCE_PATTERN =
  /^(foundation\/(ui|forms|tables)\/src\/|interfaces\/(product|admin)\/src\/|capabilities\/[^/]+\/web\/src\/)/;

const isRecordFile = (file: string) => RECORD_FILE_PATTERN.test(file);

const isDocFile = (file: string) =>
  DOC_FILE_PATTERN.test(file) || README_OR_ROOT_MD_PATTERN.test(file) || isRecordFile(file);

const isRootOrInfraFile = (file: string) =>
  ROOT_OR_INFRA_PATTERN.test(file) || GITHUB_INFRA_PATTERN.test(file);

type PackageManifest = {
  name?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

const readPackageManifest = (repoRoot: string, relPath: string) => {
  const parsed: unknown = JSON.parse(readFileSync(join(repoRoot, relPath), "utf8"));
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid package.json at ${relPath}`);
  }
  const manifest = parsed as PackageManifest;
  if (
    typeof manifest.name !== "string" ||
    !/^@merit\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name)
  ) {
    throw new Error(`Invalid Merit package name in ${relPath}`);
  }
  return {
    dir: relPath.slice(0, -"/package.json".length),
    name: manifest.name,
    depsMap: { ...manifest.dependencies, ...manifest.devDependencies },
  };
};

export const loadWorkspacePackages = (repoRoot: string): WorkspacePackage[] => {
  const manifestPaths = WORKSPACE_PACKAGE_PATTERNS.flatMap((pattern) =>
    globSync(pattern, { cwd: repoRoot }),
  )
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => existsSync(join(repoRoot, p)))
    .sort((a, b) => a.localeCompare(b));

  const manifests = manifestPaths.map((relPath) => readPackageManifest(repoRoot, relPath));
  const workspaceNames = new Set(manifests.map((m) => m.name));

  return manifests.map(({ name, dir, depsMap }) => ({
    name,
    dir,
    deps: Object.keys(depsMap).filter((dep) => workspaceNames.has(dep)),
  }));
};

const reverseDependencies = (workspacePackages: readonly WorkspacePackage[]) => {
  const dependents = new Map<string, Set<string>>(
    workspacePackages.map((p) => [p.name, new Set()]),
  );
  for (const pkg of workspacePackages) {
    for (const dep of pkg.deps) {
      dependents.get(dep)?.add(pkg.name);
    }
  }
  return dependents;
};

/** Adds every package that depends, directly or transitively, on one of `names`. */
const withTransitiveDependents = (
  names: readonly string[],
  dependents: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> => {
  const affected = new Set(names);
  const queue = [...affected];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const dependent of dependents.get(current) ?? []) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return affected;
};

/** Finds the packages owning `files` (the deepest package directory wins) and their dependents. */
const findAffectedPackages = (files: string[], workspacePackages: WorkspacePackage[]) => {
  const byLongestDir = workspacePackages.toSorted((a, b) => b.dir.length - a.dir.length);
  const owners = files.flatMap((file) => {
    const owner = byLongestDir.find((p) => file === p.dir || file.startsWith(`${p.dir}/`));
    return owner ? [owner.name] : [];
  });
  return withTransitiveDependents(owners, reverseDependencies(workspacePackages));
};

/** An unknown diff counts as a dependency change, so the audit blocks when in doubt. */
const changesDependencies = (files: string[] | null) =>
  files === null || files.length === 0 || files.some((file) => DEPENDENCY_FILE_PATTERN.test(file));

const APP_PACKAGE = "@merit/app";
const STORYBOOK_PACKAGE = "@merit/storybook";
const TOOLING_PATH_PREFIXES = ["tooling/", ".agents/", ".claude/", ".greptile/"];

const isToolingFile = (file: string) =>
  TOOLING_PATH_PREFIXES.some((prefix) => file.startsWith(prefix)) || file === ".coderabbit.yaml";

/** Which checks a change needs: none beyond the light ones, every check, or the affected areas. */
type ChangeScope =
  | { mode: "skip"; reason: "docs_only" | "renovate_only" }
  | { mode: "full" }
  | {
      mode: "affected";
      runApp: boolean;
      runStorybook: boolean;
      runTooling: boolean;
      /** Workspace packages whose tests run; Storybook runs as its own job. */
      packageFilters: string[];
    };

type ChangePlan = {
  /** Runs the Renovate config check: a manual run, or a pull request that edits renovate.json. */
  renovate: boolean;
  dependenciesChanged: boolean;
  scope: ChangeScope;
};

const affectedScope = (files: string[], workspacePackages: WorkspacePackage[]): ChangeScope => {
  const affected = findAffectedPackages(files, workspacePackages);
  return {
    mode: "affected",
    runApp: affected.has(APP_PACKAGE),
    runStorybook:
      affected.has(STORYBOOK_PACKAGE) || files.some((f) => STORYBOOK_SOURCE_PATTERN.test(f)),
    runTooling: files.some(isToolingFile),
    packageFilters: [...affected]
      .filter((name) => name !== STORYBOOK_PACKAGE)
      .sort((a, b) => a.localeCompare(b)),
  };
};

const pullRequestScope = (files: string[], workspacePackages: WorkspacePackage[]): ChangeScope => {
  if (files.length > 0 && files.every(isDocFile)) {
    return { mode: "skip", reason: "docs_only" };
  }
  if (
    files.includes("renovate.json") &&
    files.every((f) => f === "renovate.json" || isRecordFile(f))
  ) {
    return { mode: "skip", reason: "renovate_only" };
  }
  if (files.length === 0 || files.some(isRootOrInfraFile)) {
    return { mode: "full" };
  }
  return affectedScope(files, workspacePackages);
};

/** Pushes, merge groups, and manual runs check everything; pull requests check what they touch. */
const planChangedChecks = ({
  eventName,
  changedFiles,
  workspacePackages,
}: {
  eventName: string;
  changedFiles: string[] | null;
  workspacePackages: WorkspacePackage[];
}): ChangePlan => {
  const dependenciesChanged =
    eventName === "workflow_dispatch" || changesDependencies(changedFiles);
  if (eventName !== "pull_request") {
    return {
      renovate: eventName === "workflow_dispatch",
      dependenciesChanged,
      scope: { mode: "full" },
    };
  }
  const files = (changedFiles ?? []).filter(Boolean);
  return {
    renovate: files.includes("renovate.json"),
    dependenciesChanged,
    scope: pullRequestScope(files, workspacePackages),
  };
};

/** Spells a plan as the step outputs `.github/workflows/verify.yml` reads, keys and values unchanged. */
const toWorkflowOutputs = ({
  renovate,
  dependenciesChanged,
  scope,
}: ChangePlan): ChangeClassification => {
  const full = scope.mode === "full";
  const affected = scope.mode === "affected" ? scope : null;
  const packageFilters = full ? ALL_PACKAGES_FILTER : (affected?.packageFilters ?? []);
  return {
    renovate,
    docs_only: scope.mode === "skip" && scope.reason === "docs_only",
    renovate_only: scope.mode === "skip" && scope.reason === "renovate_only",
    full_run: full,
    run_app: full || affected?.runApp === true,
    run_storybook: full || affected?.runStorybook === true,
    run_tooling: full || affected?.runTooling === true,
    run_package_tests: packageFilters.length > 0,
    package_filters: packageFilters,
    dependencies_changed: dependenciesChanged,
  };
};

export const classifyChangedFiles = (input: {
  eventName: string;
  /** Files changed by the pull request or push, or null when the diff is unknown. */
  changedFiles: string[] | null;
  workspacePackages: WorkspacePackage[];
}): ChangeClassification => toWorkflowOutputs(planChangedChecks(input));

const diffFiles = (repoRoot: string, diffRange: string) =>
  execFileSync("git", ["diff", "--name-only", diffRange], { cwd: repoRoot, encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

// git reports a commit this checkout lacks as an invalid range, a bad object or an unknown
// revision. The changes job runs before dependencies install, so this uses no schema library.
const isMissingCommitError = (error: unknown) =>
  error instanceof Error &&
  "stderr" in error &&
  typeof error.stderr === "string" &&
  /Invalid revision range|bad object|unknown revision|bad revision/.test(error.stderr);

// A push or merge group compares with the commit before it. A new branch has no such commit,
// and a force push may name one this checkout lacks, so the diff is unknown.
const pushedFiles = (repoRoot: string) => {
  const beforeSha = process.env.BEFORE_SHA;
  if (!beforeSha || /^0+$/.test(beforeSha)) {
    return null;
  }
  try {
    return diffFiles(repoRoot, `${beforeSha}..${process.env.HEAD_SHA || "HEAD"}`);
  } catch (error) {
    if (!isMissingCommitError(error)) {
      throw error;
    }
    return null;
  }
};

// A pull request compares its head with the merge base of its base commit.
const pullRequestFiles = (repoRoot: string) => {
  const baseSha = process.env.PR_BASE_SHA;
  const headSha = process.env.PR_HEAD_SHA || "HEAD";
  return diffFiles(repoRoot, baseSha ? `${baseSha}...${headSha}` : "HEAD^1...HEAD");
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const eventName = process.env.EVENT_NAME ?? "pull_request";
  const changedFiles =
    eventName === "pull_request" ? pullRequestFiles(repoRoot) : pushedFiles(repoRoot);
  const workspacePackages = loadWorkspacePackages(repoRoot);
  const result = classifyChangedFiles({ eventName, changedFiles, workspacePackages });

  const lines = Object.entries(result).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  process.stdout.write(`${lines.join("\n")}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
};

if (import.meta.main) {
  runCli();
}
