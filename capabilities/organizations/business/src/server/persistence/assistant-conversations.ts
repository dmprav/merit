import { and, desc, eq, sql } from "drizzle-orm";

import type { Transaction } from "@merit/db";

import {
  AssistantStoreError,
  hasAssistantConsent,
  lockAssistantOwner,
  readAssistantOwner,
  type AssistantOwner,
} from "./assistant-access";
import { assistantConversations as conversations } from "./assistant-schema";

type Row = typeof conversations.$inferSelect;

export type AssistantStatus = Row["status"];

export type AssistantCheckpoint = { state: unknown; status: AssistantStatus };

const storedConversation = (row: Row, workspaceSlug: string) => ({
  id: row.id,
  workspaceSlug,
  revision: row.revision,
  status: row.status,
  state: row.state,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export type StoredConversation = ReturnType<typeof storedConversation>;

const owned = (userId: string, membership: { organizationId: string; membershipId: string }) =>
  and(
    eq(conversations.organizationId, membership.organizationId),
    eq(conversations.userId, userId),
    eq(conversations.membershipId, membership.membershipId),
  );

export const readConversations = async (tx: Transaction, owner: AssistantOwner, id?: string) => {
  const member = await readAssistantOwner(tx, owner);
  if (!member) {
    return [];
  }
  const rows = await tx
    .select()
    .from(conversations)
    .where(
      and(owned(owner.userId, member), id === undefined ? undefined : eq(conversations.id, id)),
    )
    .orderBy(desc(conversations.updatedAt), desc(conversations.id));
  return rows.map((row) => storedConversation(row, owner.slug));
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

export type CheckpointOperation = (
  tx: Transaction,
  conversation: StoredConversation,
) => Promise<AssistantCheckpoint>;

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
    owned(owner.userId, member),
    eq(conversations.id, id),
    eq(conversations.revision, revision),
  );
  const [current] = await tx.select().from(conversations).where(address).for("update");
  if (!current) {
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
    .where(and(owned(owner.userId, member), eq(conversations.id, id)));
  return result.rowCount === 1;
};
