import { and, eq, sql } from "drizzle-orm";

import type { AccessAction } from "@merit/access";
import { appUsers } from "@merit/auth/schema";
import type { Transaction } from "@merit/db";

import { AssistantStoreError, hasAssistantConsent, type AssistantOwner } from "../assistant-access";
import {
  ownedConversation,
  storedConversation,
  type AssistantCheckpoint,
  type CheckpointOperation,
} from "../assistant-conversations";
import { assistantConsents, assistantConversations as conversations } from "../assistant-schema";
import { memberships, organizations } from "../membership-schema";
import { activeOrganization, membershipScope } from "../scope";

// Take workspace locks first, as grant commands and team changes do. A callback that may
// run a grant command takes the exclusive lock up front to avoid lock upgrades.
const lockAssistantOwner = async (
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
    return { enabled, ending: [] };
  }
  // The administrator's own transaction learns which chats this ends, before consent is gone.
  const running = await tx.execute<{ id: string }>(
    sql`select merit_workspace_running_assistant_conversations() as id`,
  );
  await tx
    .delete(assistantConsents)
    .where(eq(assistantConsents.organizationId, member.organizationId));
  return { enabled, ending: running.rows.map((row) => row.id) };
};

export const createConversation = async (
  tx: Transaction,
  owner: AssistantOwner,
  initial: AssistantCheckpoint,
) => {
  const member = await lockAssistantOwner(tx, owner, "read_workspace", "share");
  if (!member) {
    throw new AssistantStoreError("forbidden");
  }
  if (!(await hasAssistantConsent(tx, member.organizationId))) {
    throw new AssistantStoreError("consent_required");
  }
  const [row] = await tx
    .insert(conversations)
    .values({ ...member, userId: owner.userId, state: initial.state, status: initial.status })
    .returning();
  if (!row) {
    throw new Error("Could not create assistant conversation");
  }
  return storedConversation(row, owner.slug);
};

export const updateConversation = async (
  tx: Transaction,
  owner: AssistantOwner,
  id: string,
  revision: number,
  change: AssistantCheckpoint | CheckpointOperation,
) => {
  const member = await lockAssistantOwner(
    tx,
    owner,
    "read_workspace",
    typeof change === "function" ? "update" : "share",
  );
  if (!member) {
    return null;
  }
  const halting =
    typeof change !== "function" &&
    (change.status === "stopped" || change.status === "unavailable");
  if (!halting && !(await hasAssistantConsent(tx, member.organizationId))) {
    return null;
  }
  const address = and(
    ownedConversation(owner.userId, member),
    eq(conversations.id, id),
    eq(conversations.revision, revision),
  );
  const [current] = await tx.select().from(conversations).where(address).for("update");
  if (!current || current.status === "unavailable") {
    return null;
  }
  const checkpoint =
    typeof change === "function"
      ? await change(tx, storedConversation(current, owner.slug))
      : change;
  const [row] = await tx
    .update(conversations)
    .set({
      state: checkpoint.state,
      status: checkpoint.status,
      revision: sql`${conversations.revision} + 1`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(address)
    .returning();
  if (!row) {
    // A confirmed grant command can itself revoke the chat's access.
    const [revoked] = await tx
      .select()
      .from(conversations)
      .where(
        and(
          ownedConversation(owner.userId, member),
          eq(conversations.id, id),
          eq(conversations.status, "unavailable"),
        ),
      );
    if (revoked) {
      return storedConversation(revoked, owner.slug);
    }
    throw new Error("Lost locked assistant conversation");
  }
  return storedConversation(row, owner.slug);
};

export const deleteConversation = async (tx: Transaction, owner: AssistantOwner, id: string) => {
  const member = await lockAssistantOwner(tx, owner, "read_workspace", "share");
  if (!member) {
    return false;
  }
  const result = await tx
    .delete(conversations)
    .where(and(ownedConversation(owner.userId, member), eq(conversations.id, id)));
  return result.rowCount === 1;
};
