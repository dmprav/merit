import type { Actor } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";
import type { AssistantCatalog, AssistantPreview, AssistantReceipt } from "@merit/mcp/assistant";
import type { createAssistantStore } from "@merit/organizations/server/assistant";

import { endModelRequest } from "./model-request.server";
import type { AssistantModel } from "./openai.server";
import {
  conversationState,
  publicState,
  type ConversationState,
  type DeliveryTicket,
} from "./state";

export type AssistantRuntimeCatalog = Omit<AssistantCatalog, "execute"> & {
  execute: (
    preview: AssistantPreview,
  ) => Promise<AssistantReceipt & { retry?: AssistantPreview; delivery?: DeliveryTicket }>;
  /**
   * Put the failed message of a saved ticket back to `pending`, in the retry's own transaction,
   * so its workflow sends it again. Nothing else makes a failed message deliverable.
   */
  retryDelivery: (ticket: DeliveryTicket) => Promise<void>;
  /** Where the saved message stands now. `pending` means a later step asks again. */
  deliver: (ticket: DeliveryTicket) => Promise<"sent" | "failed" | "unavailable" | "pending">;
};

class RejectedWrite extends Error {
  readonly receipt: Awaited<ReturnType<AssistantRuntimeCatalog["execute"]>>;
  constructor(receipt: Awaited<ReturnType<AssistantRuntimeCatalog["execute"]>>) {
    super("The business operation rejected this change.");
    this.receipt = receipt;
  }
}

const transactionalCatalog = (
  db: Transaction,
  create: (db: Database) => AssistantRuntimeCatalog,
): AssistantRuntimeCatalog => ({
  ...create(db),
  execute: async (preview) => {
    try {
      return await db.transaction(async (savepoint) => {
        const receipt = await create(savepoint).execute(preview);
        if (receipt.result.status !== "ok") {
          throw new RejectedWrite(receipt);
        }
        return receipt;
      });
    } catch (error) {
      if (error instanceof RejectedWrite) {
        return error.receipt;
      }
      throw error;
    }
  },
});

type Store = ReturnType<typeof createAssistantStore>;

export type Stored = NonNullable<Awaited<ReturnType<Store["read"]>>>;

export type TurnDependencies = {
  store: Pick<Store, "getConsent" | "create" | "list" | "read" | "save" | "runLocked" | "remove">;
  catalog: (actor: Actor, workspace: string, tx?: Database) => AssistantRuntimeCatalog;
  model: AssistantModel;
};

export class AssistantTurnConflict extends Error {
  constructor() {
    super("The conversation has changed. Reopen it to see the current work.");
  }
}

export const view = ({ state, ...row }: Stored) => ({
  ...row,
  ...publicState(conversationState.parse(state)),
});

export const change = (state: ConversationState, status: Stored["status"]) => ({ state, status });

export const conversationAccess = (
  deps: TurnDependencies,
  actor: Actor,
  workspace: string,
  id: string,
) => {
  const { store } = deps;

  const catalog = (db?: Database) => deps.catalog(actor, workspace, db);

  const read = async () => {
    const row = await store.read(actor, workspace, id);
    if (!row || row.status === "unavailable") {
      return null;
    }
    const state = conversationState.parse(row.state);
    if (await catalog().permits(state.dependencies)) {
      return row;
    }
    if (await store.save(actor, workspace, id, row.revision, change(state, "unavailable"))) {
      endModelRequest(row.id);
    }
    return null;
  };

  const locked = async (
    row: Stored,
    update: (
      state: ConversationState,
      tools: AssistantRuntimeCatalog,
    ) => Promise<ReturnType<typeof change>> | ReturnType<typeof change>,
  ) => {
    const result = await store.runLocked(
      actor,
      workspace,
      id,
      row.revision,
      async (db, current) => {
        const state = conversationState.parse(current.state);
        const tools = transactionalCatalog(db, catalog);
        if (current.status === "unavailable" || !(await tools.permits(state.dependencies))) {
          return change(state, "unavailable");
        }
        return update(state, tools);
      },
    );
    return result?.status === "unavailable" ? null : result;
  };

  return { read, locked, catalog, consent: () => store.getConsent(actor, workspace) };
};

export type Access = ReturnType<typeof conversationAccess>;
