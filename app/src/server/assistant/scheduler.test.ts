import { expect, it, vi } from "vite-plus/test";

import { createAssistantWorker } from "./scheduler.server";

it("discards a pending recovery scan when the worker closes and can restart", async () => {
  const work = { userId: "manager", workspaceSlug: "workspace", id: "first" };
  const running = vi
    .fn()
    .mockResolvedValueOnce([work])
    .mockResolvedValueOnce([{ ...work, id: "second" }]);
  const run = vi.fn().mockResolvedValue(undefined);
  const worker = createAssistantWorker(running, run);
  try {
    worker.start();
    worker.close();
    worker.start();
    await Promise.resolve();
    expect(running).toHaveBeenLastCalledWith(4, undefined);
    expect(run).toHaveBeenCalledExactlyOnceWith({ userId: "manager" }, "workspace", "second");
  } finally {
    worker.close();
  }
});
