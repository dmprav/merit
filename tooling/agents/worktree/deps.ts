import { execFileSync } from "node:child_process";

import { type WorktreeDatabase, localPostgres } from "./database.ts";
import { defaultExecGit, type ExecGit } from "./git.ts";
import { isPortAvailable } from "./ports.ts";
import { type RegistryLockOptions } from "./registry.ts";

export type ExecCommand = (
  command: string,
  args: readonly string[],
  options: { cwd: string; quiet: boolean },
) => void | Promise<void>;

/** The processes, network probes, database, and clock that worktree operations use. */
export type WorktreeDeps = {
  execGit: ExecGit;
  execCommand: ExecCommand;
  checkPortAvailable: (port: number) => Promise<boolean>;
  database: WorktreeDatabase;
  now: () => Date;
  lockOptions?: RegistryLockOptions;
};

const defaultExecCommand: ExecCommand = (command, args, { cwd, quiet }) => {
  execFileSync(
    command,
    args,
    quiet ? { cwd, stdio: ["ignore", "pipe", "pipe"] } : { cwd, stdio: "inherit" },
  );
};

export const defaultWorktreeDeps = (primaryRepoRoot: string): WorktreeDeps => ({
  execGit: defaultExecGit,
  execCommand: defaultExecCommand,
  checkPortAvailable: isPortAvailable,
  database: localPostgres(primaryRepoRoot),
  now: () => new Date(),
});
