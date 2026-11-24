import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import { loadEnvLocalFiles, loadRepoEnvLocal, readPort } from "./env.ts";

const tempDirs: string[] = [];
const touchedEnvKeys = new Set<string>();
const originalEnvValues = new Map<string, string | undefined>();

const trackEnvKey = (key: string) => {
  if (!touchedEnvKeys.has(key)) {
    touchedEnvKeys.add(key);
    originalEnvValues.set(key, process.env[key]);
  }
};

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "merit-env-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const key of touchedEnvKeys) {
    const previous = originalEnvValues.get(key);
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
  touchedEnvKeys.clear();
  originalEnvValues.clear();

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("readPort", () => {
  test("returns fallback for undefined or empty values and parses valid ports", () => {
    expect(readPort(undefined, 3000)).toBe(3000);
    expect(readPort("", 6006)).toBe(6006);
    expect(readPort("1", 3000)).toBe(1);
    expect(readPort("3100", 3000)).toBe(3100);
    expect(readPort("65535", 3000)).toBe(65535);
  });

  test("rejects non-integer, negative, zero, and out-of-range ports", () => {
    for (const invalid of ["0", "-1", "65536", "3000.5", "abc", "Infinity"]) {
      expect(() => readPort(invalid, 3000), invalid).toThrow(`Invalid port value: ${invalid}`);
    }
  });
});

describe("loadEnvLocalFiles and loadRepoEnvLocal", () => {
  test("preserves shell env > app/.env.local > repoRoot/.env.local precedence", () => {
    const repoRoot = makeTempDir();
    const appDir = join(repoRoot, "app");
    mkdirSync(appDir, { recursive: true });

    const shellKey = "MERIT_TEST_ENV_SHELL";
    const appKey = "MERIT_TEST_ENV_APP";
    const rootOnlyKey = "MERIT_TEST_ENV_ROOT_ONLY";

    for (const key of [shellKey, appKey, rootOnlyKey]) {
      trackEnvKey(key);
      delete process.env[key];
    }
    process.env[shellKey] = "from-shell";

    const appEnvPath = join(appDir, ".env.local");
    const rootEnvPath = join(repoRoot, ".env.local");
    writeFileSync(appEnvPath, `${shellKey}=from-app\n${appKey}=from-app\n`, "utf8");
    writeFileSync(
      rootEnvPath,
      `${shellKey}=from-root\n${appKey}=from-root\n${rootOnlyKey}=from-root\n`,
      "utf8",
    );

    loadEnvLocalFiles([appEnvPath, rootEnvPath]);

    expect(process.env[shellKey]).toBe("from-shell");
    expect(process.env[appKey]).toBe("from-app");
    expect(process.env[rootOnlyKey]).toBe("from-root");
  });

  test("skips missing files silently and loads <repoRoot>/.env.local via loadRepoEnvLocal", () => {
    const repoRoot = makeTempDir();
    const key = "MERIT_TEST_ENV_REPO_LOADER";
    trackEnvKey(key);
    delete process.env[key];

    // Missing file should not throw.
    loadRepoEnvLocal(repoRoot);
    expect(process.env[key]).toBeUndefined();

    writeFileSync(join(repoRoot, ".env.local"), `${key}=loaded-value\n`, "utf8");
    loadRepoEnvLocal(repoRoot);
    expect(process.env[key]).toBe("loaded-value");
  });
});
