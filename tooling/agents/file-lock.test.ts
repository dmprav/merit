import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  acquireFileLock,
  combineProcessIdentity,
  FileLockBusyError,
  type FileLockOptions,
  withFileLock,
} from "./file-lock.ts";

const tempDirs: string[] = [];

const makeLockPath = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "merit-file-lock-test-")));
  tempDirs.push(dir);
  return { dir, lockPath: join(dir, "resource.lock") };
};

const lockPayload = (pid: number, token: string, extra: Record<string, unknown> = {}) =>
  `${JSON.stringify({ pid, token, createdAt: Date.now(), ...extra })}\n`;

const exitedPid = (): number => {
  const exited = spawnSync(process.execPath, ["-e", ""]);
  expect(exited.pid).toBeGreaterThan(0);
  return exited.pid;
};

const expired = () => new Date(Date.now() - 60_000);

const quickTimeout: FileLockOptions = { timeoutMs: 60, initialDelayMs: 10, maxDelayMs: 20 };

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("withFileLock stale-lock policy", () => {
  test("preserves a live-PID lock regardless of age", async () => {
    const { lockPath } = makeLockPath();
    const livePayload = lockPayload(process.pid, "live", { createdAt: 0 });
    writeFileSync(lockPath, livePayload, "utf8");
    utimesSync(lockPath, expired(), expired());
    await expect(
      withFileLock(lockPath, () => "nope", { ...quickTimeout, label: "test", staleMs: 5_000 }),
    ).rejects.toThrow(`Timed out waiting for test lock at "${lockPath}"`);
    expect(readFileSync(lockPath, "utf8")).toBe(livePayload);
  });

  test("recovers a dead-PID lock immediately even with a fresh mtime", async () => {
    const { lockPath } = makeLockPath();
    writeFileSync(lockPath, lockPayload(exitedPid(), "dead"), "utf8");
    expect(await withFileLock(lockPath, () => "recovered-dead", { timeoutMs: 2_000 })).toBe(
      "recovered-dead",
    );
    expect(existsSync(lockPath)).toBe(false);
  });

  test("recovers a corrupt lock only after the grace window", async () => {
    const { dir, lockPath } = makeLockPath();
    writeFileSync(lockPath, "{corrupt", "utf8");
    await expect(withFileLock(lockPath, () => "too-soon", quickTimeout)).rejects.toThrow(
      /Timed out/,
    );
    utimesSync(lockPath, expired(), expired());
    expect(
      await withFileLock(lockPath, () => "recovered-corrupt", { staleMs: 5_000, timeoutMs: 2_000 }),
    ).toBe("recovered-corrupt");
    expect(readdirSync(dir)).toEqual([]);
  });

  test("never builds a partial process identity when the boot ID or start time is unreadable", () => {
    expect(combineProcessIdentity("boot-a", "200")).toBe("boot-a:200");
    expect(combineProcessIdentity(undefined, "200")).toBeUndefined();
    expect(combineProcessIdentity("", "200")).toBeUndefined();
    expect(combineProcessIdentity("boot-a", undefined)).toBeUndefined();
  });

  test("treats a live PID with a different process start time as a reused PID", async () => {
    const { lockPath } = makeLockPath();

    const readProcessStartTime = (pid: number) => (pid === process.pid ? "boot-a:200" : undefined);

    const sameInstance = lockPayload(process.pid, "same", { startTime: "boot-a:200" });
    writeFileSync(lockPath, sameInstance, "utf8");
    await expect(
      withFileLock(lockPath, () => "nope", { ...quickTimeout, readProcessStartTime }),
    ).rejects.toThrow(/Timed out/);
    expect(readFileSync(lockPath, "utf8")).toBe(sameInstance);

    writeFileSync(
      lockPath,
      lockPayload(process.pid, "reused", { startTime: "boot-a:100" }),
      "utf8",
    );
    expect(
      await withFileLock(lockPath, () => readFileSync(lockPath, "utf8"), {
        timeoutMs: 2_000,
        readProcessStartTime,
      }),
    ).toContain('"startTime":"boot-a:200"');
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe("withFileLock races", () => {
  test("never publishes a lock before its metadata is complete", async () => {
    const { dir, lockPath } = makeLockPath();
    const competitor = lockPayload(process.pid, "competitor");
    let ranOperation = false;

    await expect(
      withFileLock(
        lockPath,
        () => {
          ranOperation = true;
        },
        {
          ...quickTimeout,
          writeMetadata: (fd, payload) => {
            // While this owner is paused mid-write, contenders see no lock at all...
            expect(existsSync(lockPath)).toBe(false);
            // ...so another owner can acquire it, and this owner must then wait instead of entering.
            writeFileSync(lockPath, competitor, "utf8");
            writeFileSync(fd, payload, "utf8");
          },
        },
      ),
    ).rejects.toThrow(/Timed out/);
    expect(ranOperation).toBe(false);
    expect(readFileSync(lockPath, "utf8")).toBe(competitor);
    expect(readdirSync(dir)).toEqual(["resource.lock"]);
  });

  test("does not remove a replacement lock acquired after the stale lock was inspected", async () => {
    const { dir, lockPath } = makeLockPath();
    writeFileSync(lockPath, lockPayload(exitedPid(), "dead"), "utf8");
    const replacement = lockPayload(process.pid, "replacement");
    let ranOperation = false;

    await expect(
      withFileLock(
        lockPath,
        () => {
          ranOperation = true;
        },
        {
          ...quickTimeout,
          onStaleLock: () => {
            // Another contender reclaims the same dead lock and acquires first.
            if (!readFileSync(lockPath, "utf8").includes('"replacement"')) {
              unlinkSync(lockPath);
              writeFileSync(lockPath, replacement, "utf8");
            }
          },
        },
      ),
    ).rejects.toThrow(/Timed out/);
    expect(ranOperation).toBe(false);
    expect(readFileSync(lockPath, "utf8")).toBe(replacement);
    expect(readdirSync(dir)).toEqual(["resource.lock"]);
  });

  test("lets only the reclaim-marker holder remove a stale lock and recovers a dead marker", async () => {
    const { dir, lockPath } = makeLockPath();
    const deadPid = exitedPid();
    const deadLock = lockPayload(deadPid, "dead");
    writeFileSync(lockPath, deadLock, "utf8");

    // A live contender holding the marker for this stale lock blocks other reclaimers.
    await expect(
      withFileLock(lockPath, () => "nope", {
        ...quickTimeout,
        onStaleLock: ({ markerPath }) => {
          if (!existsSync(markerPath)) {
            writeFileSync(markerPath, lockPayload(process.pid, "live-reclaimer"), "utf8");
          }
        },
      }),
    ).rejects.toThrow(/Timed out/);
    expect(readFileSync(lockPath, "utf8")).toBe(deadLock);
    for (const entry of readdirSync(dir).filter((name) => name.includes(".reclaim-"))) {
      unlinkSync(join(dir, entry));
    }

    // A marker left by a reclaimer that exited mid-reclaim is itself reclaimed.
    let plantedMarker = false;
    expect(
      await withFileLock(lockPath, () => "recovered", {
        timeoutMs: 2_000,
        onStaleLock: ({ lockPath: stalePath, markerPath }) => {
          if (stalePath === lockPath && !plantedMarker) {
            plantedMarker = true;
            writeFileSync(markerPath, lockPayload(deadPid, "dead-reclaimer"), "utf8");
          }
        },
      }),
    ).toBe("recovered");
    expect(plantedMarker).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("acquireFileLock without waiting", () => {
  test("fails at once with the holder's pid while a live process holds the lock", async () => {
    const { lockPath } = makeLockPath();
    const release = await acquireFileLock(lockPath, { timeoutMs: 0 });

    // Nothing in this attempt sleeps, so the rejection settles before any timer fires.
    let timerFired = false;
    const timer = setTimeout(() => {
      timerFired = true;
    }, 0);
    const failure = await acquireFileLock(lockPath, { label: "test", timeoutMs: 0 }).catch(
      (error: unknown) => error,
    );
    clearTimeout(timer);

    expect(timerFired).toBe(false);
    expect(failure).toBeInstanceOf(FileLockBusyError);
    expect(failure).toMatchObject({ lockPath, holderPid: process.pid });
    expect(String(failure)).toContain(`test lock at "${lockPath}" is held by pid ${process.pid}`);

    release();
    expect(existsSync(lockPath)).toBe(false);
  });

  test("reclaims a stale lock in its single attempt and releases only its own lock", async () => {
    const { dir, lockPath } = makeLockPath();
    writeFileSync(lockPath, lockPayload(exitedPid(), "dead"), "utf8");

    const release = await acquireFileLock(lockPath, { timeoutMs: 0 });
    expect(readFileSync(lockPath, "utf8")).toContain(`"pid":${process.pid}`);

    // A replacement written after this holder lost the lock stays when it releases.
    const replacement = lockPayload(process.pid, "replacement");
    writeFileSync(lockPath, replacement, "utf8");
    release();
    expect(readFileSync(lockPath, "utf8")).toBe(replacement);
    expect(readdirSync(dir)).toEqual(["resource.lock"]);
  });
});

describe("withFileLock failed acquisition", () => {
  test("publishes no lock and leaves no files when writing or closing metadata fails", async () => {
    const { dir, lockPath } = makeLockPath();
    let ranOperation = false;

    const operation = () => {
      ranOperation = true;
      return "never";
    };

    await expect(
      withFileLock(lockPath, operation, {
        writeMetadata: () => {
          throw Object.assign(new Error("No space left on device"), { code: "ENOSPC" });
        },
      }),
    ).rejects.toThrow(/No space left on device/);
    expect(readdirSync(dir)).toEqual([]);

    // The close after a complete write fails; the descriptor must not be closed a second time.
    await expect(
      withFileLock(lockPath, operation, {
        writeMetadata: (fd, payload) => {
          writeFileSync(fd, payload, "utf8");
          closeSync(fd);
        },
      }),
    ).rejects.toThrow(/EBADF/);
    expect(ranOperation).toBe(false);
    expect(readdirSync(dir)).toEqual([]);

    expect(await withFileLock(lockPath, () => "acquired", { timeoutMs: 200 })).toBe("acquired");
    expect(readdirSync(dir)).toEqual([]);
  });
});
