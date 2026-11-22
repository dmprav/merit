import { assert, expect, it, vi } from "vite-plus/test";

import { createDemoTools } from "./demo";

it("preserves recovery details when TanStack validates a demo failure", () => {
  const tools = createDemoTools({ userId: "manager" }, { start: vi.fn() }, vi.fn());
  const demo = tools.find(({ name }) => name === "start_demo");
  assert(demo);
  const failure = {
    status: "unavailable",
    message: "Read the current state before retrying.",
    diagnosticId: crypto.randomUUID(),
  };
  expect(demo.outputSchema.parse(failure)).toEqual(failure);
  expect(demo.outputSchema.parse({ status: "unavailable" })).toEqual({ status: "unavailable" });
});

it("returns the workspace home link even when no sample round is available", async () => {
  const ready = {
    status: "ready" as const,
    workspaceId: "example-id",
    workspaceSlug: "demo-example",
    expiresAt: "2026-11-29T12:00:00.000Z",
  };
  const url = "https://merit.example/app/demo-example/rounds";
  const workspaceHomeUrl = vi.fn(() => url);
  const [start] = createDemoTools(
    { userId: "manager" },
    { start: vi.fn().mockResolvedValue(ready) },
    workspaceHomeUrl,
  );
  assert(start);
  expect(await start.execute({})).toEqual({ status: "ok", demo: { ...ready, url } });
  expect(workspaceHomeUrl).toHaveBeenCalledWith({
    slug: ready.workspaceSlug,
    canWorkOnGrants: true,
    canViewTeam: true,
  });
});
