import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { getErrnoCode } from "../../agents/file-lock.ts";
import { errorMessage } from "../../cli.ts";
import type { RegisterCleanup } from "./cleanup.ts";

// A stopped process group gets this long to empty after SIGTERM, then after SIGKILL, and is
// checked this often meanwhile.
const PROCESS_EXIT_GRACE_MS = 5_000;
const PROCESS_KILL_WAIT_MS = 1_000;
const PROCESS_GROUP_POLL_INTERVAL_MS = 50;
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

/**
 * Whether a Linux process group has a member that has not exited, read from `/proc`. An exited
 * member whose parent has not reaped it, which happens when an orphan's new parent never reaps,
 * stays in the group as a zombie but holds no ports or pipes, so it does not count.
 */
const hasLinuxProcessGroupMember = (pgid: number): boolean =>
  readdirSync("/proc").some((entry) => {
    if (!/^\d+$/.test(entry)) {
      return false;
    }
    let stat: string;
    try {
      stat = readFileSync(`/proc/${entry}/stat`, "utf8");
    } catch {
      // The process exited between the listing and the read.
      return false;
    }
    // The command name in parentheses can contain spaces, so fields are read after its end:
    // state, parent pid, then process group.
    const [state, , group] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return Number(group) === pgid && state !== "Z" && state !== "X";
  });

/** Whether the group has a member that has not exited; `EPERM` means one this process may not signal. */
const isProcessGroupAlive = (pgid: number): boolean => {
  if (process.platform === "linux") {
    return hasLinuxProcessGroupMember(pgid);
  }
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return getErrnoCode(error) === "EPERM";
  }
};

/** Signals every process in the group; returns false when the group has no processes left. */
const signalProcessGroup = (pgid: number, signal: NodeJS.Signals): boolean => {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch (error) {
    if (getErrnoCode(error) === "ESRCH") {
      return false;
    }
    throw error;
  }
};

/** Polls until the group has no processes left; returns false if it still has some at the deadline. */
const waitForProcessGroupExit = async (pgid: number, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (isProcessGroupAlive(pgid)) {
    if (Date.now() >= deadline) {
      return false;
    }
    await delay(PROCESS_GROUP_POLL_INTERVAL_MS);
  }
  return true;
};

/**
 * Stops the process group a detached child leads: SIGTERM, then SIGKILL after a grace period.
 * The child's own exit proves nothing about the group, because a descendant can outlive it and
 * keep servers and inherited pipes open, so this resolves only once the group has no processes
 * left and rejects if one survives SIGKILL. A Linux pid is not reused while it names a live
 * process group, so the leader's pid still addresses the group after the leader has exited.
 */
export const stopProcessGroup = async (child: ChildProcess): Promise<void> => {
  const pgid = child.pid;
  if (pgid === undefined) {
    // The spawn failed, so there is no group.
    return;
  }
  const stages: ReadonlyArray<[NodeJS.Signals, number]> = [
    ["SIGTERM", PROCESS_EXIT_GRACE_MS],
    ["SIGKILL", PROCESS_KILL_WAIT_MS],
  ];
  for (const [signal, waitMs] of stages) {
    if (!signalProcessGroup(pgid, signal) || (await waitForProcessGroupExit(pgid, waitMs))) {
      return;
    }
  }
  throw new Error(`Process group ${pgid} was still running after SIGKILL.`);
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

/**
 * Runs a command to completion, then stops anything left in its process group. A teardown that
 * starts meanwhile stops the group through the cleanup stack.
 */
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
  const stop = options.registerCleanup(() => stopProcessGroup(child));

  child.stdout?.on("data", (chunk: Buffer) => {
    output.stdout.push(chunk.toString("utf8"));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output.stderr.push(chunk.toString("utf8"));
  });

  try {
    await waitForSuccessfulExit(child, options.label, output);
  } finally {
    // The command's exit leaves its descendants running, so its group is stopped however it
    // exited. The command's own failure is the one to report here; `stop` is the registered
    // cleanup, so the cleanup stack logs its failure when it drains.
    await stop().catch(() => undefined);
  }
};
