import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type * as AuditModule from "./audit.ts";
import type { RunContext } from "./cleanup.ts";
import { parseUiVerifyArgs } from "./cli.ts";
import type * as OutputModule from "./output.ts";
import { runUiVerify } from "./run.ts";
import type * as ServersModule from "./servers.ts";

/** What the run had on disk at each step this test observes. */
const observations: Array<{ step: string; locked: boolean; published: boolean }> = [];
let observedOutDir = "";

const observe = (step: string) => {
  observations.push({
    step,
    locked: existsSync(join(observedOutDir, ".ui-verify.lock")),
    published: existsSync(join(observedOutDir, "results.json")),
  });
};

// Stand-ins for Storybook and Chromium, so the host run reaches its report and teardown at once.
vi.mock("./servers.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof ServersModule>()),
  buildStorybookIfNeeded: async () => undefined,
  startStorybookServer: async ({ registerCleanup }: RunContext) => {
    const stop = registerCleanup(async () => {
      observe("Storybook stopped");
    });
    return { baseUrl: "http://127.0.0.1:1", stop };
  },
}));

const stubBrowser = {
  close: async () => {
    observe("browser closed");
  },
};

/** When set, the browser launch waits for this, so a test can interrupt the run mid-launch. */
let pendingLaunch: Promise<typeof stubBrowser> | undefined;
let launchesStarted = 0;

vi.mock("./audit.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof AuditModule>()),
  launchVerificationBrowser: async () => {
    launchesStarted += 1;
    return pendingLaunch ?? stubBrowser;
  },
  runTargetsInBrowser: async () => {
    observe("targets checked");
    return [];
  },
}));

vi.mock("./output.ts", async (importOriginal) => {
  const output = await importOriginal<typeof OutputModule>();
  return {
    ...output,
    publishResults: (...args: Parameters<typeof output.publishResults>) => {
      const results = output.publishResults(...args);
      observe("results published");
      return results;
    },
  };
});

afterEach(() => {
  pendingLaunch = undefined;
  launchesStarted = 0;
  observations.splice(0);
  if (observedOutDir) {
    rmSync(observedOutDir, { recursive: true, force: true });
  }
});

describe("runUiVerify output lock", () => {
  it("holds the output directory until the report is written and every server has stopped", async () => {
    observedOutDir = mkdtempSync(join(tmpdir(), "merit-ui-verify-lock-order-"));

    await runUiVerify(parseUiVerifyArgs(["--out", observedOutDir, "--viewport", "desktop"]), {
      repoRoot: observedOutDir,
      log: () => undefined,
      runContainer: () => {
        throw new Error("This run does not delegate to the container.");
      },
    });

    expect(observations).toEqual([
      { step: "targets checked", locked: true, published: false },
      { step: "results published", locked: true, published: true },
      { step: "browser closed", locked: true, published: true },
      { step: "Storybook stopped", locked: true, published: true },
    ]);
    expect(existsSync(join(observedOutDir, ".ui-verify.lock"))).toBe(false);
  });

  it("closes a browser still launching when interrupted before releasing the output directory", async () => {
    observedOutDir = mkdtempSync(join(tmpdir(), "merit-ui-verify-lock-launch-"));

    let finishLaunch = () => {};

    pendingLaunch = new Promise((resolve) => {
      finishLaunch = () => resolve(stubBrowser);
    });
    let teardown: ((signal: NodeJS.Signals) => Promise<void>) | undefined;

    const run = runUiVerify(parseUiVerifyArgs(["--out", observedOutDir, "--viewport", "desktop"]), {
      repoRoot: observedOutDir,
      log: () => undefined,
      runContainer: () => {
        throw new Error("This run does not delegate to the container.");
      },
      watchInterrupts: (onInterrupt) => {
        teardown = onInterrupt;
        return () => undefined;
      },
    });
    await vi.waitFor(() => expect(launchesStarted).toBe(1));
    const interrupted = teardown?.("SIGINT");
    finishLaunch();
    await interrupted;
    const results = await run;

    expect(results.error).toMatch(/Cleanup started/);
    expect(observations.map(({ step }) => step)).not.toContain("targets checked");
    // Teardown released the directory, so a later run may own it: this run must not write there.
    expect(observations.map(({ step }) => step)).not.toContain("results published");
    expect(existsSync(join(observedOutDir, "results.json"))).toBe(false);
    expect(observations.find(({ step }) => step === "browser closed")?.locked).toBe(true);
    expect(existsSync(join(observedOutDir, ".ui-verify.lock"))).toBe(false);
  });
});
