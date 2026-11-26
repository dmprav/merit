import { createServer } from "node:net";

import { expect, test } from "vite-plus/test";

import {
  allocateWorktreePorts,
  DEFAULT_PORTS,
  isPortAvailable,
  WORKTREE_PORT_BASES,
} from "./ports.ts";

const allFree = async () => true;

test("allocates the first slot when only the defaults are reserved", async () => {
  const ports = await allocateWorktreePorts({
    reservedPorts: new Set(Object.values(DEFAULT_PORTS)),
    checkPortAvailable: allFree,
  });

  expect(ports).toEqual(WORKTREE_PORT_BASES);
});

test("skips a slot whose ports another worktree reserved", async () => {
  const ports = await allocateWorktreePorts({
    reservedPorts: new Set([
      ...Object.values(DEFAULT_PORTS),
      WORKTREE_PORT_BASES.MERIT_STORYBOOK_PORT,
    ]),
    checkPortAvailable: allFree,
  });

  expect(ports).toEqual({
    MERIT_DEV_PORT: 3110,
    MERIT_APP_PORT: 3111,
    MERIT_WORKSPACE_PORT: 3112,
    MERIT_STORYBOOK_DEV_PORT: 6116,
    MERIT_STORYBOOK_PORT: 6117,
  });
});

test("skips a slot with a port something is listening on", async () => {
  const ports = await allocateWorktreePorts({
    reservedPorts: new Set(Object.values(DEFAULT_PORTS)),
    checkPortAvailable: async (port) => port !== WORKTREE_PORT_BASES.MERIT_APP_PORT,
  });

  expect(ports.MERIT_DEV_PORT).toBe(3110);
  expect(ports.MERIT_APP_PORT).toBe(3111);
});

test("allocates each port on its own when every slot is congested", async () => {
  const everyDevSlot = Array.from({ length: 200 }, (_, slot) => 3100 + slot * 10);

  const ports = await allocateWorktreePorts({
    reservedPorts: new Set(everyDevSlot),
    checkPortAvailable: allFree,
  });

  expect(ports).toEqual({
    MERIT_DEV_PORT: 3101,
    MERIT_APP_PORT: 3102,
    MERIT_WORKSPACE_PORT: 3103,
    MERIT_STORYBOOK_DEV_PORT: 6106,
    MERIT_STORYBOOK_PORT: 6107,
  });
});

test("reports a port bound on 127.0.0.1 as unavailable", async () => {
  const blocker = createServer();
  await new Promise<void>((resolveListen) => {
    blocker.listen(0, "127.0.0.1", () => resolveListen());
  });
  try {
    const address = blocker.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address");
    }
    expect(await isPortAvailable(address.port)).toBe(false);
  } finally {
    await new Promise<void>((resolveClose) => blocker.close(() => resolveClose()));
  }
});
