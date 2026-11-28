import { and, eq, inArray } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Transaction } from "@merit/db";

import { organizations, memberships } from "../membership-schema";
import { authorizedWorkspaces, organizationScope } from "../scope";

const workspaceLock = Symbol("locked workspace");

type WorkspaceAddress = { slug: string; userId: string } | { id: string };

const targetWorkspace = (tx: Transaction, address: WorkspaceAddress) => {
  if ("id" in address) {
    return eq(organizations.id, address.id);
  }
  const access = authorizedWorkspaces(tx, address.userId, "work_on_grants", address.slug);
  return inArray(organizations.id, tx.select({ id: access.id }).from(access));
};

/** Grant commands lock workspace, round, case, assignment, then current authority, omitting unused rows. */
export const lockWorkspaceRow = async <Mode extends "share" | "update">(
  tx: Transaction,
  address: WorkspaceAddress,
  mode: Mode,
) => {
  const [organization] = await tx
    .select({ id: organizations.id, name: organizations.name, kind: organizations.kind })
    .from(organizations)
    .where(targetWorkspace(tx, address))
    .for(mode, { of: organizations });
  return organization
    ? ({
        [workspaceLock]: true,
        tx,
        organizationId: organization.id,
        organization,
        workspaceMode: mode,
      } as const)
    : null;
};

export type LockedWorkspace = NonNullable<Awaited<ReturnType<typeof lockWorkspaceRow>>>;

export const lockGrantWorkspace = async (
  tx: Transaction,
  userId: string,
  slug: string,
  mode: "share" | "update",
) => {
  const workspace = await lockWorkspaceRow(tx, { slug, userId }, mode);
  return workspace && lockGrantActor(workspace, userId);
};

/** Acquired after resource locks, holding the actor's authority through commit. */
export const lockGrantActor = async <Resource extends LockedWorkspace>(
  locked: Resource,
  userId: string,
) => {
  const { tx, organizationId } = locked;
  const [actor] = await tx
    .select({ userId: appUsers.id, name: appUsers.name, email: memberships.email })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        organizationScope(userId, "work_on_grants", organizationId),
      ),
    )
    .for("share", { of: [memberships, appUsers] });
  return actor ? { ...locked, actor, authorityLocked: true as const } : null;
};
