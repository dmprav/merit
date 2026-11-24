import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
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

const lockMetadataSchema = z.object({
  pid: z.number().int().positive(),
  token: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});

export type FileLockOptions = {
  label?: string;
  timeoutMs?: number;
  staleMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  isProcessAlive?: (pid: number) => boolean;
  nowMs?: () => number;
};

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

const tryClearStaleLock = (
  lockPath: string,
  staleMs: number,
  checkProcessAlive: (pid: number) => boolean,
  nowMs: () => number,
): boolean => {
  let raw: string;
  let mtimeMs: number;
  try {
    const stat = statSync(lockPath);
    mtimeMs = stat.mtimeMs;
    raw = readFileSync(lockPath, "utf8");
  } catch {
    return false;
  }

  const ageMs = nowMs() - mtimeMs;
  const corruptGraceMs = Math.min(staleMs, LOCK_WRITE_GRACE_MS);
  let stale = false;
  if (raw.trim().length > 0) {
    try {
      const parsed = lockMetadataSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        // Never expire valid lock metadata solely by age while its owner process is still alive.
        stale = !checkProcessAlive(parsed.data.pid);
      } else {
        stale = ageMs >= corruptGraceMs;
      }
    } catch {
      stale = ageMs >= corruptGraceMs;
    }
  } else {
    stale = ageMs >= corruptGraceMs;
  }

  if (!stale) {
    return false;
  }

  try {
    if (readFileSync(lockPath, "utf8") === raw) {
      unlinkSync(lockPath);
      return true;
    }
  } catch {
    // Another process already removed or replaced it.
  }
  return false;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const withFileLock = async <T>(
  lockPath: string,
  operation: () => Promise<T> | T,
  options: FileLockOptions = {},
): Promise<T> => {
  const label = options.label ?? "file";
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_LOCK_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_LOCK_MAX_DELAY_MS;
  const checkProcessAlive = options.isProcessAlive ?? isProcessAlive;
  const nowMs = options.nowMs ?? Date.now;

  mkdirSync(dirname(lockPath), { recursive: true });

  const token = randomUUID();
  const payload = `${JSON.stringify({ pid: process.pid, token, createdAt: nowMs() })}\n`;
  const deadline = nowMs() + timeoutMs;
  let delayMs = initialDelayMs;
  let acquired = false;

  while (!acquired) {
    try {
      const fd = openSync(
        lockPath,
        fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        0o600,
      );
      try {
        writeFileSync(fd, payload, "utf8");
      } finally {
        closeSync(fd);
      }
      acquired = true;
    } catch (error) {
      if (getErrnoCode(error) !== "EEXIST") {
        throw error;
      }
      if (tryClearStaleLock(lockPath, staleMs, checkProcessAlive, nowMs)) {
        continue;
      }
      const remainingMs = deadline - nowMs();
      if (remainingMs <= 0) {
        throw new Error(
          `Timed out waiting for ${label} lock at "${lockPath}" after ${timeoutMs}ms.`,
        );
      }
      await sleep(Math.min(delayMs, remainingMs));
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }

  try {
    return await operation();
  } finally {
    try {
      if (readFileSync(lockPath, "utf8") === payload) {
        unlinkSync(lockPath);
      }
    } catch {
      // Lock file already removed.
    }
  }
};
