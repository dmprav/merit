import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type TrialInput = {
  model: string;
  auth: "subscription" | "api-key";
  url: string;
  mailUrl?: string;
  token: string;
  prompt: string;
};

const exec = promisify(execFile);

export const withTrialDirectory = async (run: (cwd: string) => Promise<string>) => {
  const cwd = await mkdtemp(join(tmpdir(), "merit-eval-"));
  try {
    return await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
};

export const runCli = async (
  binary: "codex" | "claude",
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout: number,
  failure: string,
  describeFailure?: (stderr: string) => string | undefined,
) => {
  try {
    const execution = exec(binary, args, {
      cwd,
      env,
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 8 * 1024 * 1024,
    });
    // Prompts are passed in argv. Codex waits for EOF before appending piped stdin.
    execution.child.stdin?.end();
    return await execution;
  } catch (error) {
    // ChildProcess errors carry arguments and raw stdout/stderr, including login details.
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === null &&
      "killed" in error &&
      error.killed &&
      "signal" in error &&
      error.signal === "SIGKILL"
    ) {
      throw new Error(`${failure} (${binary} timed out after ${timeout / 1000}s).`);
    }
    const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
    const detail =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? describeFailure?.(error.stderr)
        : undefined;
    throw new Error([`${failure} (${binary} exit ${code}).`, detail].filter(Boolean).join(" "));
  }
};
