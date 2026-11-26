import { describe, expect, it, vi } from "vite-plus/test";

import { waitForOutcome } from "./outcome.ts";

const fast = { timeoutMs: 200, intervalMs: 1 };

describe("waiting for a first outcome", () => {
  it("returns an outcome that is already there without waiting", async () => {
    const read = vi.fn(async () => "sent");

    expect(await waitForOutcome(read, { timeoutMs: 60_000, intervalMs: 60_000 })).toBe("sent");
    expect(read).toHaveBeenCalledOnce();
  });

  it("polls until the outcome appears", async () => {
    const read = vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue("failed");

    expect(await waitForOutcome(read, fast)).toBe("failed");
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("gives up when the bound passes, so the caller can report pending", async () => {
    const read = vi.fn(async () => undefined);
    const started = Date.now();

    expect(await waitForOutcome(read, { timeoutMs: 30, intervalMs: 10 })).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(read.mock.calls.length).toBeGreaterThan(1);
  });

  it("reads once when the bound is zero", async () => {
    const read = vi.fn(async () => undefined);

    expect(await waitForOutcome(read, { timeoutMs: 0, intervalMs: 10 })).toBeUndefined();
    expect(read).toHaveBeenCalledOnce();
  });

  it("does not hide a failing read", async () => {
    await expect(
      waitForOutcome(async () => {
        throw new Error("database down");
      }, fast),
    ).rejects.toThrow("database down");
  });
});
