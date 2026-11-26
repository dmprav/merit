import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

import { uniqueName } from "@merit/workflows/testing";

const app = fileURLToPath(new URL("..", import.meta.url));
const vpx = fileURLToPath(new URL("../node_modules/.bin/vpx", import.meta.url));

const runEntry = (environment: Record<string, string>, timeoutMs: number) =>
  new Promise<{ code: number | null; output: string; timedOut: boolean }>((resolve) => {
    const child = spawn(vpx, ["src/worker/main.ts"], {
      cwd: app,
      env: { ...process.env, MERIT_LOCAL_WORKER: "1", ...environment },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, output, timedOut: true });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut: false });
    });
  });

// Runs against the Compose Temporal service: `docker compose up -d --wait`.
it("exits non-zero within a bounded time when the namespace does not exist", async () => {
  const result = await runEntry({ TEMPORAL_NAMESPACE: uniqueName("missing-namespace") }, 30_000);

  expect(result.timedOut).toBe(false);
  expect(result.code).toBe(1);
  expect(result.output).toContain("[worker] The worker stopped:");
}, 40_000);
