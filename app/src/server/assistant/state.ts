import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  assistantCitationSchema,
  assistantDependencySchema,
  assistantPreviewSchema,
  type AssistantReceipt,
} from "@merit/mcp/assistant";

const fields = z.record(z.string(), z.unknown());
const source = assistantCitationSchema.extend({ key: z.string() });
const message = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), text: z.string(), page: z.string().optional() }),
  z.object({ role: z.literal("assistant"), text: z.string(), citations: z.array(source) }),
  z.object({
    role: z.literal("tool"),
    callId: z.string().optional(),
    name: z.string(),
    input: fields,
    result: fields,
    citations: z.array(source),
  }),
]);
const deliveryTicket = z.object({
  assignmentId: z.string(),
  kind: z.enum(["invitation", "submission"]),
  messageId: z.string(),
});

export type DeliveryTicket = z.infer<typeof deliveryTicket>;

const action = z.object({
  id: z.string(),
  preview: assistantPreviewSchema,
  status: z.enum([
    "waiting",
    "approved",
    "delivering",
    "succeeded",
    "failed",
    "stale",
    "declined",
    "stopped",
  ]),
  result: fields.optional(),
  retry: assistantPreviewSchema.optional(),
  delivery: deliveryTicket.optional(),
  deliveryAttempt: z.object({ id: z.string(), until: z.number() }).optional(),
});
const group = z.object({ id: z.string(), actions: z.array(action) });
export const conversationState = z.object({
  messages: z.array(message),
  sources: z.array(source),
  dependencies: z.array(assistantDependencySchema),
  groups: z.array(group),
  deferred: z
    .array(
      z.object({ id: z.string(), name: z.string(), input: fields, after: z.array(z.string()) }),
    )
    .default([]),
  partialFailure: z.boolean().default(false),
  steps: z.number().int().nonnegative(),
  error: z.string().optional(),
  modelAttempt: z.object({ id: z.string(), until: z.number() }).optional(),
});

export type ConversationState = z.infer<typeof conversationState>;

export type Message = z.infer<typeof message>;

export type Action = z.infer<typeof action>;

export const initialState = (): ConversationState => ({
  messages: [],
  sources: [],
  dependencies: [],
  groups: [],
  deferred: [],
  partialFailure: false,
  steps: 0,
});

export const newAction = (preview: Action["preview"], id: string = randomUUID()): Action => ({
  id,
  preview,
  status: "waiting",
});

export const recordReceipt = (
  state: ConversationState,
  name: string,
  input: Record<string, unknown>,
  receipt: AssistantReceipt,
  callId?: string,
) => {
  for (const requirement of receipt.dependencies) {
    if (
      !state.dependencies.some(
        (existing) => JSON.stringify(existing) === JSON.stringify(requirement),
      )
    ) {
      state.dependencies.push(requirement);
    }
  }
  const citations = receipt.citations.map((citation) => {
    const known = state.sources.find(
      (item) =>
        item.kind === citation.kind &&
        item.recordId === citation.recordId &&
        item.version === citation.version,
    );
    if (known) {
      return known;
    }
    const item = { ...citation, key: `E${state.sources.length + 1}` };
    state.sources.push(item);
    return item;
  });
  state.messages.push({ role: "tool", callId, name, input, result: receipt.result, citations });
};

export const recordAnswer = (state: ConversationState, text: string, clarification = false) => {
  const keys = new Set(Array.from(text.matchAll(/\[(E\d+)\]/g), (match) => match[1]));
  const citations = state.sources.filter((item) => keys.has(item.key));
  const since = state.messages.findLastIndex((entry) => entry.role === "user");
  const hasEvidence = state.messages
    .slice(since)
    .some((entry) => entry.role === "tool" && entry.citations.length > 0);
  if (keys.size !== citations.length || (!clarification && hasEvidence && !keys.size)) {
    return false;
  }
  state.messages.push({ role: "assistant", text, citations });
  return true;
};

export const savedEvidence = (state: ConversationState, key: string) => {
  const citation = state.sources.find((source) => source.key === key);
  if (!citation) {
    return null;
  }
  const observations = state.messages.flatMap((item) =>
    item.role === "tool" && item.citations.some((source) => source.key === key)
      ? [{ name: item.name, input: item.input, result: item.result }]
      : [],
  );
  return { citation, observations };
};

export const publicState = (state: ConversationState) => ({
  messages: state.messages.filter((entry) => entry.role !== "tool"),
  groups: state.groups.map((item) => ({
    id: item.id,
    actions: item.actions.map(({ retry, delivery, deliveryAttempt: _attempt, ...action }) => ({
      ...action,
      canRetry: action.status === "failed" && Boolean(retry || delivery),
    })),
  })),
  progress: state.messages
    .filter((entry) => entry.role === "tool")
    .map(({ name, result, citations }) => ({ name, status: result.status, citations })),
  error: state.error,
});
