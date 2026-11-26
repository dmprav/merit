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

vi.mock("./audit.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof AuditModule>()),
  launchVerificationBrowser: async () => ({
    close: async () => {
      observe("browser closed");
    },
  }),
  runTargetsInBrowser: async () => [],
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
      { step: "results published", locked: true, published: true },
      { step: "browser closed", locked: true, published: true },
      { step: "Storybook stopped", locked: true, published: true },
    ]);
    expect(existsSync(join(observedOutDir, ".ui-verify.lock"))).toBe(false);
  });
});
