import { randomUUID } from "node:crypto";

import type { AssistantReceipt } from "@merit/mcp/assistant";

import { change, type AssistantRuntimeCatalog } from "./access.server";
import type { AssistantDecision } from "./openai.server";
import {
  newAction,
  recordAnswer,
  recordReceipt,
  type Action,
  type ConversationState,
} from "./state";

const progress = (state: ConversationState) => {
  const actions = state.groups.flatMap((group) => group.actions);
  if (actions.some((item) => item.status === "approved" || item.status === "delivering")) {
    return "running";
  }
  return actions.some((item) => item.status === "waiting") ? "awaiting_approval" : "running";
};

export const applyDecision = async (
  state: ConversationState,
  catalog: AssistantRuntimeCatalog,
  decision: AssistantDecision,
) => {
  delete state.modelAttempt;
  delete state.error;
  if (decision.kind === "answer") {
    if (recordAnswer(state, decision.text)) {
      return change(state, "completed");
    }
    state.error = "Use the supplied evidence keys to cite the records that support the answer.";
    return change(state, "running");
  }
  const tools = await catalog.list();
  const actions: Action[] = [];
  for (const call of decision.calls) {
    const tool = tools.find((item) => item.name === call.name);
    let receipt: AssistantReceipt;
    if (call.dependsOn?.length) {
      receipt = {
        result: {
          status: "deferred",
          reason: "Wait for the prerequisite outcome, then request this action again.",
        },
        citations: [],
        dependencies: [],
      };
    } else if (!tool) {
      receipt = { result: { status: "unavailable_tool" }, dependencies: [], citations: [] };
    } else if (tool.write) {
      const proposal = await catalog.preview(call.name, call.input);
      if (proposal.preview) {
        actions.push(newAction(proposal.preview));
      }
      receipt = {
        ...proposal,
        result: {
          ...proposal.result,
          phase: "preview",
          ...(proposal.preview ? { approvalRequired: true } : {}),
        },
      };
    } else {
      receipt = await catalog.read(call.name, call.input);
    }
    recordReceipt(state, call.name, call.input, receipt);
  }
  if (actions.length) {
    state.groups.push({ id: randomUUID(), actions });
  }
  return change(state, progress(state));
};

export const disposition = (
  state: ConversationState,
  group: ConversationState["groups"][number],
) => {
  const status = progress(state);
  if (
    status === "awaiting_approval" ||
    group.actions.some((item) => item.status === "approved" || item.status === "delivering")
  ) {
    return change(state, status);
  }
  if (group.actions.some((item) => item.status === "failed" || item.status === "stale")) {
    // A new request or explicit retry starts work again after a partial outcome.
    return change(state, "completed");
  }
  return change(state, "running");
};

export const nextAction = (state: ConversationState) => {
  for (const group of state.groups) {
    const action = group.actions.find(
      (item) => item.status === "approved" || item.status === "delivering",
    );
    if (action) {
      return { group, action };
    }
  }
  return null;
};

export const executeNext = async (state: ConversationState, catalog: AssistantRuntimeCatalog) => {
  const next = nextAction(state);
  if (!next || next.action.status !== "approved") {
    throw new Error("No approved assistant action.");
  }
  const { group, action } = next;
  const { name, input } = action.preview;
  const receipt = await catalog.execute(action.preview);
  recordReceipt(state, name, input, {
    ...receipt,
    result: { ...receipt.result, phase: "execution" },
  });
  action.result = receipt.result;
  if (receipt.result.status === "stale" || receipt.result.status === "conflict") {
    action.status = "stale";
    const fresh = await catalog.preview(name, receipt.retry?.input ?? input);
    recordReceipt(state, name, input, fresh);
    if (fresh.preview) {
      state.groups.push({ id: randomUUID(), actions: [newAction(fresh.preview)] });
    }
  } else if (receipt.delivery) {
    action.delivery = receipt.delivery;
    action.status = "delivering";
  } else if (receipt.result.status === "ok") {
    action.status = "succeeded";
  } else {
    action.status = "failed";
    action.retry = receipt.retry ?? action.preview;
  }
  return disposition(state, group);
};

export const failNext = (state: ConversationState) => {
  const next = nextAction(state);
  if (!next) {
    return change(state, "failed");
  }
  const { action, group } = next;
  action.status = "failed";
  action.result = { status: "failed" };
  if (!action.delivery) {
    action.retry = action.preview;
  }
  return disposition(state, group);
};
