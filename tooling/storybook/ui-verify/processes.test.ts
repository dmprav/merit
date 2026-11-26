import { createServer, type Server } from "node:http";

import { describe, expect, it } from "vite-plus/test";

import { allocateFreePort, spawnManagedProcess, waitForHttpReady } from "./processes.ts";

const listen = async (port: number): Promise<Server> => {
  const server = createServer((_request, response) => response.end("foreign"));
  await new Promise<void>((resolveListen) => server.listen(port, "127.0.0.1", resolveListen));
  return server;
};

describe("allocateFreePort", () => {
  it("allocates a free ephemeral port", async () => {
    const port = await allocateFreePort();
    expect(port).toBeGreaterThan(1024);
    expect(port).toBeLessThanOrEqual(65535);
  });
});

describe("waitForHttpReady", () => {
  it("does not accept a foreign listener on the allocated port as the started server", async () => {
    const port = await allocateFreePort();
    const foreign = await listen(port);
    const url = `http://127.0.0.1:${port}`;
    // Simulates `--strictPort` failing because the port was taken after allocation.
    const managed = spawnManagedProcess(
      process.execPath,
      ["-e", "setTimeout(() => process.exit(1), 300)"],
      { cwd: process.cwd(), announcedUrl: `${url}/` },
    );
    try {
      await expect(waitForHttpReady(url, 5_000, managed)).rejects.toThrow(/exited early/);
    } finally {
      managed.child.kill();
      await new Promise((resolveClose) => foreign.close(resolveClose));
    }
  });

  it("accepts the started server once it announces its URL and responds", async () => {
    const port = await allocateFreePort();
    const url = `http://127.0.0.1:${port}`;
    const script = `require("node:http").createServer((q, r) => r.end("ok")).listen(${port}, "127.0.0.1", () => console.log("  Local:   ${url}/"));`;
    const managed = spawnManagedProcess(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      announcedUrl: `${url}/`,
    });
    try {
      await waitForHttpReady(url, 10_000, managed);
      expect(managed.hasAnnouncedUrl()).toBe(true);
    } finally {
      managed.child.kill();
    }
  });

  it("reports a server that cannot be spawned instead of crashing", async () => {
    const managed = spawnManagedProcess("merit-ui-verify-missing-command", [], {
      cwd: process.cwd(),
      announcedUrl: "http://127.0.0.1:1/",
    });
    await expect(waitForHttpReady("http://127.0.0.1:1", 5_000, managed)).rejects.toThrow(
      /failed to start/,
    );
  });
});
