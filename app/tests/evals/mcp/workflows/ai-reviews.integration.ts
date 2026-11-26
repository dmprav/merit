import { expect } from "vite-plus/test";

import { catalogTest } from "../catalog-trial";

catalogTest("runs an AI review once and leaves assessments untouched", async ({ catalog }) => {
  const { scripted, grade, server } = await catalog("run-ai-review");
  const reply = await scripted();
  expect(server.trace.map(({ name }) => name)).toContain("run_ai_review");
  expect((await grade(reply)).effects).toEqual([]);
});

catalogTest("reads saved AI reviews without running another", async ({ catalog }) => {
  const { scripted, grade, server } = await catalog("read-ai-reviews");
  const reply = await scripted();
  expect(server.trace.map(({ name }) => name)).not.toContain("run_ai_review");
  expect((await grade(reply)).effects).toEqual([]);
});
