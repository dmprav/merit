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
    name: z.string(),
    input: fields,
    result: fields,
    citations: z.array(source),
  }),
]);
export const deliveryTicket = z.object({
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
  steps: 0,
});

export const newAction = (preview: Action["preview"]): Action => ({
  id: randomUUID(),
  preview,
  status: "waiting",
});

export const recordReceipt = (
  state: ConversationState,
  name: string,
  input: Record<string, unknown>,
  receipt: AssistantReceipt,
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
  state.messages.push({ role: "tool", name, input, result: receipt.result, citations });
};

export const recordAnswer = (state: ConversationState, text: string) => {
  const keys = new Set(Array.from(text.matchAll(/\[(E\d+)\]/g), (match) => match[1]));
  const citations = state.sources.filter((item) => keys.has(item.key));
  const since = state.messages.findLastIndex((entry) => entry.role === "user");
  const hasEvidence = state.messages
    .slice(since)
    .some((entry) => entry.role === "tool" && entry.citations.length > 0);
  if (keys.size !== citations.length || (hasEvidence && !keys.size)) {
    return false;
  }
  state.messages.push({ role: "assistant", text, citations });
  return true;
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
