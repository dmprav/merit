import { describe, expect, it, vi } from "vite-plus/test";

import { acquireWithCleanup, createCleanupStack, type RegisterCleanup } from "./cleanup.ts";

describe("acquireWithCleanup", () => {
  it("releases a resource acquired while cleanup was already draining and stops startup", async () => {
    const cleanups: Array<() => Promise<void>> = [];

    const registerCleanup: RegisterCleanup = (cleanup) => {
      cleanups.push(cleanup);
      return cleanup;
    };

    const released: string[] = [];

    let finishAcquisition: (value: string) => void = () => undefined;

    const acquisition = new Promise<string>((resolveAcquisition) => {
      finishAcquisition = resolveAcquisition;
    });

    const startup = acquireWithCleanup(
      acquisition,
      async (resource) => {
        released.push(resource);
      },
      registerCleanup,
    );
    // A signal drains the cleanup stack before the database exists.
    const draining = Promise.all(cleanups.map((cleanup) => cleanup()));
    finishAcquisition("test_db");

    await expect(startup).rejects.toThrow(/Cleanup started/);
    await draining;
    expect(released).toEqual(["test_db"]);
  });

  it("returns an acquired resource whose release runs once through the cleanup stack", async () => {
    const { registerCleanup, runCleanups } = createCleanupStack();
    const released: string[] = [];

    const { resource, release } = await acquireWithCleanup(
      Promise.resolve("test_db"),
      async (value) => {
        released.push(value);
      },
      registerCleanup,
    );
    expect(resource).toBe("test_db");
    await release();
    await runCleanups();
    expect(released).toEqual(["test_db"]);
  });
});

describe("createCleanupStack", () => {
  it("releases resources in reverse registration order", async () => {
    const { registerCleanup, runCleanups } = createCleanupStack();
    const events: string[] = [];
    registerCleanup(async () => {
      events.push("output lock");
    });
    registerCleanup(async () => {
      events.push("server");
    });

    await runCleanups();
    expect(events).toEqual(["server", "output lock"]);
  });

  it("waits for a release registered while the drain runs before the drain settles", async () => {
    const { registerCleanup, runCleanups } = createCleanupStack();
    const events: string[] = [];

    let finishLateStop = () => {};

    registerCleanup(async () => {
      events.push("first release");
      // A server whose spawn was already under way registers its stop during the drain.
      registerCleanup(async () => {
        events.push("late stop started");
        await new Promise<void>((resolve) => {
          finishLateStop = resolve;
        });
        events.push("late stop finished");
      });
    });

    const drained = runCleanups().then(() => events.push("drained"));
    await vi.waitFor(() => expect(events).toContain("late stop started"));
    await Promise.resolve();
    expect(events).not.toContain("drained");
    finishLateStop();
    await drained;
    expect(events).toEqual(["first release", "late stop started", "late stop finished", "drained"]);
  });

  it("still runs the releases after a failed one", async () => {
    const { registerCleanup, runCleanups } = createCleanupStack();
    const events: string[] = [];
    registerCleanup(async () => {
      events.push("output lock");
    });
    registerCleanup(async () => {
      throw new Error("database is still in use");
    });

    await runCleanups();
    expect(events).toEqual(["output lock"]);
  });

  it("runs each release once, however often it is called", async () => {
    const { registerCleanup, runCleanups } = createCleanupStack();
    let stops = 0;
    const stop = registerCleanup(async () => {
      stops += 1;
    });

    await stop();
    await Promise.all([runCleanups(), runCleanups(), stop()]);
    expect(stops).toBe(1);
  });
});
