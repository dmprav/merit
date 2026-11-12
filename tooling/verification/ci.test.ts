import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadConfigFromFile } from "vite-plus";
import { assert, expect, test } from "vite-plus/test";

const loadTasks = async () => {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  );
  const tasks = loaded?.config.run?.tasks;
  assert(tasks);
  return tasks;
};

test("CI retains core checks while presentation and tooling self-tests are deferred", async () => {
  const tasks = await loadTasks();
  const ready = tasks.ready;
  assert(ready && typeof ready === "object" && !Array.isArray(ready));

  expect(tasks["ready:ci"]).toEqual({
    command: "vp run test:ci",
    dependsOn: ready.dependsOn
      ?.filter((task) => task !== "ready:tooling")
      .map((task) => (task === "ready:runtime" || task === "ready:tests" ? `${task}:ci` : task)),
    cache: false,
  });
  expect(ready.command).toBe("vp run test:checks");
  expect(tasks["ready:tests:ci"]).toEqual({
    command:
      "vp run --parallel --concurrency-limit 4 --filter '@merit/*' --filter '!@merit/storybook' test --project '!browser' --exclude '**/*.test.tsx' --passWithNoTests",
    dependsOn: ["ready:build"],
    cache: false,
  });
  expect(tasks["ready:runtime:ci"]).toEqual({
    command: "vp run @merit/app#test:integration",
    dependsOn: ["ready:tests:ci"],
    cache: false,
  });
  expect(tasks["ready:static"]).toHaveProperty(
    "command",
    expect.arrayContaining(["vp run architecture"]),
  );
  expect(tasks["ready:tests"]).toHaveProperty("dependsOn", ["ready:build"]);
  expect(tasks["ready:runtime"]).toHaveProperty(
    "command",
    expect.arrayContaining(["vp run test:browser:all", "vp run @merit/app#test:workspace:all"]),
  );
});

test("deferred verification runs every ready stage after a build, even when a stage fails", async () => {
  const tasks = await loadTasks();
  const ready = tasks.ready;
  assert(ready && typeof ready === "object" && !Array.isArray(ready) && ready.dependsOn);
  const stages = ready.dependsOn.filter((stage) => typeof stage === "string");
  expect(stages).toHaveLength(ready.dependsOn.length);
  const workflow = await readFile(
    new URL("../../.github/workflows/deferred.yml", import.meta.url),
    "utf8",
  );

  expect(workflow).toContain("vp run --no-cache ready:build ");
  expect(
    [...workflow.matchAll(/vp run --no-cache --ignore-depends-on (\S+)/g)].map(([, task]) => task),
  ).toEqual([...stages, "ready"]);
  // Stages run without their dependencies, so each may depend only on the build or earlier stages.
  stages.forEach((stage, index) => {
    const task = tasks[stage];
    assert(task, stage);
    if (typeof task !== "object" || Array.isArray(task)) {
      return;
    }
    expect(["ready:build", ...stages.slice(0, index)]).toEqual(
      expect.arrayContaining(task.dependsOn ?? []),
    );
  });
  expect(
    workflow.match(/if: \$\{\{ !cancelled\(\) && steps\.build\.outcome == 'success' \}\}/g),
  ).toHaveLength(stages.length + 1);
});
