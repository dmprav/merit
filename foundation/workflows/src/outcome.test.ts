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

  it("gives up on a read that outlasts the bound, and ignores its late failure", async () => {
    const read = vi.fn(
      () =>
        new Promise<string | undefined>((_resolve, reject) => {
          setTimeout(() => reject(new Error("late")), 80);
        }),
    );
    const started = Date.now();

    expect(await waitForOutcome(read, { timeoutMs: 20, intervalMs: 5 })).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(70);
    expect(read).toHaveBeenCalledOnce();
    // The late rejection must not surface as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 120));
  });

  it("gives up on a read that never settles", async () => {
    const read = vi.fn(() => new Promise<string | undefined>(() => {}));

    expect(await waitForOutcome(read, { timeoutMs: 20, intervalMs: 5 })).toBeUndefined();
  });

  it("holds a slow read after the first to the time left", async () => {
    const read = vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockImplementation(() => new Promise(() => {}));
    const started = Date.now();

    expect(await waitForOutcome(read, { timeoutMs: 40, intervalMs: 5 })).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(500);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("returns what a read finds before the bound", async () => {
    const read = vi.fn(
      () => new Promise<string | undefined>((resolve) => setTimeout(() => resolve("sent"), 10)),
    );

    expect(await waitForOutcome(read, { timeoutMs: 500, intervalMs: 5 })).toBe("sent");
  });

  it("does not hide a failing read", async () => {
    await expect(
      waitForOutcome(async () => {
        throw new Error("database down");
      }, fast),
    ).rejects.toThrow("database down");
  });
});
