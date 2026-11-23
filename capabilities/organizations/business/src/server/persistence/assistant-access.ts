import { and, eq } from "drizzle-orm";

import type { AccessAction } from "@merit/access";
import { appUsers } from "@merit/auth/schema";
import type { Transaction } from "@merit/db";

import { assistantConsents } from "./assistant-schema";
import { memberships, organizations } from "./membership-schema";
import { activeOrganization, authorizedWorkspaces, membershipScope } from "./scope";

export type AssistantOwner = { userId: string; slug: string };

export class AssistantStoreError extends Error {
  readonly code: "forbidden" | "consent_required";
  constructor(code: AssistantStoreError["code"]) {
    super(code);
    this.code = code;
  }
}

export const readAssistantOwner = async (tx: Transaction, { userId, slug }: AssistantOwner) => {
  const workspaces = authorizedWorkspaces(tx, userId, "read_workspace", slug);
  const [member] = await tx
    .select({ organizationId: workspaces.id, membershipId: workspaces.membershipId })
    .from(workspaces);
  return member;
};

// Take workspace locks first, as grant commands and team changes do. A callback that may
// run a grant command takes the exclusive lock up front to avoid lock upgrades.
export const lockAssistantOwner = async (
  tx: Transaction,
  { userId, slug }: AssistantOwner,
  action: Extract<AccessAction, "read_workspace" | "configure_assistant">,
  mode: "share" | "update",
) => {
  const [org] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), activeOrganization))
    .for(mode);
  if (!org) {
    return undefined;
  }
  const [member] = await tx
    .select({ organizationId: memberships.organizationId, membershipId: memberships.id })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, org.id),
        membershipScope(action, org.id),
      ),
    )
    .for("share", { of: [memberships, appUsers] });
  return member;
};

export const hasAssistantConsent = async (tx: Transaction, organizationId: string) => {
  const [consent] = await tx
    .select()
    .from(assistantConsents)
    .where(eq(assistantConsents.organizationId, organizationId));
  return !!consent;
};

export const changeAssistantConsent = async (
  tx: Transaction,
  owner: AssistantOwner,
  enabled: boolean,
) => {
  const member = await lockAssistantOwner(tx, owner, "configure_assistant", "update");
  if (!member) {
    throw new AssistantStoreError("forbidden");
  }
  if (enabled) {
    await tx
      .insert(assistantConsents)
      .values({ organizationId: member.organizationId })
      .onConflictDoNothing();
  } else {
    await tx
      .delete(assistantConsents)
      .where(eq(assistantConsents.organizationId, member.organizationId));
  }
  return enabled;
};
