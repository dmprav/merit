import { randomUUID } from "node:crypto";

import { change, type Access, type Stored } from "./access.server";
import { deliverNext, settleStopped, unsettledDelivery } from "./delivery.server";
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

const runModel = async (
  access: Access,
  row: Stored,
  model: AssistantModel,
  cancellation?: AbortSignal,
) => {
  const id = randomUUID();
  const work: { reply?: ReturnType<AssistantModel> } = {};
  try {
    const claimed = await access.locked(row, async (state, catalog) => {
      if (state.steps >= 24) {
        state.error =
          "This turn reached its investigation limit. Ask a follow-up question to continue.";
        return change(state, "failed");
      }
      const tools = state.partialFailure ? [] : await catalog.list();
      state.steps++;
      state.modelAttempt = { id, until: Date.now() + 120_000 };
      const request = beginModelRequest(row.id, id);
      // Authorize and dispatch under the same lock, then release it during inference.
      work.reply = model(
        state.messages,
        [...tools, observationTool],
        state.error ??
          (state.partialFailure
            ? "Summarize the saved outcomes and independent results."
            : undefined),
        // Ends with this process's own supersession or the worker activity's cancellation.
        cancellation ? AbortSignal.any([request, cancellation]) : request,
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

const step = async (
  access: Access,
  row: Stored,
  model: AssistantModel,
  cancellation?: AbortSignal,
) => {
  const state = conversationState.parse(row.state);
  if (state.modelAttempt && state.modelAttempt.until > Date.now()) {
    return false;
  }
  const next = nextAction(state);
  if (!next) {
    if (state.deferred.length) {
      return Boolean(await access.locked(row, prepareDeferred));
    }
    return runModel(access, row, model, cancellation);
  }
  if (next.action.status === "delivering") {
    return deliverNext(access, row);
  }
  try {
    return Boolean(await access.locked(row, executeNext));
  } catch {
    // The command and outcome shared a transaction. A committed delivery has its own ticket.
    return Boolean(await access.locked(row, failNext));
  }
};

/**
 * What one step did. `finished` means there is nothing to drive: the conversation is gone,
 * unavailable or no longer running, or consent was withdrawn; a stopped conversation finishes
 * once its started deliveries have settled.
 */
export type TurnStep = "progressed" | "waiting" | "finished";

/** Run at most one step of a running conversation. */
export const advanceTurn = async (
  access: Access,
  model: AssistantModel,
  cancellation?: AbortSignal,
): Promise<TurnStep> => {
  const row = await access.read();
  if (!row || !(await access.consent())) {
    return "finished";
  }
  if (row.status === "stopped") {
    // Stop ends all work except recording how an email already sent settles. No model call, no
    // new action: the step only asks where the message stands.
    return unsettledDelivery(conversationState.parse(row.state))
      ? (await settleStopped(access, row))
        ? "progressed"
        : "waiting"
      : "finished";
  }
  if (row.status !== "running") {
    return "finished";
  }
  return (await step(access, row, model, cancellation)) ? "progressed" : "waiting";
};

export const runTurn = async (access: Access, model: AssistantModel) => {
  let outcome: TurnStep;
  do {
    outcome = await advanceTurn(access, model);
  } while (outcome === "progressed");
};
