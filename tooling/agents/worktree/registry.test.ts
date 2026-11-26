import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  readWorktreeRegistry,
  registryLockPathForRepo,
  registryPathForRepo,
  updateRecord,
  withWorktreeRegistryLock,
  writeWorktreeRegistry,
} from "./registry.ts";
import { makeTempDir, useWorktreeFixtures, worktreeRecord } from "./tests/fixtures.ts";

useWorktreeFixtures();

describe("worktree registry", () => {
  test("reads a missing registry as empty", () => {
    expect(readWorktreeRegistry(makeTempDir("merit-registry-"))).toEqual({
      version: 1,
      worktrees: {},
    });
  });

  test("round-trips records through .tmp/worktrees/.registry.json", () => {
    const root = makeTempDir("merit-registry-");
    const alpha = worktreeRecord({ slug: "alpha", path: join(root, ".tmp/worktrees/alpha") });

    writeWorktreeRegistry(root, { version: 1, worktrees: { alpha } });

    expect(registryPathForRepo(root)).toBe(join(root, ".tmp/worktrees/.registry.json"));
    expect(readWorktreeRegistry(root).worktrees.alpha).toEqual(alpha);
  });

  test("reports a corrupt registry instead of treating it as empty", () => {
    const root = makeTempDir("merit-registry-");
    const registryPath = registryPathForRepo(root);
    mkdirSync(dirname(registryPath), { recursive: true });
    writeFileSync(registryPath, "{not valid json", "utf8");

    expect(() => readWorktreeRegistry(root)).toThrow(
      `Corrupt or invalid worktree registry at "${registryPath}"`,
    );
  });

  test("names the registry lock when another live process holds it", async () => {
    const root = makeTempDir("merit-registry-");
    const lockPath = registryLockPathForRepo(root);
    mkdirSync(dirname(lockPath), { recursive: true });
    const livePayload = `${JSON.stringify({ pid: process.pid, token: "live", createdAt: 0 })}\n`;
    writeFileSync(lockPath, livePayload, "utf8");

    await expect(
      withWorktreeRegistryLock(root, () => "acquired", { timeoutMs: 60, initialDelayMs: 10 }),
    ).rejects.toThrow(/Timed out waiting for worktree registry lock/);
    expect(readFileSync(lockPath, "utf8")).toBe(livePayload);
  });
});

describe("updateRecord", () => {
  const setUp = () => {
    const root = makeTempDir("merit-registry-");
    const alpha = worktreeRecord({
      slug: "alpha",
      path: join(root, ".tmp/worktrees/alpha"),
      status: "creating",
    });
    const beta = worktreeRecord({ slug: "beta", path: join(root, ".tmp/worktrees/beta") });
    writeWorktreeRegistry(root, { version: 1, worktrees: { alpha, beta } });
    return { root, alpha, beta };
  };

  test("replaces a record that still matches", async () => {
    const { root, alpha, beta } = setUp();

    const changed = await updateRecord(root, "alpha", {
      when: (record) => record.status === "creating",
      apply: (record) => ({ ...record, status: "active" }),
    });

    expect(changed).toBe(true);
    expect(readWorktreeRegistry(root).worktrees).toEqual({
      alpha: { ...alpha, status: "active" },
      beta,
    });
  });

  test("removes a record when the update returns none", async () => {
    const { root, beta } = setUp();

    expect(await updateRecord(root, "alpha", { when: () => true, apply: () => undefined })).toBe(
      true,
    );
    expect(readWorktreeRegistry(root).worktrees).toEqual({ beta });
  });

  test.each([
    { name: "no longer matches", slug: "alpha", when: () => false },
    { name: "is missing", slug: "gamma", when: () => true },
  ])("leaves the registry unchanged when the record $name", async ({ slug, when }) => {
    const { root } = setUp();
    const before = readFileSync(registryPathForRepo(root), "utf8");

    expect(await updateRecord(root, slug, { when, apply: () => undefined })).toBe(false);
    expect(readFileSync(registryPathForRepo(root), "utf8")).toBe(before);
  });
});
