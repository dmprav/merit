import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type * as NodeModule from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { REPO_ROOT } from "../paths.ts";
import {
  assertSafeManagedDatabaseName,
  buildLocalDatabaseUrl,
  DEFAULT_COMPOSE_DATABASE_URL,
  loadPgClient,
  parseLocalComposeDatabase,
} from "./local-postgres.ts";
import { isLinkedGitWorktree, resetLocalDatabase, resolveResetTarget } from "./reset-db.ts";

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
    cwd: REPO_ROOT,
    env,
    isLinkedWorktree: false,
    exec,
    recreate,
  });

  expect(result).toEqual({ mode: "compose", databaseUrl: DEFAULT_COMPOSE_DATABASE_URL });
  expect(recreate).not.toHaveBeenCalled();

  const options = {
    cwd: REPO_ROOT,
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

it("uses Compose volume reset for the default merit database and protected names, but rejects local query-override URLs", () => {
  expect(resolveResetTarget({ DATABASE_URL: DEFAULT_COMPOSE_DATABASE_URL })).toEqual({
    mode: "compose",
    databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
  });
  expect(resolveResetTarget({ DATABASE_URL: buildLocalDatabaseUrl("postgres") })).toEqual({
    mode: "compose",
    databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
  });
  // A local URL whose query parameters redirect the connection must never fall through to the
  // Compose volume reset, even in the primary checkout.
  for (const query of ["host=remote.invalid", "port=5432", "PORT=5432", "hostaddr=10.0.0.1"]) {
    for (const databaseName of ["merit_alpha", "merit"]) {
      expect(
        () =>
          resolveResetTarget({ DATABASE_URL: `${buildLocalDatabaseUrl(databaseName)}?${query}` }),
        `${databaseName}?${query}`,
      ).toThrow(/overrides its connection with host, hostaddr, port, or user query parameters/);
    }
  }
  const otherLocalPort = new URL(buildLocalDatabaseUrl("merit_alpha"));
  otherLocalPort.port = "5432";
  otherLocalPort.searchParams.set("port", "55432");
  expect(() => resolveResetTarget({ DATABASE_URL: otherLocalPort.href })).toThrow(
    /overrides its connection/,
  );
  expect(resolveResetTarget({})).toEqual({
    mode: "compose",
    databaseUrl: DEFAULT_COMPOSE_DATABASE_URL,
  });
});

it.each(["127.0.0.1", "localhost"] as const)(
  "drops, recreates, migrates, and seeds only the targeted worktree database on %s:55432 without touching Compose volumes",
  async (host) => {
    const effects: string[] = [];
    const exec = vi.fn((command: string, args: readonly string[]) => {
      effects.push([command, ...args].join(" "));
    });
    const recreate = vi.fn(async (databaseName: string) => {
      await Promise.resolve();
      effects.push(`recreated ${databaseName}`);
    });
    const base = new URL(DEFAULT_COMPOSE_DATABASE_URL);
    base.hostname = host;
    const worktreeUrl = buildLocalDatabaseUrl("merit_feature_x", base.href);
    const expectedAdminUrl = buildLocalDatabaseUrl("postgres", base.href);
    const env = { ...process.env, DATABASE_URL: worktreeUrl };

    const result = await resetLocalDatabase({
      cwd: REPO_ROOT,
      env,
      isLinkedWorktree: false,
      exec,
      recreate,
    });

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
    // Migration needs the recreated database, so recreation must finish before it starts.
    expect(effects).toEqual([
      "recreated merit_feature_x",
      "vp run @merit/db#db:migrate",
      "vp run @merit/app#db:seed",
    ]);

    const options = {
      cwd: REPO_ROOT,
      env: { ...env, DATABASE_URL: worktreeUrl },
      stdio: "inherit",
    };

    expect(exec.mock.calls).toEqual([
      ["vp", ["run", "@merit/db#db:migrate"], options],
      ["vp", ["run", "@merit/app#db:seed"], options],
    ]);
  },
);

it("treats any letter case of localhost as the same loopback host when selecting the reset path", () => {
  const upperHostUrl = "postgres://merit:merit@LOCALHOST:55432/merit_alpha";
  expect(resolveResetTarget({ DATABASE_URL: upperHostUrl })).toEqual({
    mode: "worktree",
    database: {
      databaseName: "merit_alpha",
      url: buildLocalDatabaseUrl("merit_alpha", "postgres://merit:merit@localhost:55432/merit"),
      adminUrl: buildLocalDatabaseUrl("postgres", "postgres://merit:merit@localhost:55432/merit"),
      isDefault: false,
      isProtected: false,
    },
  });
  expect(() => resolveResetTarget({ DATABASE_URL: `${upperHostUrl}?port=5432` })).toThrow(
    /overrides its connection/,
  );
  expect(() =>
    resolveResetTarget({ DATABASE_URL: "postgres://merit:merit@LocalHost:55432/merit?host=x" }),
  ).toThrow(/overrides its connection/);
});

it("refuses a local Compose URL whose database name pg would read differently instead of resetting volumes", async () => {
  // `pg` keeps the second slash, so this URL names the database "/merit_alpha", not "merit_alpha".
  const doubleSlashUrl = buildLocalDatabaseUrl("merit_alpha").replace(
    "/merit_alpha",
    "//merit_alpha",
  );
  expect(parseLocalComposeDatabase(doubleSlashUrl)).toBeNull();

  const exec = vi.fn();
  const recreate = vi.fn(async () => {});
  for (const databaseUrl of [
    doubleSlashUrl,
    buildLocalDatabaseUrl("merit_alpha").replace("merit_alpha", "Merit_Alpha"),
  ]) {
    for (const isLinkedWorktree of [false, true]) {
      await expect(
        resetLocalDatabase({
          cwd: REPO_ROOT,
          env: { DATABASE_URL: databaseUrl },
          isLinkedWorktree,
          worktreeDatabaseUrl: databaseUrl,
          exec,
          recreate,
        }),
        `${databaseUrl} linked=${isLinkedWorktree}`,
      ).rejects.toThrow(/database name is not a lowercase identifier/);
    }
  }
  expect(exec).not.toHaveBeenCalled();
  expect(recreate).not.toHaveBeenCalled();
});

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
    { DATABASE_URL: DEFAULT_COMPOSE_DATABASE_URL },
    {},
  ]) {
    await expect(resetLocalDatabase({ cwd: linkedDir, env, exec, recreate })).rejects.toThrow(
      /Refusing to run Compose volume reset from a linked worktree/,
    );
  }
  await expect(
    resetLocalDatabase({
      cwd: linkedDir,
      env: { DATABASE_URL: `${buildLocalDatabaseUrl("merit_alpha")}?port=5432` },
      exec,
      recreate,
    }),
  ).rejects.toThrow(/overrides its connection/);
  expect(exec).not.toHaveBeenCalled();
  expect(recreate).not.toHaveBeenCalled();
});

it("refuses a linked-worktree reset when an exported DATABASE_URL overrides the worktree's .env.local database", async () => {
  const exec = vi.fn();
  const recreate = vi.fn(async () => {});
  const worktreeDatabaseUrl = buildLocalDatabaseUrl("merit_alpha");

  await expect(
    resetLocalDatabase({
      cwd: REPO_ROOT,
      env: { DATABASE_URL: buildLocalDatabaseUrl("merit_beta") },
      isLinkedWorktree: true,
      worktreeDatabaseUrl,
      exec,
      recreate,
    }),
  ).rejects.toThrow(/exported DATABASE_URL overrides the database in this worktree's \.env\.local/);
  expect(recreate).not.toHaveBeenCalled();
  expect(exec).not.toHaveBeenCalled();

  const result = await resetLocalDatabase({
    cwd: REPO_ROOT,
    env: { DATABASE_URL: worktreeDatabaseUrl },
    isLinkedWorktree: true,
    worktreeDatabaseUrl,
    exec,
    recreate,
  });
  expect(result).toMatchObject({ mode: "worktree", database: { databaseName: "merit_alpha" } });
  expect(recreate).toHaveBeenCalledOnce();
});

it("refuses a linked-worktree reset when the worktree's .env.local supplies no DATABASE_URL", async () => {
  const exec = vi.fn();
  const recreate = vi.fn(async () => {});

  for (const worktreeDatabaseUrl of [undefined, "", "  "]) {
    await expect(
      resetLocalDatabase({
        cwd: REPO_ROOT,
        env: { DATABASE_URL: buildLocalDatabaseUrl("merit_beta") },
        isLinkedWorktree: true,
        worktreeDatabaseUrl,
        exec,
        recreate,
      }),
    ).rejects.toThrow(/this worktree's \.env\.local does not set DATABASE_URL/);
  }
  expect(recreate).not.toHaveBeenCalled();
  expect(exec).not.toHaveBeenCalled();
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
        cwd: REPO_ROOT,
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
      cwd: REPO_ROOT,
      env: { DATABASE_URL: buildLocalDatabaseUrl("merit_alpha") },
      isLinkedWorktree: false,
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

  if (isLinkedGitWorktree(REPO_ROOT)) {
    expect(result.status).not.toBe(0);
    // Either no worktree database is configured, or the exported URL overrides `.env.local`.
    expect(result.stderr).toMatch(
      /Refusing to (run Compose volume reset|reset) from a linked worktree/,
    );
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

/** Creates a checkout whose foundation/db resolves `pg` to the given CommonJS module source. */
const makeRepoWithPg = (prefix: string, pgSource: string) => {
  const repoRoot = makeTempDir(prefix);
  const pgDir = join(repoRoot, "foundation/db/node_modules/pg");
  mkdirSync(pgDir, { recursive: true });
  writeFileSync(join(repoRoot, "foundation/db/package.json"), JSON.stringify({ name: "db" }));
  writeFileSync(join(pgDir, "package.json"), JSON.stringify({ name: "pg", main: "index.js" }));
  writeFileSync(join(pgDir, "index.js"), pgSource);
  return repoRoot;
};

it("loads pg from the repository's foundation/db and falls back to this checkout's", () => {
  const repoRoot = makeRepoWithPg(
    "merit-pg-repo-",
    "module.exports = { Client: class RepoClient {} };\n",
  );
  const withoutDb = makeTempDir("merit-pg-no-db-");

  expect(loadPgClient(repoRoot).name).toBe("RepoClient");
  expect(loadPgClient(withoutDb)).toBe(loadPgClient());
  expect(loadPgClient().name).toBe("Client");
});

it("throws instead of returning a Client loaded for another repository when pg cannot load", async () => {
  // Make this checkout's own pg unavailable, so only the repository candidates can load it.
  vi.resetModules();
  vi.doMock("node:module", async (importOriginal) => {
    const { createRequire } = await importOriginal<typeof NodeModule>();
    // local-postgres.ts uses only createRequire; it receives this checkout's candidate as a URL.
    return {
      createRequire: (candidate: string | URL) =>
        candidate instanceof URL
          ? () => {
              throw new Error("default pg is unavailable");
            }
          : createRequire(candidate),
    };
  });
  try {
    const { loadPgClient: loadIsolatedPgClient } = await import("./local-postgres.ts");
    const loaded = makeRepoWithPg(
      "merit-pg-loaded-",
      "module.exports = { Client: class LoadedClient {} };\n",
    );
    const broken = makeRepoWithPg("merit-pg-broken-", 'throw new Error("broken pg");\n');

    expect(loadIsolatedPgClient(loaded).name).toBe("LoadedClient");
    expect(() => loadIsolatedPgClient(broken)).toThrow("default pg is unavailable");
  } finally {
    vi.doUnmock("node:module");
    vi.resetModules();
  }
});
