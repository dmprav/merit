// @ts-check
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{ name: string; dir: string; deps: string[] }} WorkspacePackage
 * @typedef {{
 *   renovate: boolean;
 *   docs_only: boolean;
 *   renovate_only: boolean;
 *   full_run: boolean;
 *   run_app: boolean;
 *   run_storybook: boolean;
 *   run_tooling: boolean;
 *   run_package_tests: boolean;
 *   package_filters: string;
 * }} ChangeClassification
 */

const workspaceGlobs = [
  "app",
  "capabilities/access",
  "interfaces/*",
  "foundation/*",
  "capabilities/*/business",
  "capabilities/*/web",
  "tooling/checkly",
  "tooling/storybook",
  "tooling/testing",
];

/** @param {string} repoRoot */
const expandWorkspaceDirs = (repoRoot) => {
  /** @type {string[]} */
  const dirs = [];
  for (const pattern of workspaceGlobs) {
    const parts = pattern.split("/");
    /** @type {string[]} */
    let current = [repoRoot];
    for (const part of parts) {
      /** @type {string[]} */
      const next = [];
      for (const dir of current) {
        if (part === "*") {
          if (!existsSync(dir)) {
            continue;
          }
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name !== "node_modules") {
              next.push(join(dir, entry.name));
            }
          }
        } else {
          const candidate = join(dir, part);
          if (existsSync(candidate)) {
            next.push(candidate);
          }
        }
      }
      current = next;
    }
    for (const dir of current) {
      if (existsSync(join(dir, "package.json"))) {
        dirs.push(relative(repoRoot, dir).replace(/\\/g, "/"));
      }
    }
  }
  return dirs.sort((a, b) => a.localeCompare(b));
};

/**
 * @param {string} repoRoot
 * @returns {WorkspacePackage[]}
 */
export const loadWorkspacePackages = (repoRoot) => {
  const dirs = expandWorkspaceDirs(repoRoot);
  /** @type {WorkspacePackage[]} */
  const pkgs = [];
  /** @type {Set<string>} */
  const names = new Set();
  const parsed = dirs.map((dir) => {
    /** @type {unknown} */
    const rawUnknown = JSON.parse(readFileSync(join(repoRoot, dir, "package.json"), "utf8"));
    if (!rawUnknown || typeof rawUnknown !== "object") {
      throw new Error(`Invalid package.json in ${dir}`);
    }
    const raw =
      /** @type {{ name?: unknown; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> }} */ (
        rawUnknown
      );
    if (typeof raw.name !== "string") {
      throw new Error(`Missing package name in ${dir}/package.json`);
    }
    names.add(raw.name);
    return {
      dir,
      name: raw.name,
      depsMap: { ...raw.dependencies, ...raw.devDependencies },
    };
  });

  for (const { name, dir, depsMap } of parsed) {
    const deps = Object.keys(depsMap).filter((dep) => names.has(dep));
    pkgs.push({ name, dir, deps });
  }
  return pkgs;
};

/** @param {string} file */
const isDocFile = (file) =>
  /^(docs\/|\.remarkrc\.mjs$|\.github\/pull_request_template\.md$|\.github\/ISSUE_TEMPLATE\/)/.test(
    file,
  ) || /(^|\/)README\.md$|^[^/]+\.md$/.test(file);

/** @param {string} file */
const isRootOrInfraFile = (file) =>
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.node-version|vite\.config\.ts|tsconfig(\.base)?\.json|stylelint\.config\.mjs|\.fallowrc\.jsonc|commitlint\.config\.mjs|compose\.yaml|tooling\/react-compiler\.ts)$/.test(
    file,
  ) || /^\.github\/(workflows|actions|rulesets)\//.test(file);

/**
 * @param {{ eventName: string; changedFiles: string[]; workspacePackages: WorkspacePackage[] }} input
 * @returns {ChangeClassification}
 */
export const classifyChangedFiles = ({ eventName, changedFiles, workspacePackages }) => {
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
      package_filters: "--filter '@merit/*' --filter '!@merit/storybook'",
    };
  }

  const files = changedFiles.filter(Boolean);
  const renovate = files.includes("renovate.json");
  const docsOnly = files.length > 0 && files.every(isDocFile);
  const renovateOnly = files.length > 0 && files.every((f) => f === "renovate.json");

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
    };
  }

  const fullRun = files.length === 0 || files.some(isRootOrInfraFile);
  if (fullRun) {
    return {
      renovate,
      docs_only: false,
      renovate_only: false,
      full_run: true,
      run_app: true,
      run_storybook: true,
      run_tooling: true,
      run_package_tests: true,
      package_filters: "--filter '@merit/*' --filter '!@merit/storybook'",
    };
  }

  // Sort longest dir first so nested packages match before parents.
  const sortedByDir = [...workspacePackages].sort((a, b) => b.dir.length - a.dir.length);
  /** @type {Map<string, Set<string>>} */
  const reverseDeps = new Map(workspacePackages.map((p) => [p.name, new Set()]));
  for (const pkg of workspacePackages) {
    for (const dep of pkg.deps) {
      reverseDeps.get(dep)?.add(pkg.name);
    }
  }

  /** @type {Set<string>} */
  const affected = new Set();
  /** @type {string[]} */
  const queue = [];
  let runTooling = false;

  for (const file of files) {
    if (file.startsWith("tooling/")) {
      runTooling = true;
    }
    const owner = sortedByDir.find((p) => file === p.dir || file.startsWith(`${p.dir}/`));
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

  const testablePackages = [...affected]
    .filter((name) => name !== "@merit/storybook")
    .sort((a, b) => a.localeCompare(b));

  return {
    renovate,
    docs_only: false,
    renovate_only: false,
    full_run: false,
    run_app: affected.has("@merit/app"),
    run_storybook: affected.has("@merit/storybook"),
    run_tooling: runTooling,
    run_package_tests: testablePackages.length > 0,
    package_filters: testablePackages.map((name) => `--filter '${name}'`).join(" "),
  };
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const eventName = process.env.EVENT_NAME ?? "pull_request";
  /** @type {string[]} */
  let changedFiles = [];

  if (eventName === "pull_request") {
    const baseSha = process.env.PR_BASE_SHA;
    const headSha = process.env.PR_HEAD_SHA || "HEAD";
    const diffRange = baseSha ? `${baseSha}...${headSha}` : "HEAD^1...HEAD";
    const raw = execFileSync("git", ["diff", "--name-only", diffRange], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    changedFiles = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
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
