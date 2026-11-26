import { once } from "node:events";
import { createServer } from "node:net";

import { assert, expect, test } from "vite-plus/test";

import { listenForWorkerReadiness } from "./readiness";

test("an occupied readiness port can be retried by the same worker", async () => {
  await using blocker = createServer().listen(0, "127.0.0.1");
  await once(blocker, "listening");
  const address = blocker.address();
  assert(address && typeof address !== "string");
  const stop = new AbortController();
  try {
    await expect(listenForWorkerReadiness(address.port, stop.signal)).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
    blocker.close();
    await once(blocker, "close");
    await listenForWorkerReadiness(address.port, stop.signal);
    const probe = await fetch(`http://127.0.0.1:${address.port}/_ready`);
    expect(probe.status).toBe(204);
  } finally {
    stop.abort();
  }
});
