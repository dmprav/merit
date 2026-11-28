import { assert, afterEach, expect, it, vi } from "vite-plus/test";

import { aiReviewInstructions, aiReviewOutputJsonSchema } from "@merit/reviews/domain";

import { createOpenAiReviewer } from "./ai-reviewer.server";

afterEach(() => vi.unstubAllGlobals());

const request = {
  instructions: aiReviewInstructions,
  outputSchema: aiReviewOutputJsonSchema,
  input: {
    application: {
      title: "Meals",
      applicant: "Kitchen",
      requested: "100.00 EUR",
      projectPeriod: null,
      submittedOn: null,
      answers: [],
    },
    criteria: [],
  },
};

const completion = (content: string, finish = "stop") =>
  Response.json({ choices: [{ finish_reason: finish, message: { content } }] });

it("is unavailable without both a key and a model", () => {
  expect(createOpenAiReviewer({ apiKey: "", model: "merit-test" })).toBeUndefined();
  expect(createOpenAiReviewer({ apiKey: "test-only", model: "" })).toBeUndefined();
  expect(createOpenAiReviewer({ apiKey: "test-only", model: "merit-test" })).toMatchObject({
    provider: "OpenAI",
    model: "merit-test",
  });
});

it("sends one strict structured-output request with storage disabled and returns the parsed reply", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(completion(JSON.stringify({ position: "Defer" })));
  vi.stubGlobal("fetch", fetch);
  const reviewer = createOpenAiReviewer({ apiKey: "test-only", model: "merit-test" });
  assert(reviewer);

  await expect(reviewer.review(request)).resolves.toEqual({ position: "Defer" });

  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] ?? [];
  expect(url).toBe("https://api.openai.com/v1/chat/completions");
  expect(init).toMatchObject({ method: "POST", redirect: "error" });
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  const body = init?.body;
  assert(typeof body === "string");
  expect(JSON.parse(body)).toEqual({
    model: "merit-test",
    store: false,
    max_completion_tokens: 16384,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ai_review",
        strict: true,
        schema: structuredClone(aiReviewOutputJsonSchema),
      },
    },
    messages: [
      { role: "system", content: aiReviewInstructions },
      { role: "user", content: JSON.stringify(request.input) },
    ],
  });
});

it("fails on a provider error, a truncated reply, a refusal, invalid JSON and an oversized body", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response("down", { status: 503 }))
    .mockResolvedValueOnce(completion("{}", "length"))
    .mockResolvedValueOnce(
      Response.json({
        choices: [{ finish_reason: "stop", message: { content: null, refusal: "No." } }],
      }),
    )
    .mockResolvedValueOnce(completion("not json"))
    .mockResolvedValueOnce(new Response(" ".repeat(1_048_577)));
  vi.stubGlobal("fetch", fetch);
  const reviewer = createOpenAiReviewer({ apiKey: "test-only", model: "merit-test" });
  assert(reviewer);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(reviewer.review(request)).rejects.toThrow();
  }
  expect(fetch).toHaveBeenCalledTimes(5);
});

it("abandons the provider request when the run is stopped", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const reviewer = createOpenAiReviewer({ apiKey: "test-only", model: "merit-test" });
  assert(reviewer);
  const stop = new AbortController();

  const running = reviewer.review({ ...request, signal: stop.signal });
  stop.abort();

  await expect(running).rejects.toThrow("aborted");
});
