import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { type WorktreeRecord } from "./registry.ts";
import { collectReservedPorts, portsInUse } from "./reserved-ports.ts";
import { makeTempDir, useWorktreeFixtures, worktreeRecord } from "./tests/fixtures.ts";

useWorktreeFixtures();

const ALPHA_PATH = "/repo/.tmp/worktrees/alpha";

const registryOf = (alpha: WorktreeRecord) => ({ version: 1 as const, worktrees: { alpha } });

test.each([
  {
    name: "an active checkout Git still tracks",
    status: "active" as const,
    active: true,
    reserved: true,
  },
  { name: "a checkout being created", status: "creating" as const, active: false, reserved: true },
  { name: "a checkout being cleaned", status: "cleaning" as const, active: false, reserved: true },
  {
    name: "a checkout that no longer exists",
    status: "active" as const,
    active: false,
    reserved: false,
  },
])(
  "reserves the defaults and decides whether $name keeps its ports",
  ({ status, active, reserved }) => {
    const ports = collectReservedPorts(
      registryOf(worktreeRecord({ slug: "alpha", path: ALPHA_PATH, status })),
      new Set(active ? [ALPHA_PATH] : []),
    );

    expect(ports.has(3000)).toBe(true);
    expect(ports.has(3100)).toBe(reserved);
  },
);

test("reserves every recorded port when no Git worktree list is given", () => {
  const ports = collectReservedPorts(
    registryOf(worktreeRecord({ slug: "alpha", path: ALPHA_PATH })),
  );

  expect(ports.has(3100)).toBe(true);
});

test("adds the ports the primary and linked checkouts' .env.local files set", () => {
  const primary = makeTempDir("merit-primary-");
  const linked = makeTempDir("merit-linked-");
  mkdirSync(join(primary, "app"), { recursive: true });
  writeFileSync(join(primary, "app/.env.local"), "MERIT_DEV_PORT=4100\n", "utf8");
  writeFileSync(join(linked, ".env.local"), "MERIT_APP_PORT=4101\n", "utf8");

  const ports = portsInUse(primary, { version: 1, worktrees: {} }, new Set([linked]));

  expect(ports.has(4100)).toBe(true);
  expect(ports.has(4101)).toBe(true);
});
