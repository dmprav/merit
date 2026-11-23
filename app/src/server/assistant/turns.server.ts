import { randomUUID } from "node:crypto";

import type { Actor } from "@merit/auth";

import {
  AssistantTurnConflict,
  change,
  conversationAccess,
  view,
  type Stored,
  type TurnDependencies,
} from "./access.server";
import { endModelRequest } from "./model-request.server";
import {
  conversationState,
  initialState,
  newAction,
  recordReceipt,
  savedEvidence,
  type ConversationState,
} from "./state";
import { runTurn } from "./worker.server";

export { AssistantTurnConflict, type AssistantRuntimeCatalog } from "./access.server";

type Address = [actor: Actor, workspace: string, id: string];

const pending = (status: Stored["status"]) =>
  status === "running" || status === "awaiting_approval";

const conflict = () => {
  throw new AssistantTurnConflict();
};

const commands = (deps: TurnDependencies, args: Address) => {
  const access = conversationAccess(deps, ...args);

  const update = async (operation: (row: Stored) => Parameters<typeof access.locked>[1]) => {
    const row = await access.read();
    if (!row) {
      return null;
    }
    const result = await access.locked(row, operation(row));
    return result ? view(result) : null;
  };

  const decide = (previewId: string, approved: boolean) =>
    update((row) => (state) => {
      const group = state.groups.find((item) => item.id === previewId);
      if (
        row.status !== "awaiting_approval" ||
        !group?.actions.some((item) => item.status === "waiting")
      ) {
        return conflict();
      }
      for (const item of group.actions) {
        if (item.status === "waiting") {
          item.status = approved ? "approved" : "declined";
          if (!approved) {
            recordReceipt(state, item.preview.name, item.preview.input, {
              result: { status: "declined" },
              dependencies: [],
              citations: [],
            });
          }
        }
      }
      const stillPending = state.groups.some((item) =>
        item.actions.some((action) => action.status === "waiting"),
      );
      return change(state, approved ? "running" : stillPending ? "awaiting_approval" : "completed");
    });

  const retry = (previewId: string, actionId: string) =>
    update((row) => async (state, tools) => {
      const group = state.groups.find((item) => item.id === previewId);
      const action = group?.actions.find((item) => item.id === actionId);
      if (pending(row.status) || !action || action.status !== "failed") {
        return conflict();
      }
      if (action.delivery) {
        action.status = "delivering";
        return change(state, "running");
      }
      if (!action.retry) {
        return conflict();
      }
      const { name, input } = action.retry;
      const fresh = await tools.preview(name, input);
      recordReceipt(state, name, input, fresh);
      if (!fresh.preview) {
        return change(state, row.status);
      }
      // Supersede this retry opportunity so an earlier action cannot be retried twice.
      delete action.retry;
      state.groups.push({ id: randomUUID(), actions: [newAction(fresh.preview)] });
      return change(state, "awaiting_approval");
    });

  return { update, decide, retry };
};

const stopActions = (state: ConversationState) => {
  state.deferred = [];
  for (const action of state.groups.flatMap((item) => item.actions)) {
    if (action.deliveryAttempt) {
      action.result = { ...action.result, delivery: "unconfirmed" };
    }
    if (["approved", "waiting", "delivering"].includes(action.status)) {
      action.status = "stopped";
    }
  }
};

const stopTurn = async (deps: TurnDependencies, args: Address) => {
  const access = conversationAccess(deps, ...args);
  // A competing worker can finish one step while Stop obtains the chat lock.
  for (;;) {
    const row = await access.read();
    if (!row || !pending(row.status)) {
      return row ? view(row) : null;
    }
    const state = conversationState.parse(row.state);
    const attempt = state.modelAttempt?.id;
    delete state.modelAttempt;
    stopActions(state);
    const stopped = await deps.store.save(...args, row.revision, change(state, "stopped"));
    if (stopped) {
      if (attempt) {
        endModelRequest(row.id, attempt);
      }
      const current = await access.read();
      return current ? view(current) : null;
    }
  }
};

export const createAssistantTurns = (deps: TurnDependencies) => {
  const open = async (...args: Address) => {
    const row = await conversationAccess(deps, ...args).read();
    return row ? view(row) : null;
  };

  return {
    create: async (actor: Actor, workspace: string) =>
      view(await deps.store.create(actor, workspace, change(initialState(), "idle"))),
    list: async (actor: Actor, workspace: string) => {
      const rows = await deps.store.list(actor, workspace);
      const result = [];
      for (const row of rows) {
        const chat = await open(actor, workspace, row.id);
        if (chat) {
          result.push(chat);
        }
      }
      return result;
    },
    open,
    evidence: async (actor: Actor, workspace: string, id: string, key: string) => {
      const row = await conversationAccess(deps, actor, workspace, id).read();
      return row ? savedEvidence(conversationState.parse(row.state), key) : null;
    },
    remove: async (...args: Address) => {
      const removed = await deps.store.remove(...args);
      if (removed) {
        endModelRequest(args[2]);
      }
      return removed;
    },
    run: (...args: Address) => runTurn(conversationAccess(deps, ...args), deps.model),
    start: (
      actor: Actor,
      workspace: string,
      id: string,
      input: { message: string; page?: string },
    ) =>
      commands(deps, [actor, workspace, id]).update((row) => (state) => {
        if (pending(row.status) || !input.message.trim()) {
          return conflict();
        }
        state.steps = 0;
        state.partialFailure = false;
        state.deferred = [];
        delete state.error;
        delete state.modelAttempt;
        state.messages.push({ role: "user", text: input.message, page: input.page });
        return change(state, "running");
      }),
    approve: (actor: Actor, workspace: string, id: string, { previewId }: { previewId: string }) =>
      commands(deps, [actor, workspace, id]).decide(previewId, true),
    decline: (actor: Actor, workspace: string, id: string, { previewId }: { previewId: string }) =>
      commands(deps, [actor, workspace, id]).decide(previewId, false),
    retry: (
      actor: Actor,
      workspace: string,
      id: string,
      { previewId, actionId }: { previewId: string; actionId: string },
    ) => commands(deps, [actor, workspace, id]).retry(previewId, actionId),
    stop: (...args: Address) => stopTurn(deps, args),
  };
};
