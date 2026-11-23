import { assert, afterEach, expect, it, vi } from "vite-plus/test";

import { createOpenAiAssistantModel } from "./openai.server";

const model = createOpenAiAssistantModel({ apiKey: "test-only", model: "merit-test" });
afterEach(() => vi.unstubAllGlobals());

it("rejects truncated provider generations and oversized response bodies", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json({ choices: [{ finish_reason: "length", message: { content: "partial" } }] }),
    )
    .mockResolvedValueOnce(new Response(" ".repeat(1_048_577)));
  vi.stubGlobal("fetch", fetch);
  await expect(model([], [])).rejects.toThrow();
  await expect(model([], [])).rejects.toThrow("exceeded its limit");
});

it("forwards the configured model and evidence history with provider storage disabled", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: null,
            tool_calls: [
              {
                type: "function",
                function: { name: "inspect", arguments: '{"input":{"id":"A"}}' },
              },
            ],
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(
    model(
      [{ role: "tool", name: "find", input: {}, result: { status: "ok" }, citations: [] }],
      [{ name: "inspect", description: "Inspect", inputSchema: { type: "object" }, write: false }],
    ),
  ).resolves.toEqual({ kind: "calls", calls: [{ name: "inspect", input: { id: "A" } }] });
  const [, request] = fetch.mock.calls[0]!;
  assert(typeof request?.body === "string");
  expect(JSON.parse(request.body)).toMatchObject({
    model: "merit-test",
    store: false,
    messages: [
      { role: "system" },
      { role: "assistant", tool_calls: [{ id: "merit_0" }] },
      { role: "tool", tool_call_id: "merit_0" },
    ],
  });
});
