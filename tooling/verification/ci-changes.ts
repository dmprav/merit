import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type WorkspacePackage = {
  name: string;
  dir: string;
  deps: string[];
};

export type ChangeClassification = {
  renovate: boolean;
  docs_only: boolean;
  renovate_only: boolean;
  full_run: boolean;
  run_app: boolean;
  run_storybook: boolean;
  run_tooling: boolean;
  run_package_tests: boolean;
  package_filters: string;
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

const ALL_PACKAGES_FILTER = "--filter '@merit/*' --filter '!@merit/storybook'";

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
  if (typeof manifest.name !== "string") {
    throw new Error(`Missing package name in ${relPath}`);
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

const findAffectedPackages = (files: string[], workspacePackages: WorkspacePackage[]) => {
  const byLongestDir = [...workspacePackages].sort((a, b) => b.dir.length - a.dir.length);
  const reverseDeps = new Map<string, Set<string>>(
    workspacePackages.map((p) => [p.name, new Set()]),
  );
  for (const pkg of workspacePackages) {
    for (const dep of pkg.deps) {
      reverseDeps.get(dep)?.add(pkg.name);
    }
  }

  const affected = new Set<string>();
  const queue: string[] = [];

  for (const file of files) {
    const owner = byLongestDir.find((p) => file === p.dir || file.startsWith(`${p.dir}/`));
    if (owner && !affected.has(owner.name)) {
      affected.add(owner.name);
      queue.push(owner.name);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const dependent of reverseDeps.get(current) ?? []) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return affected;
};

/** An unknown diff counts as a dependency change, so the audit blocks when in doubt. */
const changesDependencies = (files: string[] | null) =>
  files === null || files.length === 0 || files.some((file) => DEPENDENCY_FILE_PATTERN.test(file));

export const classifyChangedFiles = ({
  eventName,
  changedFiles,
  workspacePackages,
}: {
  eventName: string;
  /** Files changed by the pull request or push, or null when the diff is unknown. */
  changedFiles: string[] | null;
  workspacePackages: WorkspacePackage[];
}): ChangeClassification => {
  const dependenciesChanged =
    eventName === "workflow_dispatch" || changesDependencies(changedFiles);
  if (eventName !== "pull_request") {
    return {
      renovate: eventName === "workflow_dispatch",
      docs_only: false,
      renovate_only: false,
      full_run: true,
      run_app: true,
      run_storybook: true,
      run_tooling: true,
      run_package_tests: true,
      package_filters: ALL_PACKAGES_FILTER,
      dependencies_changed: dependenciesChanged,
    };
  }

  const files = (changedFiles ?? []).filter(Boolean);
  const renovate = files.includes("renovate.json");
  const docsOnly = files.length > 0 && files.every(isDocFile);
  const renovateOnly = renovate && files.every((f) => f === "renovate.json" || isRecordFile(f));

  if (docsOnly || renovateOnly) {
    return {
      renovate,
      docs_only: docsOnly,
      renovate_only: renovateOnly,
      full_run: false,
      run_app: false,
      run_storybook: false,
      run_tooling: false,
      run_package_tests: false,
      package_filters: "",
      dependencies_changed: dependenciesChanged,
    };
  }

  if (files.length === 0 || files.some(isRootOrInfraFile)) {
    return {
      renovate,
      docs_only: false,
      renovate_only: false,
      full_run: true,
      run_app: true,
      run_storybook: true,
      run_tooling: true,
      run_package_tests: true,
      package_filters: ALL_PACKAGES_FILTER,
      dependencies_changed: dependenciesChanged,
    };
  }

  const affected = findAffectedPackages(files, workspacePackages);
  const testablePackages = [...affected]
    .filter((name) => name !== "@merit/storybook")
    .sort((a, b) => a.localeCompare(b));

  return {
    renovate,
    docs_only: false,
    renovate_only: false,
    full_run: false,
    run_app: affected.has("@merit/app"),
    run_storybook:
      affected.has("@merit/storybook") || files.some((f) => STORYBOOK_SOURCE_PATTERN.test(f)),
    run_tooling: files.some(
      (f) => f.startsWith("tooling/") || f.startsWith(".agents/hooks/") || f.startsWith(".claude/"),
    ),
    run_package_tests: testablePackages.length > 0,
    package_filters: testablePackages.map((name) => `--filter '${name}'`).join(" "),
    dependencies_changed: dependenciesChanged,
  };
};

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

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const eventName = process.env.EVENT_NAME ?? "pull_request";
  let changedFiles: string[] | null;

  if (eventName === "pull_request") {
    const baseSha = process.env.PR_BASE_SHA;
    const headSha = process.env.PR_HEAD_SHA || "HEAD";
    changedFiles = diffFiles(repoRoot, baseSha ? `${baseSha}...${headSha}` : "HEAD^1...HEAD");
  } else {
    changedFiles = pushedFiles(repoRoot);
  }

  const workspacePackages = loadWorkspacePackages(repoRoot);
  const result = classifyChangedFiles({ eventName, changedFiles, workspacePackages });

  const lines = Object.entries(result).map(([key, value]) => `${key}=${String(value)}`);
  process.stdout.write(`${lines.join("\n")}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
