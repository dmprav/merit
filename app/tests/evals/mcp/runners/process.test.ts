import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it, vi } from "vite-plus/test";

import { runCodex } from "./codex";
import { runCli, withTrialDirectory } from "./process";

const runChild = (script: string, timeout: number) =>
  withTrialDirectory(async (cwd) => {
    await symlink(process.execPath, join(cwd, "codex"));
    const reply = await runCli(
      "codex",
      ["-e", script],
      cwd,
      { PATH: cwd },
      timeout,
      "Trial failed",
    );
    return reply.stdout.trim();
  });

it("closes piped input for clients that wait for EOF before using the prompt", async () => {
  await expect(
    runChild('process.stdin.resume().on("end", () => console.log("ready"))', 2000),
  ).resolves.toBe("ready");
});

it("identifies a client timeout without exposing the child output", async () => {
  await expect(
    runChild('console.error("private"); setInterval(() => {}, 1000)', 100),
  ).rejects.toThrow(new Error("Trial failed (codex timed out after 0.1s)."));
});

it("reports a Codex subscription model rejection without echoing other CLI output", async () => {
  await withTrialDirectory(async (directory) => {
    await writeFile(
      join(directory, "codex"),
      `#!/bin/sh
if [ "$1" = login ]; then
  echo 'Logged in using ChatGPT'
  exit 0
fi
echo 'private client diagnostics' >&2
echo 'ERROR: {"error":{"type":"invalid_request_error","code":"model_not_found","message":"The model is not supported when using Codex with a ChatGPT account."}}' >&2
exit 1
`,
      { mode: 0o700 },
    );
    vi.stubEnv("PATH", directory);
    try {
      await expect(
        runCodex({
          model: "gpt-6-luna",
          auth: "subscription",
          url: "http://127.0.0.1",
          token: "test-token",
          prompt: "Test",
        }),
      ).rejects.toThrow(
        new Error(
          "Codex could not complete the eval (codex exit 1). gpt-6-luna is unavailable with ChatGPT login. Choose a model supported by your subscription.",
        ),
      );
    } finally {
      vi.unstubAllEnvs();
    }
    return "";
  });
});
