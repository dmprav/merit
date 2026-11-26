import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { z } from "zod";

import { errorMessage } from "../../cli.ts";
import { type FileLockOptions, getErrnoCode, withFileLock } from "../file-lock.ts";
import { managedWorktreesRoot } from "./paths.ts";
import { worktreePortsSchema } from "./ports.ts";

const worktreeRecordSchema = z.object({
  slug: z.string().min(1),
  path: z.string().min(1),
  gitDir: z.string().optional(),
  checkoutToken: z.string().optional(),
  branch: z.string().min(1),
  baseRef: z.string().min(1),
  databaseName: z.string().min(1),
  databaseUrl: z.string().min(1),
  databaseCreated: z.boolean(),
  ports: worktreePortsSchema,
  createdAt: z.string().min(10),
  status: z.enum(["creating", "active", "cleaning"]).optional(),
  cleanToken: z.string().optional(),
  ownerPid: z.number().int().positive().optional(),
  partialRemoval: z.boolean().optional(),
});

export type WorktreeRecord = z.infer<typeof worktreeRecordSchema>;

const worktreeRegistrySchema = z.object({
  version: z.literal(1),
  worktrees: z.record(z.string(), worktreeRecordSchema),
});

export type WorktreeRegistry = z.infer<typeof worktreeRegistrySchema>;

export type RegistryLockOptions = Pick<
  FileLockOptions,
  "timeoutMs" | "staleMs" | "initialDelayMs" | "maxDelayMs"
>;

export const registryPathForRepo = (primaryRepoRoot: string): string =>
  join(managedWorktreesRoot(primaryRepoRoot), ".registry.json");

export const registryLockPathForRepo = (primaryRepoRoot: string): string =>
  join(managedWorktreesRoot(primaryRepoRoot), ".registry.lock");

export const withWorktreeRegistryLock = async <T>(
  primaryRepoRoot: string,
  operation: () => Promise<T> | T,
  options: RegistryLockOptions = {},
): Promise<T> =>
  withFileLock(registryLockPathForRepo(primaryRepoRoot), operation, {
    ...options,
    label: "worktree registry",
  });

export const readWorktreeRegistry = (primaryRepoRoot: string): WorktreeRegistry => {
  const path = registryPathForRepo(primaryRepoRoot);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (getErrnoCode(error) === "ENOENT") {
      return { version: 1, worktrees: {} };
    }
    const detail = errorMessage(error);
    throw new Error(`Failed to read worktree registry at "${path}": ${detail}`, { cause: error });
  }

  try {
    const raw = JSON.parse(text) as unknown;
    return worktreeRegistrySchema.parse(raw);
  } catch (error) {
    const detail = errorMessage(error);
    throw new Error(
      `Corrupt or invalid worktree registry at "${path}": ${detail}. Repair or remove it after verifying active worktrees.`,
      { cause: error },
    );
  }
};

export const writeWorktreeRegistry = (
  primaryRepoRoot: string,
  registry: WorktreeRegistry,
): void => {
  const path = registryPathForRepo(primaryRepoRoot);
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
};

export type RecordUpdate = {
  /** Whether the record as currently stored is still the one this operation owns. */
  when: (record: WorktreeRecord) => boolean;
  /** The replacement record, or `undefined` to remove it. */
  apply: (record: WorktreeRecord) => WorktreeRecord | undefined;
};

/**
 * Under the registry lock, re-reads `slug`'s record and replaces or removes it only while `when`
 * still holds, so a record another operation has since claimed is never overwritten. Returns
 * whether the record was changed.
 */
export const updateRecord = (
  primaryRepoRoot: string,
  slug: string,
  { when, apply }: RecordUpdate,
  lockOptions?: RegistryLockOptions,
): Promise<boolean> =>
  withWorktreeRegistryLock(
    primaryRepoRoot,
    () => {
      const registry = readWorktreeRegistry(primaryRepoRoot);
      const current = registry.worktrees[slug];
      if (!current || !when(current)) {
        return false;
      }
      const next = apply(current);
      if (next) {
        registry.worktrees[slug] = next;
      } else {
        delete registry.worktrees[slug];
      }
      writeWorktreeRegistry(primaryRepoRoot, registry);
      return true;
    },
    lockOptions,
  );
