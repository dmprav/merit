import { randomUUID } from "node:crypto";

import type { AssistantCatalog } from "@merit/mcp/assistant";

import { change, type AssistantRuntimeCatalog } from "./access.server";
import { observationTool, readObservation } from "./observation.server";
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
  if (actions.some((item) => item.status === "waiting")) {
    return "awaiting_approval";
  }
  return "running";
};

type PendingCall = ConversationState["deferred"][number];

type Tool = Awaited<ReturnType<AssistantCatalog["list"]>>[number];

const prepareCall = async (
  state: ConversationState,
  catalog: AssistantRuntimeCatalog,
  tools: Tool[],
  call: PendingCall,
  actions: Action[],
) => {
  if (call.name === observationTool.name) {
    recordReceipt(
      state,
      call.name,
      call.input,
      readObservation(state.messages, call.input),
      call.id,
    );
    return;
  }
  const tool = tools.find((item) => item.name === call.name);
  if (!tool) {
    recordReceipt(
      state,
      call.name,
      call.input,
      { result: { status: "unavailable_tool" }, dependencies: [], citations: [] },
      call.id,
    );
    return;
  }
  if (!tool.write) {
    const receipt = await catalog.read(call.name, call.input);
    recordReceipt(state, call.name, call.input, receipt, call.id);
    return;
  }
  const proposal = await catalog.preview(call.name, call.input);
  if (proposal.preview) {
    actions.push(newAction(proposal.preview, call.id));
  }
  recordReceipt(
    state,
    call.name,
    call.input,
    {
      ...proposal,
      result: { ...proposal.result, phase: "preview", approvalRequired: Boolean(proposal.preview) },
    },
    call.id,
  );
};

const prerequisite = (state: ConversationState, pendingActions: Action[], id: string) => {
  if (pendingActions.some((action) => action.id === id)) {
    return "pending";
  }
  const action = state.groups.flatMap((group) => group.actions).find((item) => item.id === id);
  if (action?.status === "succeeded") {
    return "succeeded";
  }
  if (action && ["waiting", "approved", "delivering"].includes(action.status)) {
    return "pending";
  }
  if (action) {
    return "failed";
  }
  if (state.deferred.some((item) => item.id === id)) {
    return "pending";
  }
  const observation = state.messages.findLast((item) => item.role === "tool" && item.callId === id);
  return observation?.role === "tool" && observation.result.status === "ok"
    ? "succeeded"
    : "failed";
};

export const prepareDeferred = async (
  state: ConversationState,
  catalog: AssistantRuntimeCatalog,
) => {
  const tools = await catalog.list();
  const actions: Action[] = [];
  for (const call of state.deferred) {
    const outcomes = call.after.map((id) => prerequisite(state, actions, id));
    if (outcomes.includes("failed")) {
      state.partialFailure = true;
      recordReceipt(
        state,
        call.name,
        call.input,
        {
          result: { status: "blocked", prerequisites: call.after },
          dependencies: [],
          citations: [],
        },
        call.id,
      );
    } else if (outcomes.includes("pending")) {
      continue;
    } else {
      await prepareCall(state, catalog, tools, call, actions);
    }
    state.deferred = state.deferred.filter((item) => item.id !== call.id);
  }
  if (actions.length) {
    state.groups.push({ id: randomUUID(), actions });
  }
  return change(state, progress(state));
};

const prepareBatch = async (
  state: ConversationState,
  catalog: AssistantRuntimeCatalog,
  calls: Extract<AssistantDecision, { kind: "calls" }>["calls"],
) => {
  if (state.partialFailure && calls.some((call) => call.name !== observationTool.name)) {
    state.error = "Summarize the saved outcomes. Only read_observation is available.";
    return change(state, "running");
  }
  const tools = state.partialFailure ? [] : await catalog.list();
  const ids = calls.map(() => randomUUID());
  const actions: Action[] = [];
  for (const [index, call] of calls.entries()) {
    const id = ids[index];
    if (!id) {
      throw new Error("Assistant call has no identity.");
    }
    const after = (call.dependsOn ?? []).map((parent) =>
      parent < index && parent >= 0 ? ids[parent] : undefined,
    );
    if (after.some((parent) => parent === undefined)) {
      recordReceipt(
        state,
        call.name,
        call.input,
        { result: { status: "invalid_dependency" }, citations: [], dependencies: [] },
        id,
      );
      continue;
    }
    const pending = {
      id,
      name: call.name,
      input: call.input,
      after: after.filter((parent) => parent !== undefined),
    };
    if (pending.after.length) {
      state.deferred.push(pending);
      recordReceipt(
        state,
        call.name,
        call.input,
        {
          result: { status: "deferred", prerequisites: pending.after },
          citations: [],
          dependencies: [],
        },
        id,
      );
    } else {
      await prepareCall(state, catalog, tools, pending, actions);
    }
  }
  if (actions.length) {
    state.groups.push({ id: randomUUID(), actions });
  }
  return change(state, progress(state));
};

export const applyDecision = async (
  state: ConversationState,
  catalog: AssistantRuntimeCatalog,
  decision: AssistantDecision,
) => {
  delete state.modelAttempt;
  delete state.error;
  if (decision.kind !== "calls") {
    if (recordAnswer(state, decision.text, decision.kind === "clarification")) {
      return change(state, "completed");
    }
    state.error =
      "Cite the supplied evidence key for the version you observed. To cite a historical version, reopen its key with read_observation.";
    return change(state, "running");
  }
  return prepareBatch(state, catalog, decision.calls);
};

export const disposition = (
  state: ConversationState,
  group: ConversationState["groups"][number],
) => {
  if (group.actions.some((item) => item.status === "failed" || item.status === "stale")) {
    state.partialFailure = true;
  }
  return change(state, progress(state));
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

export type Receipt = Awaited<ReturnType<AssistantRuntimeCatalog["execute"]>>;

/** Record what executing an approved action returned, and what that means for the rest of its group. */
export const applyReceipt = async (
  state: ConversationState,
  catalog: AssistantRuntimeCatalog,
  group: ConversationState["groups"][number],
  action: Action,
  receipt: Receipt,
) => {
  const { name, input } = action.preview;
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
      const replacement = newAction(fresh.preview);
      state.groups.push({ id: randomUUID(), actions: [replacement] });
      for (const pending of state.deferred) {
        pending.after = pending.after.map((id) => (id === action.id ? replacement.id : id));
      }
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

export const executeNext = async (state: ConversationState, catalog: AssistantRuntimeCatalog) => {
  const next = nextAction(state);
  if (!next || next.action.status !== "approved") {
    throw new Error("No approved assistant action.");
  }
  const receipt = await catalog.execute(next.action.preview);
  return applyReceipt(state, catalog, next.group, next.action, receipt);
};

export const failNext = (state: ConversationState) => {
  const next = nextAction(state);
  if (!next) {
    return change(state, "failed");
  }
  const { action, group } = next;
  delete action.executing;
  action.status = "failed";
  action.result = { status: "failed" };
  recordReceipt(state, action.preview.name, action.preview.input, {
    result: { status: "failed", phase: "execution" },
    dependencies: [],
    citations: [],
  });
  if (!action.delivery) {
    action.retry = action.preview;
  }
  return disposition(state, group);
};
