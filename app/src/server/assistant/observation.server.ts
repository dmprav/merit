import { z } from "zod";

import type { AssistantReceipt } from "@merit/mcp/assistant";

import type { Message } from "./state";

const address = z.strictObject({
  observation: z.union([z.number().int().nonnegative(), z.string().regex(/^E[1-9]\d*$/)]),
  section: z.enum(["result", "evidence"]),
  cursor: z.number().int().nonnegative(),
});

export const observationTool = {
  name: "read_observation",
  description:
    "Read part of a saved tool result or its evidence keys from this conversation. Supply an observation number or a saved citation key (for example E1) to open the original observation containing that key. Start at cursor 0 and follow nextCursor, or choose an offset within totalLength. Pages contain slices of the original serialized JSON.",
  inputSchema: z.toJSONSchema(address),
  write: false,
};

export const readObservation = (
  messages: Message[],
  input: Record<string, unknown>,
): AssistantReceipt => {
  const parsed = address.safeParse(input);
  const unavailable = { result: { status: "invalid_input" }, citations: [], dependencies: [] };
  if (!parsed.success) {
    return unavailable;
  }
  const { observation: target, cursor, section } = parsed.data;
  const observation =
    typeof target === "number"
      ? target
      : messages.findIndex(
          (item) =>
            item.role === "tool" &&
            item.name !== observationTool.name &&
            item.citations.some(({ key }) => key === target),
        );
  const source = messages[observation];
  if (source?.role !== "tool" || source.name === observationTool.name) {
    return unavailable;
  }
  const json = JSON.stringify(section === "result" ? source.result : source.citations);
  if (cursor >= json.length) {
    return unavailable;
  }
  // Even escaped and embedded in a JSON tool message, this fits the per-result wire budget.
  const text = json.slice(cursor, cursor + 4096);
  const end = cursor + text.length;
  return {
    result: {
      status: "ok",
      observation,
      section,
      cursor,
      text,
      nextCursor: end < json.length ? end : null,
      totalLength: json.length,
    },
    citations:
      typeof target === "string"
        ? source.citations.filter(({ key }) => key === target)
        : source.citations.slice(0, 1),
    dependencies: [],
  };
};
