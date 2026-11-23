import { observationTool } from "./observation.server";
import type { Message } from "./state";

type WireMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: null;
      tool_calls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

const wire = (item: Message, index: number): WireMessage[] => {
  if (item.role === "user") {
    return [
      {
        role: "user",
        content: item.page
          ? JSON.stringify({ request: item.text, attachedPage: item.page })
          : item.text,
      },
    ];
  }
  if (item.role === "assistant") {
    return [{ role: "assistant", content: item.text }];
  }
  const id = `merit_${index}`;
  return [
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id,
          type: "function",
          function: { name: item.name, arguments: JSON.stringify({ input: item.input }) },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: id,
      content: JSON.stringify({
        result: item.result,
        evidence:
          item.name === observationTool.name
            ? item.citations.map(({ key }) => key)
            : item.citations,
      }),
    },
  ];
};

const compact = (item: Extract<Message, { role: "tool" }>, observation: number) => ({
  ...item,
  input: Buffer.byteLength(JSON.stringify(item.input)) <= 2048 ? item.input : { omitted: true },
  result: {
    status: item.result.status,
    phase: item.result.phase,
    delivery: item.result.delivery,
    detailsOmitted: true,
    observation,
    evidenceKeys: item.citations.slice(0, 16).map(({ key }) => key),
  },
  citations: [],
});

export const providerHistory = (messages: Message[]): WireMessage[] => {
  const selected = new Map<number, WireMessage[]>();
  let remaining = 160 * 1024;
  let shortened = false;

  const add = (index: number) => {
    const item = messages[index];
    if (!item || selected.has(index)) {
      return;
    }
    let entries = wire(item, index);
    let size = Buffer.byteLength(JSON.stringify(entries));
    if (item.role === "tool" && size > Math.min(remaining, 32 * 1024)) {
      entries = wire(compact(item, index), index);
      size = Buffer.byteLength(JSON.stringify(entries));
      shortened = true;
    }
    if (size <= remaining) {
      selected.set(index, entries);
      remaining -= size;
    }
  };

  add(messages.findLastIndex((item) => item.role === "user"));
  add(messages.length - 1);
  // Retain recent committed outcomes even when a large evidence read follows them.
  let outcomes = 0;
  for (let index = messages.length - 1; index >= 0 && outcomes < 8; index--) {
    const item = messages[index];
    if (
      item?.role === "tool" &&
      (item.result.phase === "execution" || item.result.delivery !== undefined)
    ) {
      add(index);
      outcomes++;
    }
  }
  for (let index = messages.length - 1; index >= Math.max(0, messages.length - 128); index--) {
    add(index);
  }
  const result = [...selected.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, entries]) => entries);
  if (shortened || selected.size !== messages.length) {
    result.unshift({
      role: "system",
      content:
        "Some earlier history or large tool outputs were omitted from this request. Use read_observation with the supplied observation number to read omitted details or evidence keys. Saved evidence keys identify the original versions.",
    });
  }
  return result;
};
