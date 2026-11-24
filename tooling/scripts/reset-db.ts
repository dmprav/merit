import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { statSync } from "node:fs";
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

export const isLinkedGitWorktree = (repoRoot: URL | string): boolean => {
  const rootPath = repoRoot instanceof URL ? fileURLToPath(repoRoot) : repoRoot;
  try {
    return statSync(resolve(rootPath, ".git")).isFile();
  } catch {
    return false;
  }
};

export const resolveResetTarget = (
  env: NodeJS.ProcessEnv,
  { isLinkedWorktree = false }: { isLinkedWorktree?: boolean } = {},
): ResetTarget => {
  const local = parseLocalComposeDatabase(env.DATABASE_URL);
  if (local && !local.isProtected) {
    return { mode: "worktree", database: local };
  }
  if (isLinkedWorktree) {
    const reason = env.DATABASE_URL?.trim()
      ? "DATABASE_URL does not target a non-protected local Compose worktree database on 127.0.0.1:55432 or localhost:55432"
      : "DATABASE_URL is not set";
    throw new Error(
      `Refusing to run Compose volume reset from a linked worktree (${reason}). Restore this worktree's .env.local or unset overriding DATABASE_URL variables so sibling worktree databases are not deleted.`,
    );
  }
  return { mode: "compose", databaseUrl: DEFAULT_COMPOSE_DATABASE_URL };
};

export const resetLocalDatabase = async ({
  cwd = new URL("../../", import.meta.url),
  env = process.env,
  isLinkedWorktree = isLinkedGitWorktree(cwd),
  exec = (command: string, args: readonly string[], options: ExecFileSyncOptions) => {
    execFileSync(command, args, options);
  },
  recreate = recreateLocalDatabase,
}: {
  cwd?: URL | string;
  env?: NodeJS.ProcessEnv;
  isLinkedWorktree?: boolean;
  exec?: (command: string, args: readonly string[], options: ExecFileSyncOptions) => void;
  recreate?: (databaseName: string, adminUrl: string) => Promise<void>;
} = {}): Promise<ResetTarget> => {
  const target = resolveResetTarget(env, { isLinkedWorktree });

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
