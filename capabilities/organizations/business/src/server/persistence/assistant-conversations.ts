import { and, desc, eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";

import { readAssistantOwner, type AssistantOwner } from "./assistant-access";
import { assistantConversations as conversations } from "./assistant-schema";

type Row = typeof conversations.$inferSelect;

type AssistantStatus = Row["status"];

export type AssistantCheckpoint = { state: unknown; status: AssistantStatus };

export const storedConversation = (row: Row, workspaceSlug: string) => ({
  id: row.id,
  workspaceSlug,
  revision: row.revision,
  status: row.status,
  state: row.state,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

type StoredConversation = ReturnType<typeof storedConversation>;

export const ownedConversation = (
  userId: string,
  membership: { organizationId: string; membershipId: string },
) =>
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
      and(
        ownedConversation(owner.userId, member),
        id === undefined ? undefined : eq(conversations.id, id),
      ),
    )
    .orderBy(desc(conversations.updatedAt), desc(conversations.id));
  return rows.map((row) => storedConversation(row, owner.slug));
};

export type CheckpointOperation = (
  tx: Transaction,
  conversation: StoredConversation,
) => Promise<AssistantCheckpoint>;
