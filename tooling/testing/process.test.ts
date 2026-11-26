import { tmpdir } from "node:os";

import { describe, expect, test } from "vite-plus/test";

import { runProcess } from "./process";

const node = process.execPath;
const cwd = tmpdir();
// Longer than each test's own timeout, so a test fails if the helper waits for it.
const timeoutMs = 60_000;

describe.concurrent("runProcess", () => {
  test("resolves with the exit status and output", async () => {
    const result = await runProcess(
      node,
      ["-e", "process.stdout.write('out'); process.stderr.write('err'); process.exitCode = 3;"],
      { cwd, timeoutMs },
    );

    expect(result).toEqual({ status: 3, stdout: "out", stderr: "err", output: "outerr" });
  });

  test("runs in the given directory with the given environment", async () => {
    const result = await runProcess(
      node,
      ["-e", "process.stdout.write(`${process.cwd()} ${process.env.MERIT_PROBE}`)"],
      { cwd, timeoutMs, env: { MERIT_PROBE: "probe" } },
    );

    expect(result.stdout).toBe(`${cwd} probe`);
  });

  test("rejects promptly when the child is killed by a signal", async () => {
    await expect(
      runProcess(node, ["-e", "process.kill(process.pid, 'SIGTERM')"], { cwd, timeoutMs }),
    ).rejects.toThrow(`${node} was killed by SIGTERM`);
  }, 5_000);

  test("rejects and kills the child when it runs past the timeout", async () => {
    await expect(
      runProcess(node, ["-e", "setTimeout(() => {}, 60_000)"], { cwd, timeoutMs: 200 }),
    ).rejects.toThrow(`${node} timed out after 200 ms`);
  }, 5_000);

  test("rejects when the command cannot start", async () => {
    await expect(
      runProcess("merit-command-that-does-not-exist", [], { cwd, timeoutMs }),
    ).rejects.toThrow("ENOENT");
  }, 5_000);
});
