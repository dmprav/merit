import { beforeEach, expect, it, vi } from "vite-plus/test";

import { reported } from "./reported";

const telemetry = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@merit/telemetry/errors", () => ({ reportError: telemetry.reportError }));

beforeEach(() => {
  telemetry.reportError.mockReset();
});

it("returns what the activity returns without reporting", async () => {
  const activity = reported("assistant.advance", async (id: string) => `ran ${id}`);

  expect(await activity("1")).toBe("ran 1");
  expect(telemetry.reportError).not.toHaveBeenCalled();
});

it("reports a failure by operation name only and rethrows it for the retry policy", async () => {
  const failure = new Error("jo@example.test could not be reached");
  const activity = reported("reconcile.reviewerMessages", async () => {
    throw failure;
  });

  await expect(activity()).rejects.toBe(failure);

  expect(telemetry.reportError).toHaveBeenCalledExactlyOnceWith(
    new Error("Background work could not complete."),
    { surface: "server", operation: "reconcile.reviewerMessages" },
  );
});
