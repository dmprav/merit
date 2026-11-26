import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { watchProcessSignals } from "./ui-verify.ts";

/** The listener this test added for `signal`, which the test runner's own listeners are not. */
const addedListener = (signal: NodeJS.Signals, before: readonly unknown[]) => {
  const listener = process.listeners(signal).find((candidate) => !before.includes(candidate));
  if (!listener) {
    throw new Error(`No ${signal} listener was added.`);
  }
  return listener;
};

describe("watchProcessSignals", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("tears down on %s, then exits with %i", async (signal, exitCode) => {
    const exits: unknown[] = [];
    vi.spyOn(process, "exit").mockImplementation((code) => {
      exits.push(code);
      return undefined as never;
    });
    const before = process.listeners(signal);
    const torndown: NodeJS.Signals[] = [];

    let finishTeardown = () => {};

    const stop = watchProcessSignals(async (received) => {
      torndown.push(received);
      await new Promise<void>((resolve) => {
        finishTeardown = resolve;
      });
    });
    try {
      addedListener(signal, before)(signal);
      expect(torndown).toEqual([signal]);
      await Promise.resolve();
      expect(exits).toEqual([]);

      finishTeardown();
      await vi.waitFor(() => expect(exits).toEqual([exitCode]));
    } finally {
      stop();
    }
  });

  it("keeps listening during teardown and ignores later signals, exiting with the first one's code", async () => {
    const exits: unknown[] = [];
    vi.spyOn(process, "exit").mockImplementation((code) => {
      exits.push(code);
      return undefined as never;
    });
    const before = { SIGINT: process.listeners("SIGINT"), SIGTERM: process.listeners("SIGTERM") };
    const torndown: NodeJS.Signals[] = [];

    let finishTeardown = () => {};

    const stop = watchProcessSignals(async (received) => {
      torndown.push(received);
      await new Promise<void>((resolve) => {
        finishTeardown = resolve;
      });
    });
    try {
      addedListener("SIGINT", before.SIGINT)("SIGINT");
      // A second Ctrl+C or a SIGTERM while teardown runs must still be caught, so Node does not
      // exit before teardown finishes.
      addedListener("SIGINT", before.SIGINT)("SIGINT");
      addedListener("SIGTERM", before.SIGTERM)("SIGTERM");
      expect(torndown).toEqual(["SIGINT"]);

      finishTeardown();
      await vi.waitFor(() => expect(exits).toEqual([130]));
    } finally {
      stop();
    }
  });

  it("stops listening for both signals once stopped", () => {
    const before = {
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
    };
    const stop = watchProcessSignals(async () => undefined);
    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT + 1);
    expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM + 1);

    stop();
    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT);
    expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM);
  });
});
