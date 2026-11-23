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
  const body = fetch.mock.calls[0]?.[1]?.body;
  assert(typeof body === "string");
  expect(JSON.parse(body)).toMatchObject({
    model: "merit-test",
    store: false,
    messages: [
      { role: "system" },
      { role: "assistant", tool_calls: [{ id: "merit_0" }] },
      { role: "tool", tool_call_id: "merit_0" },
    ],
  });
});

it("pauses for clarification when a parallel reply also requests a workspace tool", async () => {
  const question = "Which round do you mean?";
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
    Response.json({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: null,
            tool_calls: [
              { type: "function", function: { name: "inspect", arguments: '{"input":{}}' } },
              {
                type: "function",
                function: {
                  name: "ask_for_clarification",
                  arguments: JSON.stringify({ question }),
                },
              },
            ],
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(model([], [])).resolves.toEqual({ kind: "clarification", text: question });
});

it("keeps the current request, citations and recent action outcomes within a bounded history", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    Response.json({
      choices: [{ finish_reason: "stop", message: { content: "A response" } }],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const history: Parameters<typeof model>[0] = Array.from({ length: 200 }, (_, i) => ({
    role: "user",
    text: `Earlier message ${i}: ${"x".repeat(4000)}`,
  }));
  history.push(
    {
      role: "tool",
      name: "invite",
      input: { recipient: "a" },
      result: { status: "succeeded", phase: "execution", delivery: "sent" },
      citations: [],
    },
    { role: "user", text: "Compare the latest applications." },
    {
      role: "tool",
      name: "inspect",
      input: {},
      result: { status: "ok", full: "z".repeat(200000) },
      citations: [
        { kind: "material", recordId: "A", label: "Submission", version: "2", key: "E7" },
      ],
    },
  );
  await model(history, []);
  const body = fetch.mock.calls[0]?.[1]?.body;
  assert(typeof body === "string");
  expect(Buffer.byteLength(body)).toBeLessThan(170_000);
  for (const value of [
    "Compare the latest applications.",
    "were omitted",
    "E7",
    "succeeded",
    "sent",
  ]) {
    expect(body).toContain(value);
  }
  expect(body).not.toContain("Earlier message 0:");
});
