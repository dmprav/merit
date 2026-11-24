import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import {
  assertSafeManagedDatabaseName,
  buildLocalDatabaseUrl,
  DEFAULT_COMPOSE_DATABASE_URL,
  parseLocalComposeDatabase,
} from "./local-postgres.ts";
import { resetLocalDatabase, resolveResetTarget } from "./reset-db.ts";

const repoUrl = new URL("../../", import.meta.url);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("recreates the Compose database before migrating and seeding, ignoring remote DATABASE_URL", async () => {
  const exec = vi.fn();
  const recreate = vi.fn(async () => {});
  const env = {
    ...process.env,
    DATABASE_URL: "postgres://example:example@remote.invalid/production",
  };

  const result = await resetLocalDatabase({ cwd: repoUrl, env, exec, recreate });

  expect(result).toEqual({ mode: "compose", databaseUrl: DEFAULT_COMPOSE_DATABASE_URL });
  expect(recreate).not.toHaveBeenCalled();

  const options = {
    cwd: repoUrl,
    env: { ...env, DATABASE_URL: DEFAULT_COMPOSE_DATABASE_URL },
    stdio: "inherit",
  };

  expect(exec.mock.calls).toEqual([
    ["docker", ["compose", "--file", "compose.yaml", "down", "--volumes"], options],
    ["docker", ["compose", "--file", "compose.yaml", "up", "-d", "--wait"], options],
    ["vp", ["run", "@merit/db#db:migrate"], options],
    ["vp", ["run", "@merit/app#db:seed"], options],
  ]);
});

it("uses Compose volume reset for the default merit database and ignores protected or socket-override URLs", () => {
  expect(resolveResetTarget({ DATABASE_URL: DEFAULT_COMPOSE_DATABASE_URL })).toEqual({
    mode: "compose",
    databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
  });
  expect(resolveResetTarget({ DATABASE_URL: buildLocalDatabaseUrl("postgres") })).toEqual({
    mode: "compose",
    databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
  });
  expect(
    resolveResetTarget({
      DATABASE_URL: `${buildLocalDatabaseUrl("merit_alpha")}?host=remote.invalid`,
    }),
  ).toEqual({
    mode: "compose",
    databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
  });
  expect(resolveResetTarget({})).toEqual({
    mode: "compose",
    databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
  });
});

it.each(["127.0.0.1", "localhost"] as const)(
  "drops, recreates, migrates, and seeds only the targeted worktree database on %s:55432 without touching Compose volumes",
  async (host) => {
    const exec = vi.fn();
    const recreate = vi.fn(async () => {});
    const base = new URL(DEFAULT_COMPOSE_DATABASE_URL);
    base.hostname = host;
    const worktreeUrl = buildLocalDatabaseUrl("merit_feature_x", base.href);
    const expectedAdminUrl = buildLocalDatabaseUrl("postgres", base.href);
    const env = { ...process.env, DATABASE_URL: worktreeUrl };

    const result = await resetLocalDatabase({ cwd: repoUrl, env, exec, recreate });

    expect(result).toEqual({
      mode: "worktree",
      database: {
        databaseName: "merit_feature_x",
        url: worktreeUrl,
        adminUrl: expectedAdminUrl,
        isDefault: false,
        isProtected: false,
      },
    });
    expect(recreate).toHaveBeenCalledExactlyOnceWith("merit_feature_x", expectedAdminUrl);

    const options = {
      cwd: repoUrl,
      env: { ...env, DATABASE_URL: worktreeUrl },
      stdio: "inherit",
    };

    expect(exec.mock.calls).toEqual([
      ["vp", ["run", "@merit/db#db:migrate"], options],
      ["vp", ["run", "@merit/app#db:seed"], options],
    ]);
  },
);

it.each([1, 2, 3, 4])(
  "stops and reports failure when Compose reset step %i fails",
  async (step) => {
    const failure = new Error("Command failed");
    const exec = vi.fn(() => {
      if (exec.mock.calls.length === step) {
        throw failure;
      }
    });

    await expect(
      resetLocalDatabase({ cwd: repoUrl, env: {}, exec, recreate: vi.fn() }),
    ).rejects.toThrow(failure);
    expect(exec).toHaveBeenCalledTimes(step);
  },
);

it("stops before migrating or seeding when worktree database recreation fails", async () => {
  const failure = new Error("Postgres unavailable");
  const exec = vi.fn();
  const recreate = vi.fn(async () => {
    throw failure;
  });

  await expect(
    resetLocalDatabase({
      cwd: repoUrl,
      env: { DATABASE_URL: buildLocalDatabaseUrl("merit_alpha") },
      exec,
      recreate,
    }),
  ).rejects.toThrow(failure);
  expect(exec).not.toHaveBeenCalled();
});

it("validates local Compose database URLs and refuses protected database names", () => {
  const wrongPort = new URL(DEFAULT_COMPOSE_DATABASE_URL);
  wrongPort.port = "5432";
  wrongPort.pathname = "/merit_alpha";

  expect(
    parseLocalComposeDatabase("postgres://example:example@remote.invalid/production"),
  ).toBeNull();
  expect(parseLocalComposeDatabase("http://127.0.0.1:55432/merit_alpha")).toBeNull();
  expect(parseLocalComposeDatabase(wrongPort.href)).toBeNull();
  expect(() => assertSafeManagedDatabaseName("merit")).toThrow(/protected/);
  expect(() => assertSafeManagedDatabaseName("postgres")).toThrow(/protected/);
  expect(() => assertSafeManagedDatabaseName("BAD-NAME")).toThrow(/Invalid Postgres/);
});
