import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { errorMessage } from "../../cli.ts";
import type { RegisterCleanup } from "./cleanup.ts";

// A stopped process gets this long to exit after SIGTERM, then after SIGKILL.
const PROCESS_EXIT_GRACE_MS = 5_000;
const PROCESS_KILL_WAIT_MS = 1_000;
const READY_POLL_INTERVAL_MS = 250;
// Only recent output explains a failed start, so a process keeps its last chunks and a
// readiness error quotes the end of them.
const MAX_LOG_CHUNKS = 80;
const LOG_EXCERPT_CHARS = 4_000;
// The announced URL fits in this much recent output even when it spans two chunks.
const ANNOUNCEMENT_SCAN_CHARS = 1_024;

// Terminal color codes, which a forced-color environment can add to server output.
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export const allocateFreePort = async (): Promise<number> =>
  new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen({ port: 0, host: "127.0.0.1" }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => rejectPort(new Error("Could not determine ephemeral port.")));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          rejectPort(closeError);
          return;
        }
        resolvePort(port);
      });
    });
  });

export type ManagedProcess = {
  child: ChildProcess;
  getLogs: () => string;
  getSpawnError: () => Error | undefined;
  hasAnnouncedUrl: () => boolean;
};

const spawnDetached = (
  command: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) =>
  spawn(command, args, {
    cwd,
    env: env ?? process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

export const spawnManagedProcess = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; announcedUrl: string },
): ManagedProcess => {
  const outputChunks: string[] = [];
  let spawnError: Error | undefined;
  let announced = false;
  const child = spawnDetached(command, args, options.cwd, options.env);

  child.on("error", (error) => {
    spawnError ??= error;
    outputChunks.push(`Spawn error: ${error.message}\n`);
  });

  const watch = (stream: NodeJS.ReadableStream | null) => {
    let tail = "";
    stream?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      outputChunks.push(text);
      if (outputChunks.length > MAX_LOG_CHUNKS) {
        outputChunks.shift();
      }
      tail = `${tail}${text.replace(ANSI_ESCAPE_PATTERN, "")}`.slice(-ANNOUNCEMENT_SCAN_CHARS);
      if (tail.includes(options.announcedUrl)) {
        announced = true;
      }
    });
  };

  watch(child.stdout);
  watch(child.stderr);

  return {
    child,
    getLogs: () => outputChunks.join("").slice(-LOG_EXCERPT_CHARS),
    getSpawnError: () => spawnError,
    hasAnnouncedUrl: () => announced,
  };
};

const assertProcessAlive = (url: string, { child, getLogs, getSpawnError }: ManagedProcess) => {
  const spawnError = getSpawnError();
  if (spawnError) {
    throw new Error(
      `Server failed to start while waiting for ${url}: ${spawnError.message}\n${getLogs()}`,
    );
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    const detail = child.signalCode ? `signal ${child.signalCode}` : `code ${child.exitCode}`;
    throw new Error(`Server exited early with ${detail} while waiting for ${url}.\n${getLogs()}`);
  }
};

/** Asks `url` once; returns undefined when it answered, or why it is not ready yet. */
const probeReadiness = async (
  url: string,
  remainingMs: number,
  managed: ManagedProcess,
): Promise<string | undefined> => {
  if (!managed.hasAnnouncedUrl()) {
    return "server has not announced its URL";
  }
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(remainingMs),
    });
    return response.status >= 200 && response.status < 400 ? undefined : `HTTP ${response.status}`;
  } catch (error) {
    return errorMessage(error);
  }
};

/**
 * Waits until the started child announces `announcedUrl` and that URL answers. The port is
 * released between allocation and the child's bind, so an HTTP response alone could come from a
 * foreign listener; Vite prints its local URL only after it binds the port itself.
 */
export const waitForHttpReady = async (
  url: string,
  timeoutMs: number,
  managed: ManagedProcess,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    assertProcessAlive(url, managed);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    const notReady = await probeReadiness(url, remainingMs, managed);
    if (notReady === undefined) {
      assertProcessAlive(url, managed);
      return;
    }
    lastError = notReady;
    const sleepMs = Math.min(READY_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()));
    if (sleepMs > 0) {
      await delay(sleepMs);
    }
  }

  assertProcessAlive(url, managed);
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${url} (${lastError}).\n${managed.getLogs()}`,
  );
};

const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null;

/** Signals the child's whole process group, or the child alone when it leads none. */
const signalProcessGroup = (child: ChildProcess, pid: number, signal: NodeJS.Signals): boolean => {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      child.kill(signal);
      return true;
    } catch {
      return false;
    }
  }
};

export const stopChildProcess = async (child: ChildProcess): Promise<void> => {
  const { pid } = child;
  if (hasExited(child) || pid === undefined) {
    return;
  }
  const exitPromise = new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
  });
  if (!signalProcessGroup(child, pid, "SIGTERM")) {
    return;
  }
  await Promise.race([exitPromise, delay(PROCESS_EXIT_GRACE_MS)]);
  if (child.exitCode === null) {
    // A failure here means the process already exited.
    signalProcessGroup(child, pid, "SIGKILL");
    await Promise.race([exitPromise, delay(PROCESS_KILL_WAIT_MS)]);
  }
};

const waitForSuccessfulExit = (
  child: ChildProcess,
  label: string,
  output: { stdout: string[]; stderr: string[] },
) =>
  new Promise<void>((resolveRun, rejectRun) => {
    child.once("error", (error) => {
      rejectRun(new Error(`${label} failed to start: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      const detail = output.stderr.join("").trim() || output.stdout.join("").trim();
      const reason = signal ? `terminated by ${signal}` : `exited with code ${code ?? "unknown"}`;
      rejectRun(new Error(`${label} failed (${reason}).${detail ? `\n${detail}` : ""}`));
    });
  });

/** Runs a command to completion, stopping it through the cleanup stack if the run is torn down. */
export const runCommandAsync = async (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    label: string;
    registerCleanup: RegisterCleanup;
  },
): Promise<void> => {
  const output = { stdout: [] as string[], stderr: [] as string[] };
  const child = spawnDetached(command, args, options.cwd, options.env);
  const stop = options.registerCleanup(() => stopChildProcess(child));

  child.stdout?.on("data", (chunk: Buffer) => {
    output.stdout.push(chunk.toString("utf8"));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output.stderr.push(chunk.toString("utf8"));
  });

  try {
    await waitForSuccessfulExit(child, options.label, output);
  } finally {
    if (child.exitCode === null) {
      // The command's own failure is the one to report here; `stop` is the registered cleanup,
      // so the cleanup stack logs its failure when it drains.
      await stop().catch(() => undefined);
    }
  }
};
