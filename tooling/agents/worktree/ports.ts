import { createServer } from "node:net";

import { z } from "zod";

export const DEFAULT_PORTS = {
  MERIT_DEV_PORT: 3000,
  MERIT_APP_PORT: 3001,
  MERIT_WORKSPACE_PORT: 3002,
  MERIT_STORYBOOK_DEV_PORT: 6006,
  MERIT_STORYBOOK_PORT: 6007,
} as const;

export const WORKTREE_PORT_BASES = {
  MERIT_DEV_PORT: 3100,
  MERIT_APP_PORT: 3101,
  MERIT_WORKSPACE_PORT: 3102,
  MERIT_STORYBOOK_DEV_PORT: 6106,
  MERIT_STORYBOOK_PORT: 6107,
} as const;

const WORKTREE_PORT_STRIDE = 10;
const MAX_PORT_SLOTS = 200;
const MAX_PORT = 65535;

const portSchema = z.number().int().min(1024).max(MAX_PORT);

export const worktreePortsSchema = z.object({
  MERIT_DEV_PORT: portSchema,
  MERIT_APP_PORT: portSchema,
  MERIT_WORKSPACE_PORT: portSchema,
  MERIT_STORYBOOK_DEV_PORT: portSchema,
  MERIT_STORYBOOK_PORT: portSchema,
});

export type WorktreePorts = z.infer<typeof worktreePortsSchema>;

export type WorktreePortKey = keyof WorktreePorts;

export const WORKTREE_PORT_KEYS: readonly WorktreePortKey[] = worktreePortsSchema.keyof().options;

type CheckPortAvailable = (port: number) => Promise<boolean>;

const canBindHost = (
  port: number,
  host: string,
  ignoreUnsupportedHost: boolean,
): Promise<boolean> =>
  new Promise((resolvePromise) => {
    const server = createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (
        ignoreUnsupportedHost &&
        (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")
      ) {
        resolvePromise(true);
        return;
      }
      resolvePromise(false);
    });
    server.once("listening", () => {
      server.close(() => resolvePromise(true));
    });
    server.listen({ port, host, exclusive: true });
  });

export const isPortAvailable = async (port: number): Promise<boolean> => {
  const ipv4Free = await canBindHost(port, "127.0.0.1", false);
  if (!ipv4Free) {
    return false;
  }
  return canBindHost(port, "::1", true);
};

const portsForSlot = (slot: number): WorktreePorts => {
  const offset = slot * WORKTREE_PORT_STRIDE;
  return worktreePortsSchema.parse(
    Object.fromEntries(WORKTREE_PORT_KEYS.map((key) => [key, WORKTREE_PORT_BASES[key] + offset])),
  );
};

/** Finds the first aligned slot whose ports are all unclaimed and free, keeping one worktree's ports together. */
const findFreeSlot = async (
  claimed: ReadonlySet<number>,
  checkPortAvailable: CheckPortAvailable,
): Promise<WorktreePorts | undefined> => {
  for (let slot = 0; slot < MAX_PORT_SLOTS; slot += 1) {
    const offset = slot * WORKTREE_PORT_STRIDE;
    if (WORKTREE_PORT_KEYS.some((key) => WORKTREE_PORT_BASES[key] + offset > MAX_PORT)) {
      continue;
    }
    const candidate = portsForSlot(slot);
    const ports = Object.values(candidate);
    if (ports.some((port) => claimed.has(port))) {
      continue;
    }
    const availability = await Promise.all(ports.map((port) => checkPortAvailable(port)));
    if (availability.every(Boolean)) {
      return candidate;
    }
  }
  return undefined;
};

const findFreePort = async (
  key: WorktreePortKey,
  claimed: Set<number>,
  checkPortAvailable: CheckPortAvailable,
): Promise<number> => {
  for (let port = WORKTREE_PORT_BASES[key]; port <= MAX_PORT; port += 1) {
    if (!claimed.has(port) && (await checkPortAvailable(port))) {
      claimed.add(port);
      return port;
    }
  }
  throw new Error(`Could not allocate a free local port for ${key}.`);
};

/** Fallback when aligned slots are congested: allocates each port independently. */
const allocateEachPort = async (
  claimed: Set<number>,
  checkPortAvailable: CheckPortAvailable,
): Promise<WorktreePorts> => {
  const allocated: Partial<Record<WorktreePortKey, number>> = {};
  for (const key of WORKTREE_PORT_KEYS) {
    allocated[key] = await findFreePort(key, claimed, checkPortAvailable);
  }
  return worktreePortsSchema.parse(allocated);
};

export const allocateWorktreePorts = async ({
  reservedPorts,
  checkPortAvailable = isPortAvailable,
}: {
  reservedPorts: ReadonlySet<number>;
  checkPortAvailable?: CheckPortAvailable;
}): Promise<WorktreePorts> => {
  const claimed = new Set<number>(reservedPorts);
  return (
    (await findFreeSlot(claimed, checkPortAvailable)) ??
    allocateEachPort(claimed, checkPortAvailable)
  );
};
