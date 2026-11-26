import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { z } from "zod";

const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_INITIAL_DELAY_MS = 25;
const DEFAULT_LOCK_MAX_DELAY_MS = 250;
const LOCK_WRITE_GRACE_MS = 1_000;
// A reclaim marker is itself a lock, so a dead reclaimer's marker is reclaimed one level deeper.
const MAX_RECLAIM_DEPTH = 3;
// A lock released between a failed publish and its inspection is retried at once, even past the
// deadline, so a single attempt does not report a holder that has already gone.
const MAX_VANISHED_LOCK_RETRIES = 3;

const lockMetadataSchema = z.object({
  pid: z.number().int().positive(),
  token: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  startTime: z.string().min(1).optional(),
});

type LockMetadata = z.infer<typeof lockMetadataSchema>;

type LockOwner = Pick<LockMetadata, "pid" | "startTime">;

export type FileLockOptions = {
  label?: string;
  /** How long to wait for a held lock; 0 makes one attempt, including stale-lock reclaim. */
  timeoutMs?: number;
  staleMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  isProcessAlive?: (pid: number) => boolean;
  readProcessStartTime?: (pid: number) => string | undefined;
  nowMs?: () => number;
  writeMetadata?: (fd: number, payload: string) => void;
  /** Test seam: runs after a lock is judged stale and before its reclaim marker is taken. */
  onStaleLock?: (details: { lockPath: string; markerPath: string }) => void;
  /** Test seam: runs after publishing finds the lock taken and before that lock is inspected. */
  onLockHeld?: (lockPath: string) => void;
};

type ReclaimContext = {
  staleMs: number;
  publishedPath: string;
  payload: string;
  isOwnerAlive: (owner: LockOwner) => boolean;
  nowMs: () => number;
  onStaleLock?: FileLockOptions["onStaleLock"];
};

/**
 * What inspecting a taken lock found: it was removed as stale, it vanished first, or it is held,
 * by the live process whose PID the inspection read when it could.
 */
type ReclaimOutcome =
  | { kind: "reclaimed" }
  | { kind: "gone" }
  | { kind: "held"; holderPid?: number };

const HELD: ReclaimOutcome = { kind: "held" };

const outcomeOfFailedInspection = (error: unknown): ReclaimOutcome =>
  getErrnoCode(error) === "ENOENT" ? { kind: "gone" } : HELD;

/** Thrown when another live process still holds the lock once the timeout has elapsed. */
export class FileLockBusyError extends Error {
  readonly lockPath: string;
  /** The holder's PID, when its lock metadata is readable. */
  readonly holderPid: number | undefined;

  constructor(message: string, lockPath: string, holderPid: number | undefined) {
    super(message);
    this.name = "FileLockBusyError";
    this.lockPath = lockPath;
    this.holderPid = holderPid;
  }
}

export const getErrnoCode = (error: unknown): string | undefined => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
};

export const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return getErrnoCode(error) === "EPERM";
  }
};

const readOptionalFile = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

/**
 * Combines boot ID and start ticks into one identity. A partial identity is never returned:
 * comparing `boot:ticks` against bare `ticks` would misclassify a live owner as a reused PID.
 */
export const combineProcessIdentity = (
  bootId: string | undefined,
  startTicks: string | undefined,
): string | undefined => (bootId && startTicks ? `${bootId}:${startTicks}` : undefined);

/**
 * Identifies a process instance by boot ID and kernel start time so a reused PID is not mistaken
 * for the lock owner. Returns undefined where `/proc` is unavailable, falling back to PID liveness.
 */
const readProcessStartTime = (pid: number): string | undefined => {
  const stat = readOptionalFile(`/proc/${pid}/stat`);
  if (stat === undefined) {
    return undefined;
  }
  // Field 22 (starttime); fields after the parenthesized command name start at field 3.
  const startTicks = stat
    .slice(stat.lastIndexOf(")") + 2)
    .split(" ")
    .at(19);
  if (!startTicks) {
    return undefined;
  }
  return combineProcessIdentity(
    readOptionalFile("/proc/sys/kernel/random/boot_id")?.trim(),
    startTicks,
  );
};

const sameFile = (
  left: { dev: number; ino: number },
  right: { dev: number; ino: number },
): boolean => left.dev === right.dev && left.ino === right.ino;

const parseLockMetadata = (raw: string): LockMetadata | undefined => {
  try {
    const parsed = lockMetadataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

// ui:verify's output lock wrote only its PID before it moved onto this lock, and a checkout that
// still runs that version can hold the same directory.
const LEGACY_PID_LOCK_PATTERN = /^[1-9]\d*\n?$/;

/** Reads who holds a lock: its metadata, or the PID alone from an earlier ui:verify lock. */
const parseLockOwner = (raw: string): LockOwner | undefined =>
  parseLockMetadata(raw) ??
  (LEGACY_PID_LOCK_PATTERN.test(raw) ? { pid: Number.parseInt(raw, 10) } : undefined);

const isStaleLockContent = (
  raw: string,
  ageMs: number,
  context: Pick<ReclaimContext, "staleMs" | "isOwnerAlive">,
): boolean => {
  const owner = parseLockOwner(raw);
  if (owner) {
    // Never expire a lock solely by age while its owner process is still alive.
    return !context.isOwnerAlive(owner);
  }
  // Locks are published complete, so unreadable content is foreign or damaged; allow a short grace.
  return ageMs >= Math.min(context.staleMs, LOCK_WRITE_GRACE_MS);
};

const tryPublish = (sourcePath: string, targetPath: string): boolean => {
  try {
    linkSync(sourcePath, targetPath);
    return true;
  } catch (error) {
    if (getErrnoCode(error) === "EEXIST") {
      return false;
    }
    throw error;
  }
};

const releaseIfOwned = (path: string, payload: string): void => {
  if (readOptionalFile(path) === payload) {
    try {
      unlinkSync(path);
    } catch {
      // Already removed.
    }
  }
};

/**
 * Removes a stale lock without ever removing a replacement. Reclaimers of one stale file first
 * publish an exclusive marker keyed by that file's identity; while the stale file occupies the
 * path no one can create a new lock, so the marker holder's re-check and unlink are race-free.
 */
const tryReclaimStaleLock = (
  lockPath: string,
  context: ReclaimContext,
  depth = 0,
): ReclaimOutcome => {
  let inspected: { dev: number; ino: number; mtimeMs: number };
  let raw: string;
  try {
    inspected = lstatSync(lockPath);
    raw = readFileSync(lockPath, "utf8");
  } catch (error) {
    return outcomeOfFailedInspection(error);
  }
  if (!isStaleLockContent(raw, context.nowMs() - inspected.mtimeMs, context)) {
    const holderPid = parseLockOwner(raw)?.pid;
    return holderPid === undefined ? HELD : { kind: "held", holderPid };
  }

  const identity = createHash("sha256")
    .update(`${inspected.dev}:${inspected.ino}:${raw}`)
    .digest("hex")
    .slice(0, 32);
  const markerPath = `${lockPath}.reclaim-${identity}`;
  context.onStaleLock?.({ lockPath, markerPath });

  if (!tryPublish(context.publishedPath, markerPath)) {
    if (depth < MAX_RECLAIM_DEPTH) {
      tryReclaimStaleLock(markerPath, context, depth + 1);
    }
    return HELD;
  }
  try {
    const current = lstatSync(lockPath);
    if (!sameFile(current, inspected) || readFileSync(lockPath, "utf8") !== raw) {
      return HELD;
    }
    unlinkSync(lockPath);
    return { kind: "reclaimed" };
  } catch (error) {
    // An already removed stale lock leaves the path free to publish.
    return outcomeOfFailedInspection(error);
  } finally {
    releaseIfOwned(markerPath, context.payload);
  }
};

const writePrivateFile = (
  path: string,
  payload: string,
  writeMetadata: (fd: number, payload: string) => void,
): void => {
  const fd = openSync(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
  let closeAttempted = false;
  try {
    writeMetadata(fd, payload);
    // A failed close still releases the descriptor, so never retry it.
    closeAttempted = true;
    closeSync(fd);
  } catch (error) {
    if (!closeAttempted) {
      try {
        closeSync(fd);
      } catch {
        // Best-effort close on failed acquisition.
      }
    }
    throw error;
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

/** Reports the holder the last inspection saw, or else whoever holds the lock now. */
const busyError = (
  lockPath: string,
  label: string,
  timeoutMs: number,
  observedHolderPid: number | undefined,
): FileLockBusyError => {
  const readHolderPid = () => {
    const raw = readOptionalFile(lockPath);
    return raw === undefined ? undefined : parseLockOwner(raw)?.pid;
  };

  const holderPid = observedHolderPid ?? readHolderPid();
  const message =
    timeoutMs > 0
      ? `Timed out waiting for ${label} lock at "${lockPath}" after ${timeoutMs}ms.`
      : `The ${label} lock at "${lockPath}" is held${holderPid ? ` by pid ${holderPid}` : ""}.`;
  return new FileLockBusyError(message, lockPath, holderPid);
};

type WaitPolicy = {
  label: string;
  timeoutMs: number;
  deadline: number;
  initialDelayMs: number;
  maxDelayMs: number;
  onLockHeld: FileLockOptions["onLockHeld"];
};

/** Publishes the lock, reclaiming a stale holder and waiting for a live one until the deadline. */
const publishLock = async (
  lockPath: string,
  context: ReclaimContext,
  wait: WaitPolicy,
): Promise<void> => {
  let delayMs = wait.initialDelayMs;
  let vanishedRetries = 0;
  while (!tryPublish(context.publishedPath, lockPath)) {
    wait.onLockHeld?.(lockPath);
    const outcome = tryReclaimStaleLock(lockPath, context);
    if (outcome.kind === "reclaimed") {
      continue;
    }
    if (outcome.kind === "gone" && vanishedRetries < MAX_VANISHED_LOCK_RETRIES) {
      vanishedRetries += 1;
      continue;
    }
    const remainingMs = wait.deadline - context.nowMs();
    if (remainingMs <= 0) {
      throw busyError(
        lockPath,
        wait.label,
        wait.timeoutMs,
        outcome.kind === "held" ? outcome.holderPid : undefined,
      );
    }
    await sleep(Math.min(delayMs, remainingMs));
    delayMs = Math.min(delayMs * 2, wait.maxDelayMs);
  }
};

/**
 * Takes an exclusive lockfile and returns its release, which removes the lock only while this
 * holder still owns it. The lock is written to a private temporary file and published with an
 * atomic hard link, so contenders never observe partial metadata. A lock whose owner process has
 * exited is reclaimed; a live holder is waited for until `timeoutMs`, then reported with
 * `FileLockBusyError`.
 */
export const acquireFileLock = async (
  lockPath: string,
  options: FileLockOptions = {},
): Promise<() => void> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const checkProcessAlive = options.isProcessAlive ?? isProcessAlive;
  const readStartTime = options.readProcessStartTime ?? readProcessStartTime;
  const nowMs = options.nowMs ?? Date.now;
  const writeMetadata =
    options.writeMetadata ??
    ((fd: number, metadata: string) => {
      writeFileSync(fd, metadata, "utf8");
    });

  mkdirSync(dirname(lockPath), { recursive: true });

  const token = randomUUID();
  const metadata = lockMetadataSchema.parse({
    pid: process.pid,
    token,
    createdAt: nowMs(),
    startTime: readStartTime(process.pid),
  });
  const payload = `${JSON.stringify(metadata)}\n`;
  const publishedPath = `${lockPath}.${token}.tmp`;
  const context: ReclaimContext = {
    staleMs: options.staleMs ?? DEFAULT_LOCK_STALE_MS,
    publishedPath,
    payload,
    isOwnerAlive: (owner) => {
      if (!checkProcessAlive(owner.pid)) {
        return false;
      }
      const currentStartTime = owner.startTime ? readStartTime(owner.pid) : undefined;
      return currentStartTime === undefined || currentStartTime === owner.startTime;
    },
    nowMs,
    onStaleLock: options.onStaleLock,
  };

  const wait: WaitPolicy = {
    label: options.label ?? "file",
    timeoutMs,
    deadline: nowMs() + timeoutMs,
    initialDelayMs: options.initialDelayMs ?? DEFAULT_LOCK_INITIAL_DELAY_MS,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_LOCK_MAX_DELAY_MS,
    onLockHeld: options.onLockHeld,
  };
  try {
    writePrivateFile(publishedPath, payload, writeMetadata);
    await publishLock(lockPath, context, wait);
  } finally {
    try {
      unlinkSync(publishedPath);
    } catch {
      // Never created or already removed.
    }
  }

  return () => {
    releaseIfOwned(lockPath, payload);
  };
};

/** Runs `operation` while holding an exclusive lockfile, releasing it however `operation` ends. */
export const withFileLock = async <T>(
  lockPath: string,
  operation: () => Promise<T> | T,
  options: FileLockOptions = {},
): Promise<T> => {
  const release = await acquireFileLock(lockPath, options);
  try {
    return await operation();
  } finally {
    release();
  }
};
