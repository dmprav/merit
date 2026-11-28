import { readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vite-plus/test";

import { hasProcessExited, type ProcessStat, readProcessStat } from "../../agents/process-stat.ts";
import { createCleanupStack } from "./cleanup.ts";
import {
  allocateFreePort,
  runCommandAsync,
  spawnManagedProcess,
  stopProcessGroup,
  waitForHttpReady,
} from "./processes.ts";

const listen = async (port: number): Promise<Server> => {
  const server = createServer((_request, response) => response.end("foreign"));
  await new Promise<void>((resolveListen) => server.listen(port, "127.0.0.1", resolveListen));
  return server;
};

/** Whether `pid` is running; on Linux, an unreaped zombie has exited and does not count. */
const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (process.platform !== "linux") {
    return true;
  }
  const reading = readProcessStat(pid);
  return (
    reading.kind === "unreadable" || (reading.kind === "read" && !hasProcessExited(reading.stat))
  );
};

/** The processes in group `pgid`, read from `/proc`. */
const readGroupMembers = (pgid: number): Array<{ pid: number; stat: ProcessStat }> =>
  readdirSync("/proc").flatMap((entry) => {
    const reading = /^\d+$/.test(entry) ? readProcessStat(entry) : undefined;
    return reading?.kind === "read" && reading.stat.processGroup === pgid
      ? [{ pid: Number(entry), stat: reading.stat }]
      : [];
  });

const waitForValue = async <T>(read: () => T | undefined, description: string): Promise<T> => {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${description}.`);
};

const killIfRunning = (pid: number | undefined) => {
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // It already exited.
  }
};

// The descendant takes the pid file and whether to ignore SIGTERM as arguments. It writes its
// pid once its signal handling is in place, renaming the file so a reader never sees it empty.
const DESCENDANT_SCRIPT = `
const [pidFile, sigterm] = process.argv.slice(1);
if (sigterm === "ignore-sigterm") process.on("SIGTERM", () => {});
const fs = require("node:fs");
fs.writeFileSync(pidFile + ".tmp", String(process.pid));
fs.renameSync(pidFile + ".tmp", pidFile);
setInterval(() => {}, 1_000);
`;

// The wrapper starts the descendant in its own process group, sharing its output pipes as a
// server started by \`vp\` does. It then exits with code 1 or 0 once the descendant's pid file
// exists or, like a wrapper that forwards signals, exits with code 0 on SIGTERM.
const WRAPPER_SCRIPT = `
const [descendantScript, pidFile, exit, sigterm] = process.argv.slice(1);
require("node:child_process").spawn(process.execPath, ["-e", descendantScript, pidFile, sigterm], {
  stdio: "inherit",
});
if (exit === "exits-on-sigterm") {
  process.on("SIGTERM", () => process.exit(0));
  setInterval(() => {}, 1_000);
} else {
  const code = exit === "succeeds-after-start" ? 0 : 1;
  setInterval(() => require("node:fs").existsSync(pidFile) && process.exit(code), 20);
}
`;

/** Arguments for `node` that run the wrapper with a long-running descendant. */
const wrapperWithDescendant = (
  pidFile: string,
  {
    wrapper,
    descendantIgnoresSigterm = false,
  }: {
    wrapper: "fails-after-start" | "succeeds-after-start" | "exits-on-sigterm";
    descendantIgnoresSigterm?: boolean;
  },
): string[] => [
  "-e",
  WRAPPER_SCRIPT,
  DESCENDANT_SCRIPT,
  pidFile,
  wrapper,
  descendantIgnoresSigterm ? "ignore-sigterm" : "default-sigterm",
];

const readDescendantPid = async (pidFile: string): Promise<number> => {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const text = await readFile(pidFile, "utf8").catch(() => "");
    if (text) {
      return Number(text);
    }
    await delay(20);
  }
  throw new Error(`The descendant never wrote ${pidFile}.`);
};

const withPidFile = async (run: (pidFile: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "merit-ui-verify-processes-"));
  try {
    await run(join(directory, "descendant.pid"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

describe("allocateFreePort", () => {
  it("allocates a free ephemeral port", async () => {
    const port = await allocateFreePort();
    expect(port).toBeGreaterThan(1024);
    expect(port).toBeLessThanOrEqual(65535);
  });
});

describe("waitForHttpReady", () => {
  it("does not accept a foreign listener on the allocated port as the started server", async () => {
    const port = await allocateFreePort();
    const foreign = await listen(port);
    const url = `http://127.0.0.1:${port}`;
    // Simulates `--strictPort` failing because the port was taken after allocation.
    const managed = spawnManagedProcess(
      process.execPath,
      ["-e", "setTimeout(() => process.exit(1), 300)"],
      { cwd: process.cwd(), announcedUrl: `${url}/` },
    );
    try {
      await expect(waitForHttpReady(url, 5_000, managed)).rejects.toThrow(/exited early/);
    } finally {
      managed.child.kill();
      await new Promise((resolveClose) => foreign.close(resolveClose));
    }
  });

  it("accepts the started server once it announces its URL and responds", async () => {
    const port = await allocateFreePort();
    const url = `http://127.0.0.1:${port}`;
    const script = `require("node:http").createServer((q, r) => r.end("ok")).listen(${port}, "127.0.0.1", () => console.log("  Local:   ${url}/"));`;
    const managed = spawnManagedProcess(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      announcedUrl: `${url}/`,
    });
    try {
      await waitForHttpReady(url, 10_000, managed);
      expect(managed.hasAnnouncedUrl()).toBe(true);
    } finally {
      managed.child.kill();
    }
  });

  it("reports a server that cannot be spawned instead of crashing", async () => {
    const managed = spawnManagedProcess("merit-ui-verify-missing-command", [], {
      cwd: process.cwd(),
      announcedUrl: "http://127.0.0.1:1/",
    });
    await expect(waitForHttpReady("http://127.0.0.1:1", 5_000, managed)).rejects.toThrow(
      /failed to start/,
    );
  });
});

describe("runCommandAsync", () => {
  it("stops a descendant that outlives its wrapper's failed exit", () =>
    withPidFile(async (pidFile) => {
      const { registerCleanup, runCleanups } = createCleanupStack(() => undefined);
      let descendantPid: number | undefined;
      try {
        await expect(
          runCommandAsync(
            process.execPath,
            wrapperWithDescendant(pidFile, { wrapper: "fails-after-start" }),
            { cwd: process.cwd(), label: "Wrapper", registerCleanup },
          ),
        ).rejects.toThrow(/exited with code 1/);
        descendantPid = await readDescendantPid(pidFile);
        expect(isRunning(descendantPid)).toBe(false);
      } finally {
        await runCleanups();
        killIfRunning(descendantPid);
      }
    }));

  it("stops a descendant that outlives its wrapper's successful exit", () =>
    withPidFile(async (pidFile) => {
      const { registerCleanup, runCleanups } = createCleanupStack(() => undefined);
      let descendantPid: number | undefined;
      try {
        await runCommandAsync(
          process.execPath,
          wrapperWithDescendant(pidFile, { wrapper: "succeeds-after-start" }),
          { cwd: process.cwd(), label: "Wrapper", registerCleanup },
        );
        descendantPid = await readDescendantPid(pidFile);
        expect(isRunning(descendantPid)).toBe(false);
      } finally {
        await runCleanups();
        killIfRunning(descendantPid);
      }
    }));
});

describe("stopProcessGroup", () => {
  const unannounced = { cwd: process.cwd(), announcedUrl: "http://127.0.0.1:1/" };

  it("stops a server's descendants after the server exited early", () =>
    withPidFile(async (pidFile) => {
      const managed = spawnManagedProcess(
        process.execPath,
        wrapperWithDescendant(pidFile, { wrapper: "fails-after-start" }),
        unannounced,
      );
      let descendantPid: number | undefined;
      try {
        await expect(waitForHttpReady("http://127.0.0.1:1", 10_000, managed)).rejects.toThrow(
          /exited early/,
        );
        descendantPid = await readDescendantPid(pidFile);
        await stopProcessGroup(managed.child);
        expect(isRunning(descendantPid)).toBe(false);
      } finally {
        await stopProcessGroup(managed.child, { graceMs: 100 });
        killIfRunning(descendantPid);
      }
    }));

  it("kills a descendant that ignores SIGTERM after its wrapper exits on SIGTERM", () =>
    withPidFile(async (pidFile) => {
      const managed = spawnManagedProcess(
        process.execPath,
        wrapperWithDescendant(pidFile, {
          wrapper: "exits-on-sigterm",
          descendantIgnoresSigterm: true,
        }),
        unannounced,
      );
      let descendantPid: number | undefined;
      try {
        descendantPid = await readDescendantPid(pidFile);
        await stopProcessGroup(managed.child, { graceMs: 200 });
        expect(managed.child.exitCode).toBe(0);
        expect(isRunning(descendantPid)).toBe(false);
      } finally {
        await stopProcessGroup(managed.child, { graceMs: 100 });
        killIfRunning(descendantPid);
      }
    }));

  it.skipIf(process.platform !== "linux")(
    "treats a group whose only member is an unreaped zombie as stopped",
    async () => {
      // The inner shell starts a member that exits at once, then becomes a session leader
      // outside the group that never reaps it, so the member stays in the group as a zombie.
      const managed = spawnManagedProcess(
        "sh",
        ["-c", 'sh -c "sleep 0 & exec setsid sleep 30" & wait'],
        unannounced,
      );
      const pgid = managed.child.pid!;
      let holderPid: number | undefined;
      try {
        const zombie = await waitForValue(
          () => readGroupMembers(pgid).find(({ stat }) => hasProcessExited(stat)),
          "a zombie member",
        );
        holderPid = zombie.stat.parentPid;
        const leaderExit = new Promise((resolveExit) => managed.child.once("exit", resolveExit));
        process.kill(pgid, "SIGKILL");
        await leaderExit;

        await stopProcessGroup(managed.child, { graceMs: 100, killWaitMs: 100 });
        expect(readGroupMembers(pgid).map(({ stat }) => stat.state)).toEqual(["Z"]);
      } finally {
        killIfRunning(holderPid);
        await stopProcessGroup(managed.child, { graceMs: 100, killWaitMs: 100 }).catch(
          () => undefined,
        );
      }
    },
  );

  it("does not signal a group that took the pid of an exited leader whose group emptied", async () => {
    // A process holding the pid stands in for a reused one: the recorded leader has exited, so
    // its group must have emptied before the pid was assigned again.
    const holder = spawnManagedProcess(
      process.execPath,
      ["-e", "setInterval(() => {}, 1_000)"],
      unannounced,
    );
    const holderPid = holder.child.pid!;
    try {
      await stopProcessGroup({ pid: holderPid, exitCode: 1, signalCode: null });
      expect(isRunning(holderPid)).toBe(true);
    } finally {
      await stopProcessGroup(holder.child, { graceMs: 100 });
    }
  });
});
