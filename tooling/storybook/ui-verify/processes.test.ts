import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vite-plus/test";

import { hasProcessExited, parseProcessStat } from "../../agents/process-stat.ts";
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
  const stat = parseProcessStat(readFileSync(`/proc/${pid}/stat`, { encoding: "utf8", flag: "r" }));
  return stat !== undefined && !hasProcessExited(stat);
};

const killIfRunning = (pid: number | undefined) => {
  if (pid !== undefined && isRunning(pid)) {
    process.kill(pid, "SIGKILL");
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
// server started by \`vp\` does. It then exits with code 1 once the descendant's pid file exists
// or, like a wrapper that forwards signals, exits with code 0 on SIGTERM.
const WRAPPER_SCRIPT = `
const [descendantScript, pidFile, exit, sigterm] = process.argv.slice(1);
require("node:child_process").spawn(process.execPath, ["-e", descendantScript, pidFile, sigterm], {
  stdio: "inherit",
});
if (exit === "exits-on-sigterm") {
  process.on("SIGTERM", () => process.exit(0));
  setInterval(() => {}, 1_000);
} else {
  setInterval(() => require("node:fs").existsSync(pidFile) && process.exit(1), 20);
}
`;

/** Arguments for `node` that run the wrapper with a long-running descendant. */
const wrapperWithDescendant = (
  pidFile: string,
  {
    wrapper,
    descendantIgnoresSigterm = false,
  }: { wrapper: "fails-after-start" | "exits-on-sigterm"; descendantIgnoresSigterm?: boolean },
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
        killIfRunning(descendantPid);
        await runCleanups();
      }
    }));
});

describe("stopProcessGroup", () => {
  it("stops a server's descendants after the server exited early", () =>
    withPidFile(async (pidFile) => {
      const managed = spawnManagedProcess(
        process.execPath,
        wrapperWithDescendant(pidFile, { wrapper: "fails-after-start" }),
        { cwd: process.cwd(), announcedUrl: "http://127.0.0.1:1/" },
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
        { cwd: process.cwd(), announcedUrl: "http://127.0.0.1:1/" },
      );
      let descendantPid: number | undefined;
      try {
        descendantPid = await readDescendantPid(pidFile);
        await stopProcessGroup(managed.child, { graceMs: 200 });
        expect(managed.child.exitCode).toBe(0);
        expect(isRunning(descendantPid)).toBe(false);
      } finally {
        killIfRunning(descendantPid);
      }
    }));

  it("does not signal a group that took the pid of an exited leader whose group emptied", async () => {
    // A process holding the pid stands in for a reused one: the recorded leader has exited, so
    // its group must have emptied before the pid was assigned again.
    const holder = spawnManagedProcess(process.execPath, ["-e", "setInterval(() => {}, 1_000)"], {
      cwd: process.cwd(),
      announcedUrl: "http://127.0.0.1:1/",
    });
    const holderPid = holder.child.pid!;
    try {
      await stopProcessGroup({ pid: holderPid, exitCode: 1, signalCode: null });
      expect(isRunning(holderPid)).toBe(true);
    } finally {
      await stopProcessGroup(holder.child);
    }
  });
});
