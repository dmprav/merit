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
      "--filter '@merit/*' --filter '!@merit/storybook' test",
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

  // External actions and container images must remain pinned by digest/SHA.
  for (const [, ref] of workflow.matchAll(/^\s+uses:\s+(\S+)/gm)) {
    assert(ref);
    if (ref.startsWith("docker://")) {
      expect(ref).toMatch(/@sha256:[0-9a-f]{64}$/);
    } else {
      expect(ref).toMatch(/@[0-9a-f]{40}$/);
    }
  }
  for (const [, image] of workflow.matchAll(/^\s+(?:container|image):\s+(\S+)/gm)) {
    assert(image);
    expect(image).toMatch(/@sha256:[0-9a-f]{64}$/);
  }

  // Extract top-level job IDs under `jobs:` and ensure the `verify` aggregator awaits all others.
  const jobsBlock = workflow.split(/^jobs:\r?\n/m)[1] ?? "";
  const jobIds = [...jobsBlock.matchAll(/^  ([a-z0-9-]+):\r?$/gm)].map(([, id]) => id);
  expect(jobIds).toContain("verify");

  const verifyBlock = jobsBlock.split(/^  verify:\r?$/m)[1] ?? "";
  const neededJobs = [...verifyBlock.matchAll(/^\s+-\s+([a-z0-9-]+)\r?$/gm)].map(([, id]) => id);
  expect(neededJobs).toEqual(jobIds.filter((id) => id !== "verify"));
});
