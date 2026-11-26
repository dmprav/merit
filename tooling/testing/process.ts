import { spawn } from "node:child_process";

export interface RunProcessOptions {
  cwd: string;
  /** Kills the child with SIGKILL and rejects once it runs this long. */
  timeoutMs: number;
  /** Replaces the inherited environment. */
  env?: NodeJS.ProcessEnv;
}

export interface ProcessResult {
  status: number;
  stdout: string;
  stderr: string;
  /** Standard output and error interleaved in arrival order. */
  output: string;
}

/**
 * Runs a command to completion for a test. Settles exactly once: resolves with the exit
 * status, or rejects when the command cannot start, is killed by a signal, or times out,
 * so a failing child fails the calling test instead of leaving it to Vitest's timeout.
 */
export const runProcess = (
  command: string,
  args: readonly string[],
  { cwd, timeoutMs, env = process.env }: RunProcessOptions,
) =>
  new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs} ms:\n${output}`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      output += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      if (status === null) {
        reject(new Error(`${command} was killed by ${signal ?? "an unknown signal"}`));
        return;
      }
      resolve({ status, stdout, stderr, output });
    });
  });
