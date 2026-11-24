import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import {
  assertSafeManagedDatabaseName,
  buildLocalDatabaseUrl,
  DEFAULT_COMPOSE_DATABASE_URL,
  parseLocalComposeDatabase,
} from "./local-postgres.ts";
import { isLinkedGitWorktree, resetLocalDatabase, resolveResetTarget } from "./reset-db.ts";

const repoUrl = new URL("../../", import.meta.url);
const tempDirs: string[] = [];

const makeTempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("recreates the Compose database before migrating and seeding, ignoring remote DATABASE_URL", async () => {
  const exec = vi.fn();
  const recreate = vi.fn(async () => {});
  const env = {
    ...process.env,
    DATABASE_URL: "postgres://example:example@remote.invalid/production",
  };

  const result = await resetLocalDatabase({
    cwd: repoUrl,
    env,
    isLinkedWorktree: false,
    exec,
    recreate,
  });

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

it("uses Compose volume reset for the default merit database and ignores protected or query-override URLs", () => {
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
  expect(
    resolveResetTarget({
      DATABASE_URL: `${buildLocalDatabaseUrl("merit_alpha")}?port=5432`,
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

it("detects linked git worktrees and refuses Compose volume reset when DATABASE_URL is invalid", async () => {
  const primaryDir = makeTempDir("merit-primary-");
  mkdirSync(join(primaryDir, ".git"));
  expect(isLinkedGitWorktree(primaryDir)).toBe(false);

  const linkedDir = makeTempDir("merit-linked-");
  writeFileSync(join(linkedDir, ".git"), "gitdir: /tmp/repo/.git/worktrees/feat\n", "utf8");
  expect(isLinkedGitWorktree(linkedDir)).toBe(true);

  const exec = vi.fn();
  const recreate = vi.fn(async () => {});

  for (const env of [
    { DATABASE_URL: "postgres://example:example@remote.invalid/production" },
    { DATABASE_URL: `${buildLocalDatabaseUrl("merit_alpha")}?port=5432` },
    { DATABASE_URL: DEFAULT_COMPOSE_DATABASE_URL },
    {},
  ]) {
    await expect(resetLocalDatabase({ cwd: linkedDir, env, exec, recreate })).rejects.toThrow(
      /Refusing to run Compose volume reset from a linked worktree/,
    );
  }
  expect(exec).not.toHaveBeenCalled();
  expect(recreate).not.toHaveBeenCalled();
});

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
      resetLocalDatabase({
        cwd: repoUrl,
        env: {},
        isLinkedWorktree: false,
        exec,
        recreate: vi.fn(),
      }),
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

it("validates local Compose database URLs, rejects connection query overrides, and refuses protected database names", () => {
  const wrongPort = new URL(DEFAULT_COMPOSE_DATABASE_URL);
  wrongPort.port = "5432";
  wrongPort.pathname = "/merit_alpha";

  expect(
    parseLocalComposeDatabase("postgres://example:example@remote.invalid/production"),
  ).toBeNull();
  expect(parseLocalComposeDatabase("http://127.0.0.1:55432/merit_alpha")).toBeNull();
  expect(parseLocalComposeDatabase(wrongPort.href)).toBeNull();
  expect(parseLocalComposeDatabase(`${buildLocalDatabaseUrl("merit_alpha")}?port=5432`)).toBeNull();
  expect(parseLocalComposeDatabase(`${buildLocalDatabaseUrl("merit_alpha")}?PORT=5432`)).toBeNull();
  expect(
    parseLocalComposeDatabase(`${buildLocalDatabaseUrl("merit_alpha")}?host=remote.invalid`),
  ).toBeNull();
  expect(
    parseLocalComposeDatabase(`${buildLocalDatabaseUrl("merit_alpha")}?hostaddr=10.0.0.1`),
  ).toBeNull();
  expect(
    parseLocalComposeDatabase(`${buildLocalDatabaseUrl("merit_alpha")}?user=other`),
  ).toBeNull();
  expect(() => assertSafeManagedDatabaseName("merit")).toThrow(/protected/);
  expect(() => assertSafeManagedDatabaseName("postgres")).toThrow(/protected/);
  expect(() => assertSafeManagedDatabaseName("BAD-NAME")).toThrow(/Invalid Postgres/);
});

it("executes runCli when invoked directly as a child process with stubbed executables", () => {
  const binDir = makeTempDir("merit-reset-cli-bin-");
  const logFile = join(binDir, "calls.log");
  const stubScript = [
    "#!/usr/bin/env sh",
    `printf '%s|%s|%s\\n' "$(basename "$0")" "$*" "$DATABASE_URL" >> "${logFile}"`,
    "",
  ].join("\n");

  for (const binary of ["docker", "vp"]) {
    const stubPath = join(binDir, binary);
    writeFileSync(stubPath, stubScript, "utf8");
    chmodSync(stubPath, 0o755);
  }

  const scriptPath = fileURLToPath(new URL("./reset-db.ts", import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
      DATABASE_URL: "postgres://example:example@remote.invalid/production",
    },
  });

  if (isLinkedGitWorktree(repoUrl)) {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Refusing to run Compose volume reset from a linked worktree/);
    return;
  }

  expect(result.status, result.stderr).toBe(0);
  const calls = readFileSync(logFile, "utf8").trim().split("\n");
  expect(calls).toEqual([
    `docker|compose --file compose.yaml down --volumes|${DEFAULT_COMPOSE_DATABASE_URL}`,
    `docker|compose --file compose.yaml up -d --wait|${DEFAULT_COMPOSE_DATABASE_URL}`,
    `vp|run @merit/db#db:migrate|${DEFAULT_COMPOSE_DATABASE_URL}`,
    `vp|run @merit/app#db:seed|${DEFAULT_COMPOSE_DATABASE_URL}`,
  ]);
});
