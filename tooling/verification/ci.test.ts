import { fileURLToPath } from "node:url";

import { loadConfigFromFile } from "vite-plus";
import { assert, expect, test } from "vite-plus/test";

test("CI retains core checks while presentation and tooling self-tests are deferred", async () => {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  );
  const tasks = loaded?.config.run?.tasks;
  assert(tasks);
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
