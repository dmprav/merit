import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import {
  lockDemoUser,
  expireDemo,
  insertDemo,
  lockExpiredDemo,
  deleteDemo,
  consumeDemoEntry,
  removeOldDemoEntryLimits,
} from "./persistence/commands/demo";
import { currentDemo, expiredDemos, hasMembership, type Demo } from "./persistence/demo";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const lifetime = 7 * 24 * 60 * 60 * 1000;

export const readDemoWorkspace = async (db: Database, actor: Actor) => {
  const workspace = await currentDemo(db, actor.userId);
  return !workspace
    ? ({ status: "empty" } as const)
    : workspace.demoExpiresAt! <= new Date()
      ? ({ status: "expired" } as const)
      : ({ status: "ready", workspace } as const);
};

/** The caller supplies capability-owned seed writes in this transaction. A reset
 * names the old workspace, so retrying it cannot reset its replacement. */
export const startDemoWorkspace = async (
  db: Database,
  actor: Actor,
  input: { fresh: boolean; resetWorkspaceId?: string },
  seedVersion: number,
  seed: (tx: Transaction, workspace: Demo, userId: string) => Promise<void>,
) =>
  db.transaction(async (tx) => {
    const user = await lockDemoUser(tx, actor.userId);
    if (!user?.active) {
      return { status: "unavailable" } as const;
    }

    const current = await currentDemo(tx, actor.userId);
    const active = current && current.demoExpiresAt! > new Date();
    if (input.resetWorkspaceId && current?.id !== input.resetWorkspaceId) {
      return active
        ? ({ status: "ready", workspace: current } as const)
        : ({ status: "expired" } as const);
    }
    if (active && !input.resetWorkspaceId) {
      return { status: "ready", workspace: current } as const;
    }
    if (current && !active && !input.fresh) {
      return { status: "expired" } as const;
    }

    if (current) {
      await expireDemo(tx, current.id);
    }
    const workspace = await insertDemo(tx, user.id, seedVersion, new Date(Date.now() + lifetime));
    await seed(tx, workspace!, user.id);
    return { status: "ready", workspace: workspace! } as const;
  });

/** Operator cleanup only. The runtime does not receive blanket audit DELETE privileges. */
export const removeExpiredDemos = async (
  db: Database,
  removeContent: (tx: Transaction, organizationId: string) => Promise<void>,
) => {
  await db.transaction((tx) => removeOldDemoEntryLimits(tx));
  const expired = await expiredDemos(db);
  for (const item of expired) {
    await db.transaction(async (tx) => {
      const workspace = await lockExpiredDemo(tx, item.id);
      if (!workspace) {
        return;
      }
      await removeContent(tx, workspace.id);
      await deleteDemo(tx, workspace.id);
    });
  }

  return expired.length;
};

export const allowDemoEntry = async (db: Database, networkAddress: string) => {
  const bucket = `${Math.floor(Date.now() / 3600000)}:${networkAddress}`;
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bucket))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return db.transaction((tx) => consumeDemoEntry(tx, hash));
};

export const canRemoveGuest = async (db: Database, userId: string) =>
  !(await hasMembership(db, userId));
