import { setTimeout as delay } from "node:timers/promises";

import { assert, expect, it, vi } from "vite-plus/test";

import { watchAssistant } from "./watch.server";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));

const watch = (open: Parameters<typeof watchAssistant>[0]) =>
  watchAssistant(open, new AbortController().signal);

const running = { revision: 1, status: "running" };
const settled = { revision: 3, status: "awaiting_approval" };

const event = (snapshot: typeof running) =>
  `event: conversation\ndata: ${JSON.stringify(snapshot)}\n\n`;

it("publishes an already settled conversation once and closes the stream", async () => {
  const open = vi.fn(async () => settled);
  const response = await watch(open);
  expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  expect(await response.text()).toBe(event(settled));
  expect(open).toHaveBeenCalledTimes(1);
});

it("publishes each changed revision once until the conversation settles", async () => {
  const next = { ...running, revision: 2 };
  const open = vi
    .fn()
    .mockResolvedValueOnce(running)
    .mockResolvedValueOnce(running)
    .mockResolvedValueOnce(next)
    .mockResolvedValue(settled);
  expect(await (await watch(open)).text()).toBe(event(running) + event(next) + event(settled));
  expect(open).toHaveBeenCalledTimes(4);
});

it("returns not found when the conversation is initially unavailable", async () => {
  const response = await watch(async () => null);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ status: "not_found" });
});

it.each(["access lost", "read failed"])(
  "closes the stream with unavailable after %s",
  async (reason) => {
    const open = vi.fn().mockResolvedValueOnce(running);
    if (reason === "access lost") {
      open.mockResolvedValue(null);
    } else {
      open.mockRejectedValue(new Error("Cannot read chat"));
    }
    expect(await (await watch(open)).text()).toBe(
      event(running) + "event: unavailable\ndata: {}\n\n",
    );
    expect(open).toHaveBeenCalledTimes(2);
  },
);

it("cancels a reader's pending poll without opening the conversation again", async () => {
  const timers = await vi.importActual<{ setTimeout: typeof delay }>("node:timers/promises");
  const polling = new Promise<AbortSignal>((resolve) => {
    vi.mocked(delay).mockImplementationOnce((milliseconds, value, options) => {
      assert.isDefined(options?.signal);
      resolve(options.signal);
      return timers.setTimeout(milliseconds, value, options);
    });
  });
  const open = vi.fn().mockResolvedValueOnce(running).mockResolvedValue(settled);
  const response = await watch(open);
  const reader = response.body?.getReader();
  assert.isDefined(reader);
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(event(running));
  const signal = await polling;
  await reader.cancel();
  expect(signal.aborted).toBe(true);
  expect(await reader.read()).toEqual({ done: true, value: undefined });
  expect(open).toHaveBeenCalledTimes(1);
});
