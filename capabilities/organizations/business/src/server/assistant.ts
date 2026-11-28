import { sql } from "drizzle-orm";

import type { Actor } from "@merit/auth";
import type { DatabaseRunner, Transaction } from "@merit/db";

import {
  hasAssistantConsent,
  readAssistantOwner,
  type AssistantOwner,
} from "./persistence/assistant-access";
import {
  readConversations,
  type AssistantCheckpoint,
  type CheckpointOperation,
} from "./persistence/assistant-conversations";
import {
  changeAssistantConsent,
  createConversation,
  deleteConversation,
  updateConversation,
} from "./persistence/commands/assistant";
import { readWorkspace, writeWorkspace } from "./persistence/tenant";

export { AssistantStoreError } from "./persistence/assistant-access";
export type { AssistantCheckpoint } from "./persistence/assistant-conversations";

export const createAssistantStore = (database: DatabaseRunner) => {
  const scoped = <T>(
    transaction: typeof writeWorkspace,
    actor: Actor,
    slug: string,
    operation: (tx: Transaction, owner: AssistantOwner) => Promise<T>,
  ) =>
    database((db) =>
      transaction(db, actor.userId, slug, (tx) => operation(tx, { userId: actor.userId, slug })),
    );

  return {
    getConsent: (actor: Actor, slug: string) =>
      scoped(readWorkspace, actor, slug, async (tx, owner) => {
        const member = await readAssistantOwner(tx, owner);
        return !!member && hasAssistantConsent(tx, member.organizationId);
      }),
    setConsent: (actor: Actor, slug: string, enabled: boolean) =>
      scoped(writeWorkspace, actor, slug, (tx, owner) =>
        changeAssistantConsent(tx, owner, enabled),
      ),
    create: (
      actor: Actor,
      slug: string,
      initial: AssistantCheckpoint = { status: "idle", state: {} },
    ) => scoped(writeWorkspace, actor, slug, (tx, owner) => createConversation(tx, owner, initial)),
    read: (actor: Actor, slug: string, id: string) =>
      scoped(
        readWorkspace,
        actor,
        slug,
        async (tx, owner) => (await readConversations(tx, owner, id))[0] ?? null,
      ),
    list: (actor: Actor, slug: string) => scoped(readWorkspace, actor, slug, readConversations),
    save: (actor: Actor, slug: string, id: string, revision: number, change: AssistantCheckpoint) =>
      scoped(writeWorkspace, actor, slug, (tx, owner) =>
        updateConversation(tx, owner, id, revision, change),
      ),
    runLocked: (
      actor: Actor,
      slug: string,
      id: string,
      revision: number,
      change: CheckpointOperation,
    ) =>
      scoped(writeWorkspace, actor, slug, (tx, owner) =>
        updateConversation(tx, owner, id, revision, change),
      ),
    remove: (actor: Actor, slug: string, id: string) =>
      scoped(writeWorkspace, actor, slug, (tx, owner) => deleteConversation(tx, owner, id)),
    running: (limit = 50, after = "") =>
      database(
        async (db) =>
          (
            await db.execute<{
              userId: string;
              workspaceSlug: string;
              id: string;
              revision: number;
            }>(sql`select * from merit_running_assistant_conversations(${limit},${after})`)
          ).rows,
      ),
  };
};
