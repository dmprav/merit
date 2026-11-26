import { afterEach, expect, it, vi } from "vite-plus/test";

import { withHeartbeat } from "./heartbeat.ts";

const sdk = vi.hoisted(() => ({ current: vi.fn() }));

vi.mock("@temporalio/activity", () => ({ Context: { current: sdk.current } }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("heartbeats while the work runs and stops when it ends", async () => {
  vi.useFakeTimers();
  const heartbeat = vi.fn();
  sdk.current.mockReturnValue({ heartbeat });

  let finish!: (value: string) => void;
  const running = withHeartbeat(() => new Promise<string>((resolve) => (finish = resolve)), 1000);
  await vi.advanceTimersByTimeAsync(2500);
  expect(heartbeat).toHaveBeenCalledTimes(2);

  finish("done");
  await expect(running).resolves.toBe("done");
  await vi.advanceTimersByTimeAsync(5000);
  expect(heartbeat).toHaveBeenCalledTimes(2);
});

it("stops heartbeating when the work fails", async () => {
  vi.useFakeTimers();
  const heartbeat = vi.fn();
  sdk.current.mockReturnValue({ heartbeat });

  await expect(
    withHeartbeat(async () => {
      throw new Error("failed");
    }, 1000),
  ).rejects.toThrow("failed");
  await vi.advanceTimersByTimeAsync(5000);
  expect(heartbeat).not.toHaveBeenCalled();
});

it("only runs the work outside an activity", async () => {
  sdk.current.mockImplementation(() => {
    throw new Error("not in an activity");
  });

  await expect(withHeartbeat(async () => "ok")).resolves.toBe("ok");
});

it("gives the work the activity's cancellation signal", async () => {
  const cancellationSignal = new AbortController().signal;
  sdk.current.mockReturnValue({ heartbeat: vi.fn(), cancellationSignal });

  await expect(withHeartbeat(async (signal) => signal)).resolves.toBe(cancellationSignal);
});
