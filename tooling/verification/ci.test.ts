import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { loadConfigFromFile } from "vite-plus";
import { assert, expect, test } from "vite-plus/test";

import { REPO_ROOT } from "../paths.ts";

const loadTasks = async () => {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    `${REPO_ROOT}/vite.config.ts`,
  );
  const tasks = loaded?.config.run?.tasks;
  assert(tasks);
  return tasks;
};

test("retired CI shortcuts and deferred workflow are removed", async () => {
  const tasks = await loadTasks();
  expect(tasks["ready:ci"]).toBeUndefined();
  expect(tasks["ready:tests:ci"]).toBeUndefined();
  expect(tasks["ready:runtime:ci"]).toBeUndefined();
  expect(existsSync(`${REPO_ROOT}/.github/workflows/deferred.yml`)).toBe(false);

  const browserConfig = await readFile(`${REPO_ROOT}/tooling/testing/browser/config.ts`, "utf8");
  expect(browserConfig).not.toContain("MERIT_BROWSER_RETRIES");
  // One CI retry labels flaky tests; failing on them keeps the gate as strict as no retries.
  expect(browserConfig).toContain("retries: process.env.CI ? 1 : 0");
  expect(browserConfig).toContain("failOnFlakyTests: Boolean(process.env.CI)");
});

test("ready:tests caps package concurrency cleanly", async () => {
  const tasks = await loadTasks();
  expect(tasks["ready:tests"]).toEqual({
    command: "vp run -r --parallel --concurrency-limit 2 test",
    dependsOn: ["ready:build"],
    cache: false,
  });
});

test("CI verify workflow covers every ready stage and sharded browser suite", async () => {
  const tasks = await loadTasks();
  const ready = tasks.ready;
  assert(ready && typeof ready === "object" && !Array.isArray(ready) && ready.dependsOn);
  const workflow = await readFile(`${REPO_ROOT}/.github/workflows/verify.yml`, "utf8");
  const ruleset = JSON.parse(await readFile(`${REPO_ROOT}/.github/rulesets/main.json`, "utf8")) as {
    rules: Array<{
      type: string;
      parameters?: { required_status_checks?: Array<{ context: string }> };
    }>;
  };

  expect(workflow).not.toContain("ready:ci");
  expect(workflow).not.toContain("MERIT_BROWSER_RETRIES");

  // Required check context from .github/rulesets/main.json must stay the aggregator job.
  const requiredContexts = ruleset.rules
    .filter((rule) => rule.type === "required_status_checks")
    .flatMap(
      (rule) => rule.parameters?.required_status_checks?.map((check) => check.context) ?? [],
    );
  expect(requiredContexts).toContain("verify");

  // Every stage listed in `ready.dependsOn` must map explicitly to verify.yml jobs.
  const stages = ready.dependsOn.filter((stage): stage is string => typeof stage === "string");
  expect(stages).toHaveLength(ready.dependsOn.length);

  const stageWorkflowChecks: Record<string, string[]> = {
    "ready:static": [
      "vp run --no-cache ready:build",
      "vp run --no-cache --ignore-depends-on ready:static",
    ],
    "ready:tests": [
      "PACKAGE_FILTERS: ${{ needs.changes.outputs.package_filters }}",
      '"${filters[@]}" test',
      "vp run --no-cache @merit/storybook#test",
    ],
    "ready:runtime": [
      "vp run --no-cache @merit/app#test:integration",
      "vp run --no-cache test:browser:tooling:all",
      "vp run --no-cache test:browser:stories:all --shard=${{ matrix.shard }}",
      "vp run --no-cache test:browser:app:all --shard=${{ matrix.shard }}",
      "vp run --no-cache @merit/app#test:workspace:all --shard=${{ matrix.shard }}",
    ],
    "ready:tooling": ["vp run --no-cache ready:tooling"],
    "check:security": ["vp run --no-cache check:secrets", "vp run --no-cache check:dependencies"],
  };

  expect(new Set(Object.keys(stageWorkflowChecks))).toEqual(new Set(stages));
  for (const stage of stages) {
    for (const expectedCommand of stageWorkflowChecks[stage] ?? []) {
      expect(workflow).toContain(expectedCommand);
    }
  }
  expect(workflow).toContain("vp run --no-cache test:checks");
  // Advisories block only changes to dependency files; elsewhere they are reported.
  expect(workflow).toContain(
    "continue-on-error: ${{ needs.changes.outputs.dependencies_changed != 'true' }}",
  );

  // External actions and container images must remain pinned by digest/SHA,
  // across every workflow and local composite action.
  const workflowFiles = readdirSync(`${REPO_ROOT}/.github/workflows`)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  expect(workflowFiles).toContain("verify.yml");
  expect(workflowFiles).toContain("prune-verifications.yml");
  expect(workflowFiles).toContain("review-packet.yml");
  const workflowContents = await Promise.all(
    workflowFiles.map((name) => readFile(`${REPO_ROOT}/.github/workflows/${name}`, "utf8")),
  );
  const reviewPacketWorkflow = await readFile(
    `${REPO_ROOT}/.github/workflows/review-packet.yml`,
    "utf8",
  );
  expect(
    reviewPacketWorkflow
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*$/, "").trimEnd())
      .filter((line) => line.startsWith("permissions:")),
  ).toEqual(["permissions: {}"]);
  expect(reviewPacketWorkflow).toContain(
    "github.event.pull_request.head.repo.full_name == github.repository",
  );
  expect(reviewPacketWorkflow).toContain("persist-credentials: false");
  expect(reviewPacketWorkflow).toContain("fetch-depth: 0");
  const pruneWorkflow = await readFile(
    `${REPO_ROOT}/.github/workflows/prune-verifications.yml`,
    "utf8",
  );
  const pruneLines = pruneWorkflow.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trimEnd());
  // Top-level permissions must be explicitly empty (`permissions: {}` at column 0).
  const topLevelPermissions = pruneLines.filter((line) => line.startsWith("permissions:"));
  expect(topLevelPermissions).toEqual(["permissions: {}"]);
  // Locate the checkout step under `jobs.prune.steps` and validate its `with:` keys directly.
  const checkoutIdx = pruneLines.findIndex((line) =>
    /^\s+(?:-\s+)?uses:\s+actions\/checkout@[0-9a-f]{40}$/.test(line),
  );
  expect(checkoutIdx).toBeGreaterThan(-1);
  const checkoutIndent = pruneLines[checkoutIdx]?.search(/\S/) ?? 0;
  const checkoutWith = new Map<string, string>();
  let inWithBlock = false;
  let withIndent = -1;
  for (const line of pruneLines.slice(checkoutIdx + 1)) {
    if (!line.trim()) {
      continue;
    }
    const indent = line.search(/\S/);
    if (indent < checkoutIndent || (indent <= checkoutIndent && /^\s*-\s+/.test(line))) {
      break;
    }
    if (!inWithBlock) {
      if (indent === checkoutIndent && /^\s*with:\s*$/.test(line)) {
        inWithBlock = true;
        withIndent = indent;
      }
      continue;
    }
    if (indent <= withIndent) {
      break;
    }
    const kv = /^\s*([a-z0-9-]+):\s*(\S.*)$/.exec(line);
    if (kv?.[1] && kv[2]) {
      checkoutWith.set(kv[1], kv[2].trim());
    }
  }
  expect(checkoutWith.get("persist-credentials")).toBe("false");
  expect(checkoutWith.get("fetch-depth")).toBe("0");
  const setupWorkspaceAction = await readFile(
    `${REPO_ROOT}/.github/actions/setup-workspace/action.yml`,
    "utf8",
  );
  const forwardPortsAction = await readFile(
    `${REPO_ROOT}/.github/actions/forward-service-ports/action.yml`,
    "utf8",
  );
  const actionFiles = [...workflowContents, setupWorkspaceAction, forwardPortsAction];
  for (const contents of actionFiles) {
    for (const [, ref] of contents.matchAll(/^[ \t]+(?:-\s+)?uses:[ \t]+["']?([^"'\s#]+)["']?/gm)) {
      assert(ref);
      if (ref.startsWith("./.github/actions/")) {
        expect(existsSync(`${REPO_ROOT}/${ref.slice(2)}/action.yml`)).toBe(true);
      } else if (ref.startsWith("docker://")) {
        expect(ref).toMatch(/@sha256:[0-9a-f]{64}$/);
      } else {
        expect(ref).toMatch(/@[0-9a-f]{40}$/);
      }
    }
    for (const [, image] of contents.matchAll(
      /^[ \t]+(?:container|image):[ \t]+["']?([^"'\s#]+)["']?/gm,
    )) {
      assert(image);
      expect(image).toMatch(/@sha256:[0-9a-f]{64}$/);
    }
  }
  expect(setupWorkspaceAction).toContain("download-build:");
  expect(forwardPortsAction).toContain("forwards:");
  const storybookImage = /browser-storybook:[\s\S]*?^\s+container:\s+(\S+)/m.exec(workflow)?.[1];
  assert(storybookImage);
  const visualContainerScript = await readFile(
    `${REPO_ROOT}/tooling/storybook/run-visual-container.ts`,
    "utf8",
  );
  expect(visualContainerScript).toContain(storybookImage);
  expect(reviewPacketWorkflow).toContain(storybookImage);
  expect(reviewPacketWorkflow).toContain("cleanup-screenshots:");

  // Extract top-level job IDs under `jobs:` and ensure the `verify` aggregator awaits all others.
  const jobsBlock = workflow.split(/^jobs:\r?\n/m)[1] ?? "";
  const jobIds = [...jobsBlock.matchAll(/^  ([a-z0-9-]+):\r?$/gm)].map(([, id]) => id);
  expect(jobIds).toContain("verify");

  const verifyBlock = jobsBlock.split(/^  verify:\r?$/m)[1] ?? "";
  const neededJobs = [...verifyBlock.matchAll(/^\s+-\s+([a-z0-9-]+)\r?$/gm)].map(([, id]) => id);
  expect(neededJobs).toEqual(jobIds.filter((id) => id !== "verify"));
});

test("CI uploads package Vitest reports from each workspace package without walking node_modules", async () => {
  const workflow = await readFile(`${REPO_ROOT}/.github/workflows/verify.yml`, "utf8");
  const workspace = await readFile(`${REPO_ROOT}/pnpm-workspace.yaml`, "utf8");

  // upload-artifact reads the whole tree for a `**` pattern, including node_modules, and hangs.
  const uploadPaths = [...workflow.matchAll(/^\s+path:\s*(?:\|\r?\n((?:\s{12}.*\r?\n)+)|(.+))/gm)]
    .flatMap(([, block, single]) => (block ?? single ?? "").split(/\r?\n/))
    .map((path) => path.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  expect(uploadPaths.filter((path) => path.startsWith("**"))).toEqual([]);

  const packagesBlock = workspace.match(/^packages:\r?\n((?: {2}- .*\r?\n)+)/m)?.[1] ?? "";
  const packageGlobs = [...packagesBlock.matchAll(/^ {2}- (\S+)/gm)]
    .map(([, glob]) => glob)
    .filter((glob): glob is string => glob !== undefined);
  const reportPaths = uploadPaths.filter((path) => path.endsWith("/.vitest-report.json"));
  expect(reportPaths).toEqual(packageGlobs.map((glob) => `${glob}/.vitest-report.json`));
});
