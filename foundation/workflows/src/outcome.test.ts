import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { waitForOutcome } from "./outcome.ts";

const fast = { timeoutMs: 200, intervalMs: 1 };

afterEach(() => {
  vi.useRealTimers();
});

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
    vi.useFakeTimers();
    const read = vi.fn(async () => undefined);
    const waiting = waitForOutcome(read, { timeoutMs: 30, intervalMs: 10 });

    await vi.advanceTimersByTimeAsync(30);

    expect(await waiting).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads once when the bound is zero", async () => {
    const read = vi.fn(async () => undefined);

    expect(await waitForOutcome(read, { timeoutMs: 0, intervalMs: 10 })).toBeUndefined();
    expect(read).toHaveBeenCalledOnce();
  });

  it("gives up on a read that outlasts the bound, and ignores its late failure", async () => {
    vi.useFakeTimers();
    const read = vi.fn(
      () =>
        new Promise<string | undefined>((_resolve, reject) => {
          setTimeout(() => reject(new Error("late")), 80);
        }),
    );
    const waiting = waitForOutcome(read, { timeoutMs: 20, intervalMs: 5 });

    await vi.advanceTimersByTimeAsync(20);
    expect(await waiting).toBeUndefined();
    expect(read).toHaveBeenCalledOnce();
    // The late rejection must not surface as an unhandled rejection.
    await vi.advanceTimersByTimeAsync(80);
  });

  it("gives up on a read that never settles", async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => new Promise<string | undefined>(() => {}));
    const waiting = waitForOutcome(read, { timeoutMs: 20, intervalMs: 5 });

    await vi.advanceTimersByTimeAsync(20);

    expect(await waiting).toBeUndefined();
  });

  it("holds a slow read after the first to the time left", async () => {
    vi.useFakeTimers();
    const read = vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockImplementation(() => new Promise(() => {}));
    let done = false;
    const waiting = waitForOutcome(read, { timeoutMs: 40, intervalMs: 30 }).then((value) => {
      done = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(30);
    expect(read).toHaveBeenCalledTimes(2);
    // The second read has only the 10 ms left, not a fresh bound.
    await vi.advanceTimersByTimeAsync(9);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await waiting).toBeUndefined();
  });

  it("starts no read once the bound has passed during the pause", async () => {
    vi.useFakeTimers();
    const read = vi.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined);
    const waiting = waitForOutcome(read, { timeoutMs: 40, intervalMs: 40 });

    await vi.advanceTimersByTimeAsync(40);

    expect(await waiting).toBeUndefined();
    expect(read).toHaveBeenCalledOnce();
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
