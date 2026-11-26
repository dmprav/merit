import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { acquireFileLock } from "../../agents/file-lock.ts";
import { parseUiVerifyArgs } from "./cli.ts";
import { uiVerifyResultsSchema } from "./results.ts";
import { runUiVerify, type UiVerifyDependencies, type WatchInterrupts } from "./run.ts";

const LOCK_FILE = ".ui-verify.lock";

const withTempDir = async <T>(prefix: string, run: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** Runs with a prebuilt Storybook, so the run reads the temp repository's index without building. */
const withPrebuiltStorybook = async <T>(run: () => Promise<T>): Promise<T> => {
  const previous = process.env.MERIT_STORYBOOK_PREBUILT;
  process.env.MERIT_STORYBOOK_PREBUILT = "1";
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.MERIT_STORYBOOK_PREBUILT;
    } else {
      process.env.MERIT_STORYBOOK_PREBUILT = previous;
    }
  }
};

const quietDependencies = (
  repoRoot: string,
  overrides: Partial<UiVerifyDependencies> = {},
): UiVerifyDependencies => ({
  repoRoot,
  log: () => undefined,
  runContainer: () => {
    throw new Error("This run does not delegate to the container.");
  },
  ...overrides,
});

/** Runs ui:verify's quick container delegation against `outDir` with a succeeding container. */
const runContainerDelegation = (outDir: string) =>
  runUiVerify(
    parseUiVerifyArgs(["--container", "--out", outDir]),
    quietDependencies(outDir, { runContainer: () => 0 }),
  );

/** A host run that fails while planning, before it starts any server. */
const invalidRouteOptions = (outDir: string) => ({
  ...parseUiVerifyArgs(["--out", outDir, "--viewport", "desktop"]),
  routes: ["//evil.test/app"],
});

const writeStorybookIndex = (repoRoot: string) => {
  mkdirSync(join(repoRoot, "tooling/storybook/dist"), { recursive: true });
  writeFileSync(
    join(repoRoot, "tooling/storybook/dist/index.json"),
    JSON.stringify({
      entries: {
        "components-button--overview": {
          id: "components-button--overview",
          title: "Components/Button",
          name: "Overview",
          type: "story",
        },
      },
    }),
    "utf8",
  );
};

const seedStalePass = (outDir: string) => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ passed: true }), "utf8");
  writeFileSync(join(outDir, "report.md"), "# Stale PASS\n", "utf8");
};

const readSavedResults = (outDir: string) =>
  uiVerifyResultsSchema.parse(JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")));

describe("runUiVerify --update", () => {
  it("reports a failed screenshot cleanup instead of leaving a stale PASS", async () => {
    await withTempDir("merit-ui-verify-update-", async (tempDir) => {
      const outDir = join(tempDir, "out");
      const screenshotsDir = join(outDir, "screenshots");
      writeStorybookIndex(tempDir);
      seedStalePass(outDir);
      // A directory where the selected screenshot belongs makes the cleanup fail.
      mkdirSync(join(screenshotsDir, "components-button--overview-desktop.png"), {
        recursive: true,
      });

      const results = await withPrebuiltStorybook(() =>
        runUiVerify(
          parseUiVerifyArgs([
            "--update",
            "--viewport",
            "desktop",
            "--story",
            "components-button--overview",
            "--out",
            outDir,
          ]),
          quietDependencies(tempDir),
        ),
      );

      expect(results.passed).toBe(false);
      expect(results.error).toContain("components-button--overview-desktop.png");
      expect(readSavedResults(outDir).passed).toBe(false);
      expect(readFileSync(join(outDir, "report.md"), "utf8")).toContain("**Status:** FAIL");
      expect(existsSync(join(outDir, LOCK_FILE))).toBe(false);
    });
  });

  it("deletes only the selected targets' screenshots at the selected viewports", async () => {
    await withTempDir("merit-ui-verify-update-", async (tempDir) => {
      const outDir = join(tempDir, "out");
      const screenshotsDir = join(outDir, "screenshots");
      writeStorybookIndex(tempDir);
      mkdirSync(screenshotsDir, { recursive: true });

      const screenshot = (name: string) => join(screenshotsDir, name);

      writeFileSync(screenshot("components-button--overview-desktop.png"), "selected");
      writeFileSync(screenshot("components-button--overview-mobile.png"), "mobile");
      writeFileSync(screenshot("other-story-desktop.png"), "other");

      // The temp repository has no Storybook to serve, so the run fails once the cleanup is done.
      const results = await withPrebuiltStorybook(() =>
        runUiVerify(
          parseUiVerifyArgs([
            "--update",
            "--viewport",
            "desktop",
            "--story",
            "components-button--overview",
            "--out",
            outDir,
          ]),
          quietDependencies(tempDir),
        ),
      );

      expect(results.passed).toBe(false);
      expect(existsSync(screenshot("components-button--overview-desktop.png"))).toBe(false);
      expect(existsSync(screenshot("components-button--overview-mobile.png"))).toBe(true);
      expect(existsSync(screenshot("other-story-desktop.png"))).toBe(true);
    });
  });
});

describe("runUiVerify output lock", () => {
  it("fails at once while another live run holds the output directory", async () => {
    await withTempDir("merit-ui-verify-lock-", async (tempDir) => {
      const lockPath = join(tempDir, LOCK_FILE);
      const releaseOtherRun = await acquireFileLock(lockPath, { timeoutMs: 0 });
      writeFileSync(join(tempDir, "results.json"), "other run", "utf8");

      await expect(runContainerDelegation(tempDir)).rejects.toThrow(
        `Another ui:verify run (pid ${process.pid}) is writing to "${tempDir}". Wait for it to finish or pass a different --out directory.`,
      );
      expect(readFileSync(join(tempDir, "results.json"), "utf8")).toBe("other run");

      releaseOtherRun();
      const results = await runContainerDelegation(tempDir);
      expect(results.containerExitCode).toBe(0);
      expect(existsSync(lockPath)).toBe(false);
    });
  });

  it("reclaims a damaged output lock that names no owner", async () => {
    await withTempDir("merit-ui-verify-lock-", async (tempDir) => {
      const lockPath = join(tempDir, LOCK_FILE);
      // Locks are published complete, so an empty one past the write grace was damaged.
      writeFileSync(lockPath, "", "utf8");
      const longAgo = new Date(Date.now() - 60_000);
      utimesSync(lockPath, longAgo, longAgo);

      const results = await runContainerDelegation(tempDir);

      expect(results.containerExitCode).toBe(0);
      expect(readdirSync(tempDir).toSorted()).toEqual(["report.md", "results.json"]);
    });
  });

  it.runIf(existsSync("/proc/self/stat"))(
    "reclaims an output lock whose PID now belongs to a different process",
    async () => {
      await withTempDir("merit-ui-verify-lock-", async (tempDir) => {
        // A finished run's PID was reused by this live process, which started at another time.
        const reusedPidLock = {
          pid: process.pid,
          token: "finished-run",
          createdAt: Date.now(),
          startTime: "earlier-boot:1",
        };
        writeFileSync(join(tempDir, LOCK_FILE), `${JSON.stringify(reusedPidLock)}\n`, "utf8");

        const results = await runContainerDelegation(tempDir);

        expect(results.containerExitCode).toBe(0);
        expect(readdirSync(tempDir).toSorted()).toEqual(["report.md", "results.json"]);
      });
    },
  );
});

describe("runUiVerify interrupts", () => {
  it("tears down and releases the output lock when interrupted mid-run", async () => {
    await withTempDir("merit-ui-verify-signal-", async (tempDir) => {
      const outDir = join(tempDir, "out");
      const lines: string[] = [];
      let interrupt: ((signal: NodeJS.Signals) => Promise<void>) | undefined;
      let lockHeldAfterTeardown: Promise<boolean> | undefined;

      await runUiVerify(
        invalidRouteOptions(outDir),
        quietDependencies(tempDir, {
          watchInterrupts: (teardown) => {
            interrupt = teardown;
            return () => undefined;
          },
          log: (line) => {
            lines.push(line);
            if (line.startsWith("FAIL:")) {
              // Ctrl+C arrives while the run is still holding its output directory.
              lockHeldAfterTeardown = interrupt?.("SIGINT").then(() =>
                existsSync(join(outDir, LOCK_FILE)),
              );
            }
          },
        }),
      );

      expect(await lockHeldAfterTeardown).toBe(false);
      expect(lines).toContain("Received SIGINT; tearing down isolated ui:verify servers...");
    });
  });

  it("keeps watching interrupts until teardown finishes", async () => {
    await withTempDir("merit-ui-verify-signal-", async (tempDir) => {
      const outDir = join(tempDir, "out");
      const watching: string[] = [];

      const watchInterrupts: WatchInterrupts = () => {
        watching.push("started");
        return () => {
          // Releasing the output lock is the last teardown step.
          watching.push(existsSync(join(outDir, LOCK_FILE)) ? "stopped early" : "stopped");
        };
      };

      const results = await runUiVerify(
        invalidRouteOptions(outDir),
        quietDependencies(tempDir, { watchInterrupts }),
      );

      expect(results.error).toMatch(/Protocol-relative routes are not allowed/);
      expect(watching).toEqual(["started", "stopped"]);
    });
  });

  it("leaves interrupts to the container during a container run", async () => {
    await withTempDir("merit-ui-verify-signal-", async (tempDir) => {
      let watched = false;
      await runUiVerify(
        parseUiVerifyArgs(["--container", "--out", tempDir]),
        quietDependencies(tempDir, {
          runContainer: () => 0,
          watchInterrupts: () => {
            watched = true;
            return () => undefined;
          },
        }),
      );
      expect(watched).toBe(false);
    });
  });
});

describe("runUiVerify failure reports", () => {
  it("writes failed results.json and report.md when route validation fails inside runUiVerify", async () => {
    await withTempDir("merit-ui-verify-route-fail-", async (tempDir) => {
      const outDir = join(tempDir, "out");
      const results = await runUiVerify(invalidRouteOptions(outDir), quietDependencies(tempDir));

      expect(results.passed).toBe(false);
      expect(results.error).toMatch(/Protocol-relative routes are not allowed/);
      const savedJson = readSavedResults(outDir);
      expect(savedJson.passed).toBe(false);
      expect(savedJson.error).toMatch(/Protocol-relative routes are not allowed/);
      const report = readFileSync(join(outDir, "report.md"), "utf8");
      expect(report).toContain("**Status:** FAIL");
      expect(report).toContain("## Error");
      expect(report).toContain("//evil.test/app");
    });
  });

  it("writes failed results.json and report.md over a stale PASS when --story matches no stories", async () => {
    await withTempDir("merit-ui-verify-filter-fail-", async (tempDir) => {
      const outDir = join(tempDir, "out");
      writeStorybookIndex(tempDir);
      seedStalePass(outDir);

      const results = await withPrebuiltStorybook(() =>
        runUiVerify(
          parseUiVerifyArgs(["--story", "does-not-exist", "--out", outDir]),
          quietDependencies(tempDir),
        ),
      );

      expect(results.passed).toBe(false);
      expect(results.error).toContain("does-not-exist");
      const savedJson = readSavedResults(outDir);
      expect(savedJson.passed).toBe(false);
      expect(savedJson.error).toContain("does-not-exist");
      const report = readFileSync(join(outDir, "report.md"), "utf8");
      expect(report).toContain("**Status:** FAIL");
      expect(report).toContain("## Error");
      expect(report).toContain("does-not-exist");
    });
  });
});

describe("runUiVerify --container", () => {
  it("delegates --container runs and writes Zod-validated results.json and report.md", async () => {
    await withTempDir("merit-ui-verify-container-", async (tempDir) => {
      const receivedArgs: string[][] = [];
      const results = await runUiVerify(
        parseUiVerifyArgs(["--container", "--update", "--out", tempDir]),
        quietDependencies(tempDir, {
          runContainer: (args) => {
            receivedArgs.push([...args]);
            return 0;
          },
        }),
      );

      expect(receivedArgs).toEqual([["--update-snapshots"]]);
      expect(results.passed).toBe(true);
      expect(results.mode).toBe("container");
      expect(results.updated).toBe(true);
      expect(readSavedResults(tempDir).containerExitCode).toBe(0);
      expect(readFileSync(join(tempDir, "report.md"), "utf8")).toContain("run-visual-container.ts");
    });
  });

  it("reports a container story filter that selects nothing as a failed delegation", async () => {
    await withTempDir("merit-ui-verify-container-", async (tempDir) => {
      const results = await runUiVerify(
        parseUiVerifyArgs(["--container", "--story", "desktop", "--out", tempDir]),
        quietDependencies(tempDir, { runContainer: () => 0 }),
      );

      expect(results.passed).toBe(false);
      expect(results.containerExitCode).toBe(1);
      expect(results.error).toContain('--story "desktop" matches no visual baseline story');
    });
  });
});
