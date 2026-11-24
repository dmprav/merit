import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRepoEnvLocal } from "../env.ts";
import {
  DEFAULT_COMPOSE_DATABASE_URL,
  parseLocalComposeDatabase,
  recreateLocalDatabase,
  type LocalComposeDatabase,
} from "./local-postgres.ts";

export type ResetTarget =
  | { mode: "compose"; databaseUrl: string }
  | { mode: "worktree"; database: LocalComposeDatabase };

export const resolveResetTarget = (env: NodeJS.ProcessEnv): ResetTarget => {
  const local = parseLocalComposeDatabase(env.DATABASE_URL);
  if (local && !local.isProtected) {
    return { mode: "worktree", database: local };
  }
  return { mode: "compose", databaseUrl: DEFAULT_COMPOSE_DATABASE_URL };
};

export const resetLocalDatabase = async ({
  cwd = new URL("../../", import.meta.url),
  env = process.env,
  exec = (command: string, args: readonly string[], options: ExecFileSyncOptions) => {
    execFileSync(command, args, options);
  },
  recreate = recreateLocalDatabase,
}: {
  cwd?: URL | string;
  env?: NodeJS.ProcessEnv;
  exec?: (command: string, args: readonly string[], options: ExecFileSyncOptions) => void;
  recreate?: (databaseName: string, adminUrl: string) => Promise<void>;
} = {}): Promise<ResetTarget> => {
  const target = resolveResetTarget(env);

  if (target.mode === "worktree") {
    const { database } = target;
    const childEnv = { ...env, DATABASE_URL: database.url };
    console.log(
      `Resetting local worktree database "${database.databaseName}" without stopping shared Compose services...`,
    );
    await recreate(database.databaseName, database.adminUrl);
    for (const [command, ...args] of [
      ["vp", "run", "@merit/db#db:migrate"],
      ["vp", "run", "@merit/app#db:seed"],
    ] as const) {
      exec(command, args, { cwd, env: childEnv, stdio: "inherit" });
    }
    console.log(`Local worktree database "${database.databaseName}" reset and seeded.`);
    return target;
  }

  const childEnv = { ...env, DATABASE_URL: target.databaseUrl };
  console.log("Deleting local Compose data and recreating the example workspaces...");
  for (const [command, ...args] of [
    ["docker", "compose", "--file", "compose.yaml", "down", "--volumes"],
    ["docker", "compose", "--file", "compose.yaml", "up", "-d", "--wait"],
    ["vp", "run", "@merit/db#db:migrate"],
    ["vp", "run", "@merit/app#db:seed"],
  ] as const) {
    exec(command, args, { cwd, env: childEnv, stdio: "inherit" });
  }
  console.log("Local database reset and seeded.");
  return target;
};

const runCli = async () => {
  const repoRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  loadRepoEnvLocal(repoRoot);
  await resetLocalDatabase({ cwd: new URL("../../", import.meta.url), env: process.env });
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  await runCli();
}
