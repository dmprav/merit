import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadConfigFromFile } from "vite-plus";
import { assert, expect, test } from "vite-plus/test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const loadTasks = async () => {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    `${repoRoot}/vite.config.ts`,
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
  expect(existsSync(`${repoRoot}/.github/workflows/deferred.yml`)).toBe(false);

  const browserConfig = await readFile(`${repoRoot}/tooling/testing/browser/config.ts`, "utf8");
  expect(browserConfig).not.toContain("MERIT_BROWSER_RETRIES");
  expect(browserConfig).toContain("retries: 0");
});

test("ready:tests caps package concurrency cleanly", async () => {
  const tasks = await loadTasks();
  expect(tasks["ready:tests"]).toEqual({
    command: "vp run -r --parallel --concurrency-limit 2 test",
    dependsOn: ["ready:build"],
    cache: false,
  });
});

test("CI verify workflow covers every ready stage and sharded browser suite without retries", async () => {
  const tasks = await loadTasks();
  const ready = tasks.ready;
  assert(ready && typeof ready === "object" && !Array.isArray(ready) && ready.dependsOn);
  const workflow = await readFile(`${repoRoot}/.github/workflows/verify.yml`, "utf8");
  const ruleset = JSON.parse(await readFile(`${repoRoot}/.github/rulesets/main.json`, "utf8")) as {
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
      "${{ needs.changes.outputs.package_filters }} test",
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
    "check:security": ["vp run --no-cache check:security"],
  };

  expect(new Set(Object.keys(stageWorkflowChecks))).toEqual(new Set(stages));
  for (const stage of stages) {
    for (const expectedCommand of stageWorkflowChecks[stage] ?? []) {
      expect(workflow).toContain(expectedCommand);
    }
  }
  expect(workflow).toContain("vp run --no-cache test:checks");

  // External actions and container images must remain pinned by digest/SHA,
  // including inside local composite actions.
  const actionFiles = [
    workflow,
    await readFile(`${repoRoot}/.github/actions/setup-workspace/action.yml`, "utf8"),
    await readFile(`${repoRoot}/.github/actions/forward-service-ports/action.yml`, "utf8"),
  ];
  for (const contents of actionFiles) {
    for (const [, ref] of contents.matchAll(/^\s+uses:\s+(\S+)/gm)) {
      assert(ref);
      if (ref.startsWith("./.github/actions/")) {
        expect(existsSync(`${repoRoot}/${ref.slice(2)}/action.yml`)).toBe(true);
      } else if (ref.startsWith("docker://")) {
        expect(ref).toMatch(/@sha256:[0-9a-f]{64}$/);
      } else {
        expect(ref).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  }
  const forwardPortsAction = await readFile(
    `${repoRoot}/.github/actions/forward-service-ports/action.yml`,
    "utf8",
  );
  expect(actionFiles[1]).toContain("download-build:");
  expect(forwardPortsAction).toContain("forwards:");
  for (const [, image] of workflow.matchAll(/^\s+(?:container|image):\s+(\S+)/gm)) {
    assert(image);
    expect(image).toMatch(/@sha256:[0-9a-f]{64}$/);
  }
  const storybookImage = /browser-storybook:[\s\S]*?^\s+container:\s+(\S+)/m.exec(workflow)?.[1];
  assert(storybookImage);
  const visualContainerScript = await readFile(
    `${repoRoot}/tooling/storybook/run-visual-container.ts`,
    "utf8",
  );
  expect(visualContainerScript).toContain(storybookImage);

  // Extract top-level job IDs under `jobs:` and ensure the `verify` aggregator awaits all others.
  const jobsBlock = workflow.split(/^jobs:\r?\n/m)[1] ?? "";
  const jobIds = [...jobsBlock.matchAll(/^  ([a-z0-9-]+):\r?$/gm)].map(([, id]) => id);
  expect(jobIds).toContain("verify");

  const verifyBlock = jobsBlock.split(/^  verify:\r?$/m)[1] ?? "";
  const neededJobs = [...verifyBlock.matchAll(/^\s+-\s+([a-z0-9-]+)\r?$/gm)].map(([, id]) => id);
  expect(neededJobs).toEqual(jobIds.filter((id) => id !== "verify"));
});

test("CI uploads package Vitest reports from each workspace package without walking node_modules", async () => {
  const workflow = await readFile(`${repoRoot}/.github/workflows/verify.yml`, "utf8");
  const workspace = await readFile(`${repoRoot}/pnpm-workspace.yaml`, "utf8");

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
