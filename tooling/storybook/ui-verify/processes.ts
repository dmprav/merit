import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { getErrnoCode, isProcessAlive } from "../../agents/file-lock.ts";
import { isLiveProcessGroupMember, readProcessStat } from "../../agents/process-stat.ts";
import { errorMessage } from "../../cli.ts";
import type { RegisterCleanup } from "./cleanup.ts";

// By default a stopped process group gets this long to empty after SIGTERM, then after
// SIGKILL, and is checked this often meanwhile.
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
) => {
  const child = spawn(command, args, {
    cwd,
    env: env ?? process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  recordGroupEmptiedAtLeaderExit(child);
  return child;
};

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

/** What stopping a detached child's process group reads from the child. */
export type StoppableChild = Pick<ChildProcess, "pid" | "exitCode" | "signalCode">;

/** Whether the group has any member, zombie or not; `EPERM` means one this process may not signal. */
const processGroupExists = (pgid: number): boolean => {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return getErrnoCode(error) === "EPERM";
  }
};

/**
 * Whether the group still has a member that has not exited. A detached child leads both its
 * own group and its own session, and its descendants inherit both. On Linux a member that has
 * exited but whose new parent never reaps it, as an orphan in a container without an init
 * process can be, stays in the group as a zombie; it holds no ports or pipes, so it does not
 * count. An entry that exists but cannot be read may be a member, so it counts.
 */
const isProcessGroupAlive = (pgid: number): boolean => {
  if (!processGroupExists(pgid)) {
    return false;
  }
  if (process.platform !== "linux") {
    return true;
  }
  return readdirSync("/proc").some((entry) => {
    if (!/^\d+$/.test(entry)) {
      return false;
    }
    const reading = readProcessStat(entry);
    return (
      reading.kind === "unreadable" ||
      (reading.kind === "read" && isLiveProcessGroupMember(reading.stat, pgid))
    );
  });
};

/**
 * The state of the group a detached child leads. Its pgid is the child's pid, and a pid is not
 * reused while any process, group, or session still bears it. So once the child has exited,
 * another process with its pid proves the group emptied and the pid was reassigned, and the
 * group's former pgid must not be signalled.
 */
type ChildGroupState = "alive" | "empty" | "reassigned";

const readChildGroupState = (child: StoppableChild, pgid: number): ChildGroupState => {
  const childExited = child.exitCode !== null || child.signalCode !== null;
  if (childExited && isProcessAlive(pgid)) {
    return "reassigned";
  }
  return isProcessGroupAlive(pgid) ? "alive" : "empty";
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

/**
 * Kills whatever is left of a group that no longer has a member that has not exited. A member
 * forked after the `/proc` listing is missing from it, but a group signal reaches every member,
 * including one being forked, and an exited member ignores it.
 */
const sweepEmptyGroup = (pgid: number): void => {
  signalProcessGroup(pgid, "SIGKILL");
};

/** Polls until the group is no longer alive, or the deadline passes. */
const waitForChildGroupExit = async (
  child: StoppableChild,
  pgid: number,
  timeoutMs: number,
): Promise<ChildGroupState> => {
  const deadline = Date.now() + timeoutMs;
  let state = readChildGroupState(child, pgid);
  while (state === "alive" && Date.now() < deadline) {
    await delay(PROCESS_GROUP_POLL_INTERVAL_MS);
    state = readChildGroupState(child, pgid);
  }
  return state;
};

/**
 * Children whose group was already empty when they exited. A later stop never signals their
 * former pgid, so a pid reassigned between that exit and the stop cannot be mistaken for theirs.
 */
const groupsEmptiedAtLeaderExit = new WeakSet<StoppableChild>();

const recordGroupEmptiedAtLeaderExit = (child: ChildProcess) => {
  child.once("exit", () => {
    const pgid = child.pid;
    if (pgid === undefined || readChildGroupState(child, pgid) !== "empty") {
      return;
    }
    try {
      sweepEmptyGroup(pgid);
      groupsEmptiedAtLeaderExit.add(child);
    } catch {
      // The group could not be swept, so the stop signals it and reports why.
    }
  });
};

export type StopProcessGroupOptions = {
  /** How long the group gets to exit after SIGTERM before SIGKILL. */
  graceMs?: number;
  /** How long the group gets to exit after SIGKILL before the stop rejects. */
  killWaitMs?: number;
};

/**
 * Stops the process group a detached child leads: SIGTERM, then SIGKILL after a grace period.
 * The child's own exit proves nothing about the group, because a descendant can outlive it and
 * keep servers and inherited pipes open, so this resolves only once the group has no member
 * left and rejects if one survives SIGKILL.
 */
export const stopProcessGroup = async (
  child: StoppableChild,
  {
    graceMs = PROCESS_EXIT_GRACE_MS,
    killWaitMs = PROCESS_KILL_WAIT_MS,
  }: StopProcessGroupOptions = {},
): Promise<void> => {
  const pgid = child.pid;
  if (pgid === undefined || groupsEmptiedAtLeaderExit.has(child)) {
    // The spawn failed, or the group emptied with its leader.
    return;
  }
  const stages: ReadonlyArray<[NodeJS.Signals, number]> = [
    ["SIGTERM", graceMs],
    ["SIGKILL", killWaitMs],
  ];
  for (const [signal, waitMs] of stages) {
    let state = readChildGroupState(child, pgid);
    if (state === "alive") {
      if (!signalProcessGroup(pgid, signal)) {
        return;
      }
      state = await waitForChildGroupExit(child, pgid, waitMs);
    }
    if (state === "empty") {
      sweepEmptyGroup(pgid);
    }
    if (state !== "alive") {
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
  } catch (error) {
    // The command's own failure is the one to report here; `stop` is the registered cleanup,
    // so the cleanup stack logs its failure when it drains.
    await stop().catch(() => undefined);
    throw error;
  }
  // The command's exit leaves its descendants running, so its group is stopped even after it
  // succeeded, and a group that cannot be stopped fails the command.
  await stop();
};
