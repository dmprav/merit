import { randomUUID } from "node:crypto";

import { change, type Access, type Stored } from "./access.server";
import { deliverNext } from "./delivery.server";
import {
  applyDecision,
  executeNext,
  failNext,
  nextAction,
  prepareDeferred,
} from "./dispatch.server";
import { beginModelRequest, endModelRequest } from "./model-request.server";
import { observationTool } from "./observation.server";
import type { AssistantModel } from "./openai.server";
import { conversationState } from "./state";

const runModel = async (access: Access, row: Stored, model: AssistantModel) => {
  const id = randomUUID();
  const work: { reply?: ReturnType<AssistantModel> } = {};
  try {
    const claimed = await access.locked(row, async (state, catalog) => {
      if (state.steps >= 24) {
        state.error =
          "This turn reached its investigation limit. Ask a follow-up question to continue.";
        return change(state, "failed");
      }
      const tools = await catalog.list();
      state.steps++;
      state.modelAttempt = { id, until: Date.now() + 120_000 };
      // Authorize and dispatch under the same lock, then release it during inference.
      work.reply = model(
        state.messages,
        [...tools, observationTool],
        state.error,
        beginModelRequest(row.id, id),
      );
      void work.reply.catch(() => undefined);
      return change(state, "running");
    });
    if (!claimed || !work.reply) {
      return false;
    }
    try {
      const decision = await work.reply;
      return Boolean(
        await access.locked(claimed, (current, catalog) =>
          applyDecision(current, catalog, decision),
        ),
      );
    } catch {
      await access.locked(claimed, (current) => {
        delete current.modelAttempt;
        current.error = "The assistant could not complete this step. Ask again to continue.";
        return change(current, "failed");
      });
      return false;
    }
  } finally {
    endModelRequest(row.id, id);
  }
};

const step = async (access: Access, row: Stored, model: AssistantModel) => {
  const state = conversationState.parse(row.state);
  if (state.modelAttempt && state.modelAttempt.until > Date.now()) {
    return false;
  }
  const next = nextAction(state);
  if (!next) {
    if (state.deferred.length) {
      return Boolean(await access.locked(row, prepareDeferred));
    }
    return runModel(access, row, model);
  }
  if (next.action.status === "delivering") {
    if (next.action.deliveryAttempt && next.action.deliveryAttempt.until > Date.now()) {
      return false;
    }
    return deliverNext(access, row);
  }
  try {
    return Boolean(await access.locked(row, executeNext));
  } catch {
    // The command and outcome shared a transaction. A committed delivery has its own ticket.
    return Boolean(await access.locked(row, failNext));
  }
};

export const runTurn = async (access: Access, model: AssistantModel) => {
  for (;;) {
    const row = await access.read();
    if (!row || row.status !== "running" || !(await access.consent())) {
      return;
    }
    if (!(await step(access, row, model))) {
      return;
    }
  }
};
