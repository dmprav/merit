import { execFileSync } from "node:child_process";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("recreates the Compose database before migrating and seeding, ignoring DATABASE_URL", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://example:example@remote.invalid/production");

  await import("./reset-db");

  const options = {
    cwd: new URL("../../", import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: "postgres://merit:merit@127.0.0.1:55432/merit",
    },
    stdio: "inherit",
  };

  expect(vi.mocked(execFileSync).mock.calls).toEqual([
    ["docker", ["compose", "--file", "compose.yaml", "down", "--volumes"], options],
    ["docker", ["compose", "--file", "compose.yaml", "up", "-d", "--wait"], options],
    ["vp", ["run", "@merit/db#db:migrate"], options],
    ["vp", ["run", "@merit/app#db:seed"], options],
  ]);
});

it.each([1, 2, 3, 4])("stops and reports failure when reset step %i fails", async (step) => {
  const failure = new Error("Command failed");
  vi.mocked(execFileSync).mockImplementation(() => {
    if (vi.mocked(execFileSync).mock.calls.length === step) {
      throw failure;
    }
    return Buffer.alloc(0);
  });

  await expect(import("./reset-db")).rejects.toThrow(failure);
  expect(execFileSync).toHaveBeenCalledTimes(step);
});
