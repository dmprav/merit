import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { z } from "zod";

import {
  assertSafeManagedDatabaseName,
  buildLocalDatabaseUrl,
  DEFAULT_COMPOSE_DATABASE_URL,
  dropLocalDatabase,
  ensureLocalDatabase,
  isLocalPostgresReachable,
  loadPgClient,
} from "../scripts/local-postgres.ts";

export const WORKTREE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_WORKTREE_SLUG_LENGTH = 48;

export const DEFAULT_PORTS = {
  MERIT_DEV_PORT: 3000,
  MERIT_APP_PORT: 3001,
  MERIT_WORKSPACE_PORT: 3002,
  MERIT_STORYBOOK_DEV_PORT: 6006,
  MERIT_STORYBOOK_PORT: 6007,
} as const;

export const WORKTREE_PORT_BASES = {
  MERIT_DEV_PORT: 3100,
  MERIT_APP_PORT: 3101,
  MERIT_WORKSPACE_PORT: 3102,
  MERIT_STORYBOOK_DEV_PORT: 6106,
  MERIT_STORYBOOK_PORT: 6107,
} as const;

export const WORKTREE_PORT_STRIDE = 10;
const PROTECTED_BRANCH_NAMES = new Set(["main", "master"]);
const MAX_PORT_SLOTS = 200;
// Written into the checkout's `.git/worktrees/<id>/` directory. Git deletes that directory with the
// checkout, so a later checkout that reuses the same path and id never carries this token.
const CHECKOUT_TOKEN_FILE = "merit-checkout-token";

export const worktreePortsSchema = z.object({
  MERIT_DEV_PORT: z.number().int().min(1024).max(65535),
  MERIT_APP_PORT: z.number().int().min(1024).max(65535),
  MERIT_WORKSPACE_PORT: z.number().int().min(1024).max(65535),
  MERIT_STORYBOOK_DEV_PORT: z.number().int().min(1024).max(65535),
  MERIT_STORYBOOK_PORT: z.number().int().min(1024).max(65535),
});

export type WorktreePorts = z.infer<typeof worktreePortsSchema>;

export type WorktreePortKey = keyof WorktreePorts;

const WORKTREE_PORT_KEYS: readonly WorktreePortKey[] = [
  "MERIT_DEV_PORT",
  "MERIT_APP_PORT",
  "MERIT_WORKSPACE_PORT",
  "MERIT_STORYBOOK_DEV_PORT",
  "MERIT_STORYBOOK_PORT",
];

export const worktreeRecordSchema = z.object({
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

export const worktreeRegistrySchema = z.object({
  version: z.literal(1),
  worktrees: z.record(z.string(), worktreeRecordSchema),
});

export type WorktreeRegistry = z.infer<typeof worktreeRegistrySchema>;

export type WorktreeCreateResult = {
  slug: string;
  path: string;
  branch: string;
  baseRef: string;
  databaseName: string;
  databaseUrl: string;
  databaseCreated: boolean;
  ports: WorktreePorts;
};

export type WorktreeListEntry = {
  slug: string;
  path: string;
  branch: string;
  databaseName: string;
  databaseUrl: string;
  ports: WorktreePorts;
};

export type WorktreeCleanResult = {
  slug: string;
  path: string;
  branch: string;
  worktreeRemoved: boolean;
  databaseName: string;
  databaseDropped: boolean;
  branchDeleted: boolean;
  registryRemoved: boolean;
};

export type CreateCliOptions = {
  slug: string;
  base?: string;
  branch?: string;
  dir?: string;
  dbMode: "auto" | "required" | "skip";
  doctor: boolean;
  json: boolean;
};

export type ListCliOptions = {
  json: boolean;
};

export type CleanCliOptions = {
  slug: string;
  keepBranch: boolean;
  json: boolean;
};

export type GitWorktreeEntry = {
  path: string;
  head?: string;
  branch?: string;
  locked?: boolean;
  prunable?: boolean;
};

export type RegistryLockOptions = {
  timeoutMs?: number;
  staleMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
};

export type WorktreeDeps = {
  execGit?: (cwd: string, args: readonly string[]) => string;
  execCommand?: (
    command: string,
    args: readonly string[],
    options: { cwd: string; quiet: boolean },
  ) => void | Promise<void>;
  checkPortAvailable?: (port: number) => Promise<boolean>;
  isPostgresReachable?: () => Promise<boolean>;
  ensureDatabase?: (databaseName: string) => Promise<{ created: boolean }>;
  dropDatabase?: (databaseName: string) => Promise<void>;
  now?: () => Date;
  lockOptions?: RegistryLockOptions;
};

export const validateWorktreeSlug = (slug: string): string => {
  if (!slug || slug.length > MAX_WORKTREE_SLUG_LENGTH || !WORKTREE_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid worktree slug "${slug}". Use lowercase alphanumeric characters and single hyphens (1-${MAX_WORKTREE_SLUG_LENGTH} chars, e.g. "feat-auth").`,
    );
  }
  return slug;
};

export const databaseNameForSlug = (slug: string): string => {
  validateWorktreeSlug(slug);
  const name = `merit_${slug.replaceAll("-", "_")}`;
  assertSafeManagedDatabaseName(name);
  return name;
};

const stripLeadingSeparator = (args: readonly string[]): string[] =>
  args[0] === "--" ? args.slice(1) : [...args];

export const parseCreateArgs = (rawArgs: readonly string[]): CreateCliOptions => {
  const args = stripLeadingSeparator(rawArgs);
  let slug: string | undefined;
  let base: string | undefined;
  let branch: string | undefined;
  let dir: string | undefined;
  let withDb = false;
  let noDb = false;
  let doctor = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--base") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--base requires a git ref value.");
      }
      base = value;
      index += 1;
      continue;
    }
    if (arg === "--branch") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--branch requires a branch name.");
      }
      branch = value;
      index += 1;
      continue;
    }
    if (arg === "--dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--dir requires a directory path.");
      }
      dir = value;
      index += 1;
      continue;
    }
    if (arg === "--with-db") {
      withDb = true;
      continue;
    }
    if (arg === "--no-db") {
      noDb = true;
      continue;
    }
    if (arg === "--doctor") {
      doctor = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(
        `Unknown option "${arg}". Usage: worktree:create <slug> [--base <ref>] [--branch <name>] [--dir <path>] [--with-db | --no-db] [--doctor] [--json]`,
      );
    }
    if (slug !== undefined) {
      throw new Error(`Unexpected extra positional argument "${arg}".`);
    }
    slug = arg;
  }

  if (!slug) {
    throw new Error(
      "Missing <slug>. Usage: worktree:create <slug> [--base <ref>] [--branch <name>] [--dir <path>] [--with-db | --no-db] [--doctor] [--json]",
    );
  }
  if (withDb && noDb) {
    throw new Error("Cannot combine --with-db and --no-db.");
  }

  return {
    slug: validateWorktreeSlug(slug),
    base,
    branch,
    dir,
    dbMode: withDb ? "required" : noDb ? "skip" : "auto",
    doctor,
    json,
  };
};

export const parseListArgs = (rawArgs: readonly string[]): ListCliOptions => {
  const args = stripLeadingSeparator(rawArgs);
  let json = false;
  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unknown option "${arg}". Usage: worktree:list [--json]`);
  }
  return { json };
};

export const parseCleanArgs = (rawArgs: readonly string[]): CleanCliOptions => {
  const args = stripLeadingSeparator(rawArgs);
  let slug: string | undefined;
  let keepBranch = false;
  let json = false;

  for (const arg of args) {
    if (arg === "--keep-branch") {
      keepBranch = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(
        `Unknown option "${arg}". Usage: worktree:clean <slug> [--keep-branch] [--json]`,
      );
    }
    if (slug !== undefined) {
      throw new Error(`Unexpected extra positional argument "${arg}".`);
    }
    slug = arg;
  }

  if (!slug) {
    throw new Error("Missing <slug>. Usage: worktree:clean <slug> [--keep-branch] [--json]");
  }

  return { slug: validateWorktreeSlug(slug), keepBranch, json };
};

const canonicalPath = (targetPath: string): string => {
  const resolved = resolve(targetPath);
  if (existsSync(resolved)) {
    try {
      return realpathSync(resolved);
    } catch {
      return resolved;
    }
  }
  const trailingSegments: string[] = [];
  let cursor = resolved;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      return resolved;
    }
    trailingSegments.unshift(basename(cursor));
    cursor = parent;
  }
  try {
    return join(realpathSync(cursor), ...trailingSegments);
  } catch {
    return resolved;
  }
};

export const parseGitWorktreePorcelain = (output: string): GitWorktreeEntry[] => {
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | null = null;
  const lines = output.includes("\0") ? output.split("\0") : output.split(/\r?\n/);

  for (const line of lines) {
    if (line === "") {
      if (current) {
        entries.push(current);
        current = null;
      }
      continue;
    }
    if (line.startsWith("worktree ")) {
      if (current) {
        entries.push(current);
      }
      current = { path: line.slice("worktree ".length) };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    } else if (line === "locked" || line.startsWith("locked ")) {
      current.locked = true;
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      current.prunable = true;
    }
  }
  if (current) {
    entries.push(current);
  }
  return entries;
};

const defaultExecGit = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const defaultExecCommand = (
  command: string,
  args: readonly string[],
  { cwd, quiet }: { cwd: string; quiet: boolean },
): void => {
  const options: ExecFileSyncOptions = quiet
    ? { cwd, stdio: ["ignore", "pipe", "pipe"] }
    : { cwd, stdio: "inherit" };
  execFileSync(command, args, options);
};

export const resolvePrimaryRepoRoot = (
  cwd: string,
  execGit: (dir: string, args: readonly string[]) => string = defaultExecGit,
): string => {
  const commonDir = execGit(cwd, ["rev-parse", "--git-common-dir"]).trim();
  const resolvedCommonDir = resolve(cwd, commonDir);
  if (resolvedCommonDir.endsWith("/.git") || resolvedCommonDir.endsWith("\\.git")) {
    return canonicalPath(dirname(resolvedCommonDir));
  }
  return canonicalPath(execGit(cwd, ["rev-parse", "--show-toplevel"]).trim());
};

export const registryPathForRepo = (primaryRepoRoot: string): string =>
  join(primaryRepoRoot, ".tmp", "worktrees", ".registry.json");

export const registryLockPathForRepo = (primaryRepoRoot: string): string =>
  join(primaryRepoRoot, ".tmp", "worktrees", ".registry.lock");

const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_INITIAL_DELAY_MS = 25;
const DEFAULT_LOCK_MAX_DELAY_MS = 250;
const LOCK_WRITE_GRACE_MS = 1_000;

const lockMetadataSchema = z.object({
  pid: z.number().int().positive(),
  token: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});

const getErrnoCode = (error: unknown): string | undefined => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
};

const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return getErrnoCode(error) === "EPERM";
  }
};

const tryClearStaleLock = (lockPath: string, staleMs: number): boolean => {
  let raw: string;
  let mtimeMs: number;
  try {
    const stat = statSync(lockPath);
    mtimeMs = stat.mtimeMs;
    raw = readFileSync(lockPath, "utf8");
  } catch {
    return false;
  }

  const ageMs = Date.now() - mtimeMs;
  const corruptGraceMs = Math.min(staleMs, LOCK_WRITE_GRACE_MS);
  let stale = false;
  if (raw.trim().length > 0) {
    try {
      const parsed = lockMetadataSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        // Never expire valid lock metadata solely by age while its owner process is still alive.
        stale = !isProcessAlive(parsed.data.pid);
      } else {
        stale = ageMs >= corruptGraceMs;
      }
    } catch {
      stale = ageMs >= corruptGraceMs;
    }
  } else {
    stale = ageMs >= corruptGraceMs;
  }

  if (!stale) {
    return false;
  }

  try {
    if (readFileSync(lockPath, "utf8") === raw) {
      unlinkSync(lockPath);
      return true;
    }
  } catch {
    // Another process already removed or replaced it.
  }
  return false;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const withWorktreeRegistryLock = async <T>(
  primaryRepoRoot: string,
  operation: () => Promise<T> | T,
  options: RegistryLockOptions = {},
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_LOCK_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_LOCK_MAX_DELAY_MS;

  const lockPath = registryLockPathForRepo(primaryRepoRoot);
  mkdirSync(dirname(lockPath), { recursive: true });

  const token = randomUUID();
  const payload = `${JSON.stringify({ pid: process.pid, token, createdAt: Date.now() })}\n`;
  const deadline = Date.now() + timeoutMs;
  let delayMs = initialDelayMs;
  let acquired = false;

  while (!acquired) {
    try {
      const fd = openSync(
        lockPath,
        fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        0o600,
      );
      try {
        writeFileSync(fd, payload, "utf8");
      } finally {
        closeSync(fd);
      }
      acquired = true;
    } catch (error) {
      if (getErrnoCode(error) !== "EEXIST") {
        throw error;
      }
      if (tryClearStaleLock(lockPath, staleMs)) {
        continue;
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(
          `Timed out waiting for worktree registry lock at "${lockPath}" after ${timeoutMs}ms.`,
        );
      }
      await sleep(Math.min(delayMs, remainingMs));
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }

  try {
    return await operation();
  } finally {
    try {
      if (readFileSync(lockPath, "utf8") === payload) {
        unlinkSync(lockPath);
      }
    } catch {
      // Lock file already removed.
    }
  }
};

export const readWorktreeRegistry = (primaryRepoRoot: string): WorktreeRegistry => {
  const path = registryPathForRepo(primaryRepoRoot);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (getErrnoCode(error) === "ENOENT") {
      return { version: 1, worktrees: {} };
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read worktree registry at "${path}": ${detail}`, { cause: error });
  }

  try {
    const raw = JSON.parse(text) as unknown;
    return worktreeRegistrySchema.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
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

const canBindHost = (
  port: number,
  host: string,
  ignoreUnsupportedHost: boolean,
): Promise<boolean> =>
  new Promise((resolvePromise) => {
    const server = createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (
        ignoreUnsupportedHost &&
        (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")
      ) {
        resolvePromise(true);
        return;
      }
      resolvePromise(false);
    });
    server.once("listening", () => {
      server.close(() => resolvePromise(true));
    });
    server.listen({ port, host, exclusive: true });
  });

export const isPortAvailable = async (port: number): Promise<boolean> => {
  const ipv4Free = await canBindHost(port, "127.0.0.1", false);
  if (!ipv4Free) {
    return false;
  }
  return canBindHost(port, "::1", true);
};

export const collectReservedPorts = (
  registry: WorktreeRegistry,
  activeWorktreePaths?: ReadonlySet<string>,
): Set<number> => {
  const reserved = new Set<number>(Object.values(DEFAULT_PORTS));
  for (const record of Object.values(registry.worktrees)) {
    // A checkout moved with `git worktree move` keeps its Git metadata and token, and its
    // `.env.local` still uses the recorded ports.
    if (
      activeWorktreePaths &&
      record.status !== "cleaning" &&
      record.status !== "creating" &&
      !activeWorktreePaths.has(canonicalPath(record.path)) &&
      !holdsCheckoutToken(record)
    ) {
      continue;
    }
    for (const port of Object.values(record.ports)) {
      reserved.add(port);
    }
  }
  return reserved;
};

/**
 * Reads the ports a checkout's idle servers will use from the `.env.local` files they load
 * (`app/.env.local` and the root `.env.local`), so new worktrees never claim them.
 */
export const readConfiguredPorts = (checkoutRoot: string): number[] => {
  const ports: number[] = [];
  for (const envFile of [
    join(checkoutRoot, "app", ".env.local"),
    join(checkoutRoot, ".env.local"),
  ]) {
    let values: Record<string, string | undefined>;
    try {
      values = parseEnv(readFileSync(envFile, "utf8"));
    } catch (error) {
      const code = getErrnoCode(error);
      if (code === "ENOENT" || code === "ENOTDIR") {
        continue;
      }
      throw error;
    }
    for (const key of WORKTREE_PORT_KEYS) {
      const port = Number(values[key]);
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        ports.push(port);
      }
    }
  }
  return ports;
};

export const allocateWorktreePorts = async ({
  reservedPorts,
  checkPortAvailable = isPortAvailable,
}: {
  reservedPorts: ReadonlySet<number>;
  checkPortAvailable?: (port: number) => Promise<boolean>;
}): Promise<WorktreePorts> => {
  const claimed = new Set<number>(reservedPorts);

  for (let slot = 0; slot < MAX_PORT_SLOTS; slot += 1) {
    const offset = slot * WORKTREE_PORT_STRIDE;
    const candidate: Record<WorktreePortKey, number> = {
      MERIT_DEV_PORT: WORKTREE_PORT_BASES.MERIT_DEV_PORT + offset,
      MERIT_APP_PORT: WORKTREE_PORT_BASES.MERIT_APP_PORT + offset,
      MERIT_WORKSPACE_PORT: WORKTREE_PORT_BASES.MERIT_WORKSPACE_PORT + offset,
      MERIT_STORYBOOK_DEV_PORT: WORKTREE_PORT_BASES.MERIT_STORYBOOK_DEV_PORT + offset,
      MERIT_STORYBOOK_PORT: WORKTREE_PORT_BASES.MERIT_STORYBOOK_PORT + offset,
    };
    const values = Object.values(candidate);
    if (values.some((port) => port > 65535 || claimed.has(port))) {
      continue;
    }
    const availability = await Promise.all(values.map((port) => checkPortAvailable(port)));
    if (availability.every(Boolean)) {
      return candidate;
    }
  }

  // Fallback: allocate each port independently if aligned slots are congested.
  const allocated: Partial<Record<WorktreePortKey, number>> = {};
  for (const key of WORKTREE_PORT_KEYS) {
    let found: number | undefined;
    for (let port = WORKTREE_PORT_BASES[key]; port <= 65535; port += 1) {
      if (claimed.has(port)) {
        continue;
      }
      if (await checkPortAvailable(port)) {
        found = port;
        claimed.add(port);
        break;
      }
    }
    if (found === undefined) {
      throw new Error(`Could not allocate a free local port for ${key}.`);
    }
    allocated[key] = found;
  }
  return worktreePortsSchema.parse(allocated);
};

export const formatWorktreeEnvFile = ({
  slug,
  databaseUrl,
  testDatabaseUrl = DEFAULT_COMPOSE_DATABASE_URL,
  ports,
}: {
  slug: string;
  databaseUrl: string;
  testDatabaseUrl?: string;
  ports: WorktreePorts;
}): string =>
  [
    `# Generated by \`vp run worktree:create ${slug}\` — do not commit.`,
    `DATABASE_URL=${databaseUrl}`,
    `TEST_DATABASE_URL=${testDatabaseUrl}`,
    ...WORKTREE_PORT_KEYS.map((key) => `${key}=${ports[key]}`),
    "",
  ].join("\n");

const gitRefExists = (
  cwd: string,
  ref: string,
  execGit: (dir: string, args: readonly string[]) => string,
): boolean => {
  try {
    execGit(cwd, ["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
};

const resolveBaseRef = (
  primaryRepoRoot: string,
  requestedBase: string | undefined,
  execGit: (dir: string, args: readonly string[]) => string,
): string => {
  if (requestedBase) {
    if (!gitRefExists(primaryRepoRoot, `${requestedBase}^{commit}`, execGit)) {
      throw new Error(`Base ref "${requestedBase}" does not resolve to a commit.`);
    }
    return requestedBase;
  }
  if (gitRefExists(primaryRepoRoot, "origin/main^{commit}", execGit)) {
    return "origin/main";
  }
  if (gitRefExists(primaryRepoRoot, "main^{commit}", execGit)) {
    return "main";
  }
  throw new Error(
    'Could not resolve default base ref ("origin/main" or "main"). Pass --base <ref>.',
  );
};

const getActiveGitWorktrees = (
  primaryRepoRoot: string,
  execGit: (dir: string, args: readonly string[]) => string,
): GitWorktreeEntry[] =>
  parseGitWorktreePorcelain(execGit(primaryRepoRoot, ["worktree", "list", "--porcelain", "-z"]));

const resolveCommonGitDir = (
  primaryRepoRoot: string,
  execGit: (dir: string, args: readonly string[]) => string,
): string =>
  canonicalPath(
    resolve(primaryRepoRoot, execGit(primaryRepoRoot, ["rev-parse", "--git-common-dir"]).trim()),
  );

const isInsideDirectory = (targetPath: string, parentDir: string): boolean => {
  const normalizedTarget = canonicalPath(targetPath);
  const normalizedParent = canonicalPath(parentDir);
  const prefix = normalizedParent.endsWith(sep) ? normalizedParent : `${normalizedParent}${sep}`;
  return normalizedTarget.startsWith(prefix);
};

const pathsOverlap = (left: string, right: string): boolean => {
  const normalizedLeft = canonicalPath(left);
  const normalizedRight = canonicalPath(right);
  return (
    normalizedLeft === normalizedRight ||
    isInsideDirectory(normalizedLeft, normalizedRight) ||
    isInsideDirectory(normalizedRight, normalizedLeft)
  );
};

const assertNoWorktreePathOverlap = (
  targetDir: string,
  primaryRepoRoot: string,
  gitWorktrees: readonly GitWorktreeEntry[],
  registry?: WorktreeRegistry,
): void => {
  const linkedWorktreePaths = new Set<string>();
  for (const entry of gitWorktrees) {
    const entryPath = canonicalPath(entry.path);
    if (entryPath !== primaryRepoRoot) {
      linkedWorktreePaths.add(entryPath);
    }
  }
  if (registry) {
    for (const record of Object.values(registry.worktrees)) {
      const recordPath = canonicalPath(record.path);
      if (recordPath !== primaryRepoRoot) {
        linkedWorktreePaths.add(recordPath);
      }
    }
  }
  for (const existingPath of linkedWorktreePaths) {
    if (pathsOverlap(targetDir, existingPath)) {
      throw new Error(
        `Target directory "${targetDir}" overlaps existing worktree "${existingPath}". Choose a different --dir.`,
      );
    }
  }
};

const readWorktreeGitDir = (worktreePath: string): string | null => {
  const dotGitPath = join(worktreePath, ".git");
  try {
    if (!statSync(dotGitPath).isFile()) {
      return null;
    }
    const content = readFileSync(dotGitPath, "utf8").trim();
    const match = /^gitdir:\s*(.+)$/.exec(content);
    if (!match?.[1]) {
      return null;
    }
    return canonicalPath(resolve(worktreePath, match[1].trim()));
  } catch {
    return null;
  }
};

const hasOwnedWorktreeGitFile = (worktreePath: string, commonGitDir: string): boolean => {
  const referencedGitDir = readWorktreeGitDir(worktreePath);
  if (!referencedGitDir) {
    return false;
  }
  return isInsideDirectory(referencedGitDir, join(commonGitDir, "worktrees"));
};

const pathEntryExists = (targetPath: string): boolean => {
  try {
    lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
};

const readCheckoutToken = (gitDir: string): string | null => {
  try {
    return readFileSync(join(gitDir, CHECKOUT_TOKEN_FILE), "utf8").trim() || null;
  } catch {
    return null;
  }
};

type CheckoutIdentity = Pick<WorktreeRecord, "gitDir" | "checkoutToken" | "partialRemoval">;

/** Reports whether the Git metadata recorded for a checkout still carries the token written at create. */
const holdsCheckoutToken = (identity: CheckoutIdentity | undefined): boolean =>
  Boolean(
    identity?.gitDir &&
    identity.checkoutToken &&
    readCheckoutToken(identity.gitDir) === identity.checkoutToken,
  );

/**
 * Returns where the registered checkout lives now, following the back-link Git keeps in its
 * metadata, or `null` when that metadata no longer belongs to the registered checkout.
 */
const currentCheckoutPath = (identity: CheckoutIdentity | undefined): string | null => {
  if (!identity?.gitDir || !holdsCheckoutToken(identity)) {
    return null;
  }
  try {
    const backLink = readFileSync(join(identity.gitDir, "gitdir"), "utf8").trim();
    return dirname(canonicalPath(resolve(identity.gitDir, backLink)));
  } catch {
    return null;
  }
};

/**
 * Proves that a checkout left behind by a failed `git worktree add` belongs to this attempt: its
 * Git metadata must point back at `worktreePath` and check out the branch this attempt created.
 */
const gitMetadataNamesNewCheckout = (
  gitDir: string,
  worktreePath: string,
  branch: string,
): boolean => {
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const backLink = readFileSync(join(gitDir, "gitdir"), "utf8").trim();
    return (
      head === `ref: refs/heads/${branch}` &&
      canonicalPath(resolve(gitDir, backLink)) === canonicalPath(join(worktreePath, ".git"))
    );
  } catch {
    return false;
  }
};

const isClaimOwnerAlive = (record: WorktreeRecord): boolean =>
  record.ownerPid !== undefined && isProcessAlive(record.ownerPid);

const assertCheckoutIdentity = (
  worktreePath: string,
  normalizedPath: string,
  identity: CheckoutIdentity | undefined,
): void => {
  const expectedGitDir = identity?.gitDir ? canonicalPath(identity.gitDir) : undefined;
  if (!expectedGitDir) {
    return;
  }
  const movedPath = currentCheckoutPath(identity);
  if (movedPath && movedPath !== normalizedPath && existsSync(movedPath)) {
    throw new Error(
      `Refusing to clean "${normalizedPath}": its registered checkout was moved to "${movedPath}" and still uses this worktree's database and branch. Move it back with \`git worktree move "${movedPath}" "${normalizedPath}"\` and retry.`,
    );
  }
  if (!existsSync(worktreePath)) {
    return;
  }
  // Residue of a removal this tool started: allow it only while no checkout metadata reappears.
  if (identity?.partialRemoval && !pathEntryExists(join(worktreePath, ".git"))) {
    return;
  }
  const actualGitDir = readWorktreeGitDir(worktreePath);
  if (actualGitDir !== expectedGitDir) {
    const foundDescription = actualGitDir
      ? `gitdir "${actualGitDir}"`
      : "no matching linked-worktree .git file";
    throw new Error(
      `Refusing to remove "${normalizedPath}": checkout identity mismatch (expected gitdir "${expectedGitDir}", found ${foundDescription}).`,
    );
  }
  // Git may reuse the same `.git/worktrees/<id>` for a new checkout at this path, so a live
  // metadata directory must also carry the token written when this worktree was created.
  if (identity?.checkoutToken && existsSync(actualGitDir)) {
    const actualToken = readCheckoutToken(actualGitDir);
    if (actualToken !== identity.checkoutToken) {
      throw new Error(
        `Refusing to remove "${normalizedPath}": checkout identity mismatch (gitdir "${actualGitDir}" belongs to a different checkout than the one worktree:create registered).`,
      );
    }
  }
};

const assertNoNestedWorktrees = (normalizedPath: string, otherPaths: Iterable<string>): void => {
  for (const otherPath of otherPaths) {
    const otherCanonicalPath = canonicalPath(otherPath);
    if (isInsideDirectory(otherCanonicalPath, normalizedPath)) {
      throw new Error(
        `Refusing to remove "${normalizedPath}": it contains another worktree at "${otherCanonicalPath}". Move or remove that worktree first.`,
      );
    }
  }
};

const describeExecError = (error: unknown): string => {
  const parts: string[] = [];
  if (error instanceof Error && error.message) {
    parts.push(error.message);
  }
  if (typeof error === "object" && error !== null && "stderr" in error) {
    const { stderr } = error;
    if (typeof stderr === "string") {
      parts.push(stderr);
    } else if (Buffer.isBuffer(stderr)) {
      parts.push(stderr.toString("utf8"));
    }
  }
  return parts.join("\n");
};

const currentBranchName = (
  repoDir: string,
  execGit: (dir: string, args: readonly string[]) => string,
): string | null => {
  try {
    const branch = execGit(repoDir, ["branch", "--show-current"]).trim();
    return branch || null;
  } catch {
    return null;
  }
};

export const createWorktree = async (
  options: CreateCliOptions & { primaryRepoRoot: string; cwd?: string },
  deps: WorktreeDeps = {},
): Promise<WorktreeCreateResult> => {
  const execGit = deps.execGit ?? defaultExecGit;
  const execCommand = deps.execCommand ?? defaultExecCommand;
  const checkPortAvailable = deps.checkPortAvailable ?? isPortAvailable;
  const now = deps.now ?? (() => new Date());

  const slug = validateWorktreeSlug(options.slug);
  const primaryRepoRoot = canonicalPath(options.primaryRepoRoot);
  const checkPostgres =
    deps.isPostgresReachable ?? (() => isLocalPostgresReachable(undefined, primaryRepoRoot));
  const createDb =
    deps.ensureDatabase ?? ((name) => ensureLocalDatabase(name, undefined, primaryRepoRoot));
  const dropDb =
    deps.dropDatabase ?? ((name) => dropLocalDatabase(name, undefined, primaryRepoRoot));
  const invokeCwd = options.cwd ? resolve(options.cwd) : primaryRepoRoot;
  const targetDir = options.dir
    ? resolve(invokeCwd, options.dir)
    : join(primaryRepoRoot, ".tmp", "worktrees", slug);

  const canonicalTargetDir = canonicalPath(targetDir);
  if (
    canonicalTargetDir === primaryRepoRoot ||
    isInsideDirectory(primaryRepoRoot, canonicalTargetDir)
  ) {
    throw new Error("Refusing to create a worktree at or containing the primary repository root.");
  }

  const branch = options.branch ?? `worktree/${slug}`;
  if (PROTECTED_BRANCH_NAMES.has(branch)) {
    throw new Error(`Refusing to use protected branch name "${branch}" for a worktree.`);
  }

  const baseRef = resolveBaseRef(primaryRepoRoot, options.base, execGit);
  const databaseName = databaseNameForSlug(slug);
  const databaseUrl = buildLocalDatabaseUrl(databaseName);

  // Fail fast before creating git worktrees or running pnpm install when --with-db is required.
  let postgresReachable = false;
  if (options.dbMode !== "skip") {
    postgresReachable = await checkPostgres();
    if (options.dbMode === "required" && !postgresReachable) {
      throw new Error(
        "PostgreSQL is not reachable at 127.0.0.1:55432 (--with-db was requested). Start services with `vp run services:start` and retry.",
      );
    }
  }

  let targetExistedBefore = false;
  let branchCreated = false;
  let worktreeAddAttempted = false;
  let worktreeAdded = false;
  let createdGitDir: string | undefined;
  const checkoutToken = randomUUID();
  let registryReserved = false;
  let databaseCreated = false;
  let resolvedTargetDir = canonicalTargetDir;
  try {
    const { ports } = await withWorktreeRegistryLock(
      primaryRepoRoot,
      async () => {
        const registry = readWorktreeRegistry(primaryRepoRoot);
        const gitWorktrees = getActiveGitWorktrees(primaryRepoRoot, execGit);
        const activePaths = new Set(gitWorktrees.map((entry) => canonicalPath(entry.path)));

        const existingRecord = registry.worktrees[slug];
        if (existingRecord) {
          if (existingRecord.status === "cleaning") {
            throw new Error(
              `Worktree "${slug}" is currently being cleaned. Wait for cleanup to finish or re-run \`vp run worktree:clean ${slug}\`.`,
            );
          }
          if (existingRecord.status === "creating") {
            throw new Error(
              isClaimOwnerAlive(existingRecord)
                ? `Worktree "${slug}" is currently being created at ${existingRecord.path} by process ${existingRecord.ownerPid}. Wait for creation to finish.`
                : `Creating worktree "${slug}" at ${existingRecord.path} was interrupted. Run \`vp run worktree:clean ${slug}\` to remove its partial state first.`,
            );
          }
          throw new Error(
            `Worktree "${slug}" already exists at ${existingRecord.path}. Run \`vp run worktree:clean ${slug}\` first.`,
          );
        }

        assertNoWorktreePathOverlap(targetDir, primaryRepoRoot, gitWorktrees, registry);

        targetExistedBefore = existsSync(targetDir);
        if (targetExistedBefore) {
          throw new Error(
            `Target directory "${targetDir}" already exists. Choose a different --dir or clean it up first.`,
          );
        }
        if (gitRefExists(primaryRepoRoot, `refs/heads/${branch}`, execGit)) {
          throw new Error(
            `Branch "${branch}" already exists. Choose a different --branch or delete the existing branch first.`,
          );
        }

        const reservedPorts = collectReservedPorts(registry, activePaths);
        // Idle checkouts, including moved ones, start servers on whatever their `.env.local` files
        // set now, which can differ from the ports recorded for them.
        for (const checkoutPath of new Set([primaryRepoRoot, ...activePaths])) {
          for (const port of readConfiguredPorts(checkoutPath)) {
            reservedPorts.add(port);
          }
        }
        const allocatedPorts = await allocateWorktreePorts({ reservedPorts, checkPortAvailable });

        // Re-check after async port probes in case an external process created an overlapping
        // Git worktree, target path, or branch while waiting.
        const latestGitWorktrees = getActiveGitWorktrees(primaryRepoRoot, execGit);
        assertNoWorktreePathOverlap(targetDir, primaryRepoRoot, latestGitWorktrees);

        targetExistedBefore = existsSync(targetDir);
        if (targetExistedBefore) {
          throw new Error(
            `Target directory "${targetDir}" already exists. Choose a different --dir or clean it up first.`,
          );
        }
        if (gitRefExists(primaryRepoRoot, `refs/heads/${branch}`, execGit)) {
          throw new Error(
            `Branch "${branch}" already exists. Choose a different --branch or delete the existing branch first.`,
          );
        }

        mkdirSync(dirname(targetDir), { recursive: true });
        // Create the branch on its own first: `git branch` refuses an existing name, so its success
        // proves this attempt owns the branch that rollback may delete.
        execGit(primaryRepoRoot, ["branch", branch, baseRef]);
        branchCreated = true;
        worktreeAddAttempted = true;
        execGit(primaryRepoRoot, ["worktree", "add", targetDir, branch]);
        worktreeAdded = true;

        resolvedTargetDir = canonicalPath(targetDir);
        createdGitDir = readWorktreeGitDir(resolvedTargetDir) ?? undefined;
        if (createdGitDir) {
          writeFileSync(join(createdGitDir, CHECKOUT_TOKEN_FILE), `${checkoutToken}\n`, "utf8");
        }
        registry.worktrees[slug] = {
          slug,
          path: resolvedTargetDir,
          ...(createdGitDir ? { gitDir: createdGitDir, checkoutToken } : {}),
          branch,
          baseRef,
          databaseName,
          databaseUrl,
          databaseCreated: false,
          ports: allocatedPorts,
          createdAt: now().toISOString(),
          status: "creating",
          ownerPid: process.pid,
        };
        writeWorktreeRegistry(primaryRepoRoot, registry);
        registryReserved = true;

        return { ports: allocatedPorts };
      },
      deps.lockOptions,
    );

    writeFileSync(
      join(resolvedTargetDir, ".env.local"),
      formatWorktreeEnvFile({ slug, databaseUrl, ports }),
      "utf8",
    );

    await execCommand("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], {
      cwd: resolvedTargetDir,
      quiet: options.json,
    });

    const localVp = join(resolvedTargetDir, "node_modules/.bin/vp");
    await execCommand(existsSync(localVp) ? localVp : "vp", ["config", "--no-agent"], {
      cwd: resolvedTargetDir,
      quiet: options.json,
    });

    if (options.dbMode !== "skip") {
      if (postgresReachable) {
        const dbResult = await createDb(databaseName);
        databaseCreated = dbResult.created;
      } else if (!options.json) {
        console.error(
          `Warning: PostgreSQL at 127.0.0.1:55432 is not reachable; skipped creating database "${databaseName}".`,
        );
      }
    }

    if (databaseCreated && options.doctor) {
      await withWorktreeRegistryLock(
        primaryRepoRoot,
        () => {
          const updatedRegistry = readWorktreeRegistry(primaryRepoRoot);
          const current = updatedRegistry.worktrees[slug];
          if (
            current &&
            current.status === "creating" &&
            canonicalPath(current.path) === resolvedTargetDir
          ) {
            updatedRegistry.worktrees[slug] = { ...current, databaseCreated: true };
            writeWorktreeRegistry(primaryRepoRoot, updatedRegistry);
          }
        },
        deps.lockOptions,
      );
    }

    if (options.doctor) {
      const doctorScript = join(resolvedTargetDir, ".agents/install-environment.sh");
      if (existsSync(doctorScript)) {
        await execCommand("bash", [doctorScript, "--doctor"], {
          cwd: resolvedTargetDir,
          quiet: options.json,
        });
      }
    }

    await withWorktreeRegistryLock(
      primaryRepoRoot,
      () => {
        const updatedRegistry = readWorktreeRegistry(primaryRepoRoot);
        const current = updatedRegistry.worktrees[slug];
        if (
          current &&
          current.status === "creating" &&
          canonicalPath(current.path) === resolvedTargetDir
        ) {
          const { ownerPid: _releasedOwner, ...withoutOwner } = current;
          updatedRegistry.worktrees[slug] = {
            ...withoutOwner,
            databaseCreated,
            status: "active",
          };
          writeWorktreeRegistry(primaryRepoRoot, updatedRegistry);
        }
      },
      deps.lockOptions,
    );

    return {
      slug,
      path: resolvedTargetDir,
      branch,
      baseRef,
      databaseName,
      databaseUrl,
      databaseCreated,
      ports,
    };
  } catch (error) {
    let databaseDroppedInRollback = false;
    if (databaseCreated) {
      try {
        await dropDb(databaseName);
        databaseDroppedInRollback = true;
      } catch {
        // Best-effort rollback.
      }
    }
    let checkoutRemovalError: unknown;
    let checkoutRemains = false;
    let checkoutDotGitRemoved = false;
    let checkoutPreserved = false;
    if (worktreeAdded || worktreeAddAttempted) {
      const cleanupDir = existsSync(resolvedTargetDir)
        ? canonicalPath(resolvedTargetDir)
        : resolvedTargetDir;
      if (!targetExistedBefore) {
        let ownedCheckout = false;
        if (existsSync(cleanupDir)) {
          try {
            const commonGitDir = resolveCommonGitDir(primaryRepoRoot, execGit);
            const actualGitDir = readWorktreeGitDir(cleanupDir);
            // The directory's earlier absence does not prove ownership: another process can fill it
            // before `git worktree add` runs. Only Git metadata tied to this attempt does.
            ownedCheckout =
              actualGitDir !== null &&
              hasOwnedWorktreeGitFile(cleanupDir, commonGitDir) &&
              (createdGitDir
                ? actualGitDir === createdGitDir &&
                  readCheckoutToken(actualGitDir) === checkoutToken
                : gitMetadataNamesNewCheckout(actualGitDir, cleanupDir, branch));
          } catch {
            ownedCheckout = false;
          }
          checkoutPreserved = !ownedCheckout;
        }
        if (ownedCheckout) {
          // Let Git remove its own checkout; if Git refuses (for example, a locked worktree), keep
          // the checkout and its registry record instead of deleting the directory recursively.
          try {
            execGit(primaryRepoRoot, ["worktree", "remove", "--force", cleanupDir]);
          } catch (removeError) {
            checkoutRemovalError = removeError;
          }
          checkoutRemains = existsSync(cleanupDir);
          checkoutDotGitRemoved = checkoutRemains && !existsSync(join(cleanupDir, ".git"));
        }
        try {
          execGit(primaryRepoRoot, ["worktree", "prune"]);
        } catch {
          // Best-effort rollback.
        }
      }
    }
    // A branch that appeared after the last check may belong to another job, so delete only the
    // branch this attempt's own `git branch` created.
    if (
      branchCreated &&
      !checkoutRemains &&
      gitRefExists(primaryRepoRoot, `refs/heads/${branch}`, execGit)
    ) {
      try {
        execGit(primaryRepoRoot, ["branch", "-D", branch]);
      } catch {
        // Best-effort rollback.
      }
    }
    if (registryReserved) {
      try {
        await withWorktreeRegistryLock(
          primaryRepoRoot,
          () => {
            const latestRegistry = readWorktreeRegistry(primaryRepoRoot);
            const current = latestRegistry.worktrees[slug];
            if (
              current &&
              current.status === "creating" &&
              canonicalPath(current.path) === resolvedTargetDir
            ) {
              if (checkoutRemains) {
                // Keep the recorded identity so a retried clean still rejects a replacement checkout.
                const { ownerPid: _releasedOwner, ...withoutOwner } = current;
                latestRegistry.worktrees[slug] = {
                  ...withoutOwner,
                  ...(checkoutDotGitRemoved ? { partialRemoval: true } : {}),
                  databaseCreated: databaseCreated && !databaseDroppedInRollback,
                  status: "cleaning",
                };
              } else {
                delete latestRegistry.worktrees[slug];
              }
              writeWorktreeRegistry(primaryRepoRoot, latestRegistry);
            }
          },
          deps.lockOptions,
        );
      } catch {
        // Best-effort rollback.
      }
    }
    if (checkoutRemovalError || checkoutRemains) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      const removalDetail = checkoutRemovalError
        ? describeExecError(checkoutRemovalError) ||
          (typeof checkoutRemovalError === "string"
            ? checkoutRemovalError
            : "unknown removal error")
        : "directory still exists after removal";
      throw new Error(
        `${originalMessage} (rollback could not remove checkout at "${resolvedTargetDir}": ${removalDetail})`,
        { cause: error },
      );
    }
    if (checkoutPreserved) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${originalMessage} (rollback preserved "${resolvedTargetDir}" because its Git metadata does not show that this attempt created it)`,
        { cause: error },
      );
    }
    throw error;
  }
};

export const listWorktrees = (
  { primaryRepoRoot }: { primaryRepoRoot: string },
  deps: Pick<WorktreeDeps, "execGit"> = {},
): WorktreeListEntry[] => {
  const execGit = deps.execGit ?? defaultExecGit;
  const root = canonicalPath(primaryRepoRoot);
  const registry = readWorktreeRegistry(root);
  const gitWorktrees = getActiveGitWorktrees(root, execGit);
  const activeByPath = new Map(gitWorktrees.map((entry) => [canonicalPath(entry.path), entry]));

  return Object.values(registry.worktrees)
    .flatMap((record) => {
      if (record.status === "cleaning" || record.status === "creating") {
        return [];
      }
      // Follow a checkout moved with `git worktree move` through its token, and never attribute
      // another checkout at the recorded path to this record.
      const checkoutPath = record.checkoutToken
        ? currentCheckoutPath(record)
        : canonicalPath(record.path);
      const gitEntry = checkoutPath ? activeByPath.get(checkoutPath) : undefined;
      if (!checkoutPath || !gitEntry || !existsSync(checkoutPath)) {
        return [];
      }
      return [
        {
          slug: record.slug,
          path: checkoutPath,
          branch: gitEntry.branch ?? record.branch,
          databaseName: record.databaseName,
          databaseUrl: record.databaseUrl,
          ports: record.ports,
        },
      ];
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
};

const matchesCleanClaim = (
  current: WorktreeRecord | undefined,
  {
    claimedRecord,
    cleanToken,
    normalizedPath,
    databaseName,
  }: {
    claimedRecord: boolean;
    cleanToken: string;
    normalizedPath: string;
    databaseName: string;
  },
): boolean => {
  if (!claimedRecord) {
    return current === undefined;
  }
  return (
    current !== undefined &&
    current.status === "cleaning" &&
    current.cleanToken === cleanToken &&
    canonicalPath(current.path) === normalizedPath &&
    current.databaseName === databaseName
  );
};

export const cleanWorktree = async (
  options: CleanCliOptions & { primaryRepoRoot: string },
  deps: Pick<WorktreeDeps, "execGit" | "isPostgresReachable" | "dropDatabase" | "lockOptions"> = {},
): Promise<WorktreeCleanResult> => {
  const execGit = deps.execGit ?? defaultExecGit;
  const slug = validateWorktreeSlug(options.slug);
  const root = canonicalPath(options.primaryRepoRoot);
  const checkPostgres =
    deps.isPostgresReachable ?? (() => isLocalPostgresReachable(undefined, root));
  const dropDb = deps.dropDatabase ?? ((name) => dropLocalDatabase(name, undefined, root));
  const cleanToken = randomUUID();

  const { worktreePath, normalizedPath, identity, branch, databaseName, claimedRecord } =
    await withWorktreeRegistryLock(
      root,
      () => {
        const registry = readWorktreeRegistry(root);
        const record = registry.worktrees[slug];
        // A claim whose owner process has exited (for example, a killed create) no longer blocks cleanup.
        if (record?.status === "creating" && isClaimOwnerAlive(record)) {
          throw new Error(
            `Worktree "${slug}" is currently being created by process ${record.ownerPid}. Wait for creation to finish before cleaning.`,
          );
        }
        if (
          record?.status === "cleaning" &&
          record.cleanToken &&
          record.cleanToken !== cleanToken &&
          isClaimOwnerAlive(record)
        ) {
          throw new Error(
            `Worktree "${slug}" is already being cleaned by another operation (process ${record.ownerPid}). Wait for it to finish.`,
          );
        }

        const resolvedWorktreePath = record?.path ?? join(root, ".tmp", "worktrees", slug);
        const canonicalWorktreePath = canonicalPath(resolvedWorktreePath);
        const prefix = canonicalWorktreePath.endsWith(sep)
          ? canonicalWorktreePath
          : `${canonicalWorktreePath}${sep}`;
        if (canonicalWorktreePath === root || root.startsWith(prefix)) {
          throw new Error(
            `Refusing to remove primary repository root or ancestor directory "${canonicalWorktreePath}".`,
          );
        }

        if (!record) {
          for (const otherRecord of Object.values(registry.worktrees)) {
            if (otherRecord.slug === slug) {
              continue;
            }
            const otherCanonicalPath = canonicalPath(otherRecord.path);
            if (pathsOverlap(canonicalWorktreePath, otherCanonicalPath)) {
              throw new Error(
                `Refusing to clean unrecorded worktree "${slug}": default path "${canonicalWorktreePath}" overlaps registered worktree "${otherRecord.slug}" at "${otherCanonicalPath}". Run \`vp run worktree:clean ${otherRecord.slug}\` instead.`,
              );
            }
          }
        }

        assertNoNestedWorktrees(canonicalWorktreePath, [
          ...Object.values(registry.worktrees)
            .filter((otherRecord) => otherRecord.slug !== slug)
            .map((otherRecord) => otherRecord.path),
          ...getActiveGitWorktrees(root, execGit)
            .filter((entry) => !entry.prunable && canonicalPath(entry.path) !== root)
            .map((entry) => entry.path),
        ]);
        assertCheckoutIdentity(resolvedWorktreePath, canonicalWorktreePath, record);

        const resolvedBranch = record?.branch ?? `worktree/${slug}`;
        const resolvedDatabaseName = record?.databaseName ?? databaseNameForSlug(slug);
        assertSafeManagedDatabaseName(resolvedDatabaseName);

        let claimed = false;
        if (record) {
          registry.worktrees[slug] = {
            ...record,
            status: "cleaning",
            cleanToken,
            ownerPid: process.pid,
          };
          writeWorktreeRegistry(root, registry);
          claimed = true;
        }

        return {
          worktreePath: resolvedWorktreePath,
          normalizedPath: canonicalWorktreePath,
          identity: record,
          branch: resolvedBranch,
          databaseName: resolvedDatabaseName,
          claimedRecord: claimed,
        };
      },
      deps.lockOptions,
    );

  let removalAttempted = false;
  try {
    // Preload pg from primaryRepoRoot before removing worktreePath so cleaning from inside the
    // worktree being deleted still drops its database cleanly.
    if (!deps.isPostgresReachable || !deps.dropDatabase) {
      try {
        loadPgClient(root);
      } catch {
        // Handled when checking/dropping the database below.
      }
    }

    const gitWorktrees = getActiveGitWorktrees(root, execGit);
    const gitEntry = gitWorktrees.find((entry) => canonicalPath(entry.path) === normalizedPath);
    const commonGitDir = resolveCommonGitDir(root, execGit);
    const managedWorktreesRoot = join(root, ".tmp", "worktrees");

    const isOwnedDirectory = () =>
      isInsideDirectory(normalizedPath, managedWorktreesRoot) ||
      hasOwnedWorktreeGitFile(worktreePath, commonGitDir);

    assertCheckoutIdentity(worktreePath, normalizedPath, identity);
    assertNoNestedWorktrees(
      normalizedPath,
      gitWorktrees
        .filter((entry) => !entry.prunable && canonicalPath(entry.path) !== root)
        .map((entry) => entry.path),
    );

    // A prunable entry has lost its checkout `.git`; `git worktree prune` below clears its metadata.
    let worktreeRemoved = Boolean(gitEntry);
    if (gitEntry && !gitEntry.prunable) {
      if (existsSync(worktreePath)) {
        // Let Git remove its own checkout; if Git refuses (for example, a locked worktree) or
        // fails, surface the error instead of deleting the directory recursively.
        removalAttempted = true;
        execGit(root, ["worktree", "remove", "--force", worktreePath]);
      }
    } else if (existsSync(worktreePath)) {
      if (!isOwnedDirectory()) {
        if (identity?.partialRemoval) {
          throw new Error(
            `Refusing to delete "${normalizedPath}" recursively: it is what remains of an interrupted removal of worktree "${slug}" outside ".tmp/worktrees/". Check that it holds nothing you need, delete it yourself, and rerun \`vp run worktree:clean ${slug}\`.`,
          );
        }
        throw new Error(
          `Refusing to remove directory "${normalizedPath}": it is not a recognized Git worktree for this repository and is outside ".tmp/worktrees/".`,
        );
      }
      removalAttempted = true;
      rmSync(worktreePath, { recursive: true, force: true });
      worktreeRemoved = true;
    }
    execGit(root, ["worktree", "prune"]);

    const assertCleanClaim = (refusedAction: string) => {
      const latestRegistry = readWorktreeRegistry(root);
      if (
        !matchesCleanClaim(latestRegistry.worktrees[slug], {
          claimedRecord,
          cleanToken,
          normalizedPath,
          databaseName,
        })
      ) {
        throw new Error(
          `Worktree "${slug}" registry record no longer matches this cleanup claim; refusing to ${refusedAction}.`,
        );
      }
    };

    let databaseDropped = false;
    if (await checkPostgres()) {
      const refusedDrop = `drop database "${databaseName}"`;
      if (claimedRecord) {
        await withWorktreeRegistryLock(root, () => assertCleanClaim(refusedDrop), deps.lockOptions);
        await dropDb(databaseName);
      } else {
        await withWorktreeRegistryLock(
          root,
          async () => {
            assertCleanClaim(refusedDrop);
            await dropDb(databaseName);
          },
          deps.lockOptions,
        );
      }
      databaseDropped = true;
    } else if (!options.json) {
      console.error(
        `Warning: PostgreSQL at 127.0.0.1:55432 is not reachable; skipped dropping database "${databaseName}".`,
      );
    }

    let branchDeleted = false;
    if (!options.keepBranch && !PROTECTED_BRANCH_NAMES.has(branch)) {
      // A same-slug create holds this lock from `git branch` until it records its claim, so checking
      // the registry under the lock keeps this cleanup from deleting that create's new branch.
      branchDeleted = await withWorktreeRegistryLock(
        root,
        () => {
          assertCleanClaim(`delete branch "${branch}"`);
          const primaryBranch = currentBranchName(root, execGit);
          const checkedOutBranches = new Set(
            getActiveGitWorktrees(root, execGit)
              .map((entry) => entry.branch)
              .filter((entryBranch): entryBranch is string => Boolean(entryBranch)),
          );
          if (
            branch === primaryBranch ||
            checkedOutBranches.has(branch) ||
            !gitRefExists(root, `refs/heads/${branch}`, execGit)
          ) {
            return false;
          }
          execGit(root, ["branch", "-D", branch]);
          return true;
        },
        deps.lockOptions,
      );
    }

    const registryRemoved = claimedRecord
      ? await withWorktreeRegistryLock(
          root,
          () => {
            const latestRegistry = readWorktreeRegistry(root);
            const current = latestRegistry.worktrees[slug];
            if (
              !matchesCleanClaim(current, {
                claimedRecord,
                cleanToken,
                normalizedPath,
                databaseName,
              })
            ) {
              throw new Error(
                `Worktree "${slug}" registry record no longer matches this cleanup claim; refusing to remove registry entry.`,
              );
            }
            if (!current) {
              return false;
            }
            delete latestRegistry.worktrees[slug];
            writeWorktreeRegistry(root, latestRegistry);
            return true;
          },
          deps.lockOptions,
        )
      : false;

    return {
      slug,
      path: normalizedPath,
      branch,
      worktreeRemoved,
      databaseName,
      databaseDropped,
      branchDeleted,
      registryRemoved,
    };
  } catch (error) {
    if (claimedRecord) {
      try {
        await withWorktreeRegistryLock(
          root,
          () => {
            const latestRegistry = readWorktreeRegistry(root);
            const current = latestRegistry.worktrees[slug];
            if (current && current.status === "cleaning" && current.cleanToken === cleanToken) {
              const { cleanToken: _cleared, ownerPid: _releasedOwner, ...rest } = current;
              // Git deletes a checkout's metadata even when removing its files fails, so record
              // the residue explicitly for the retry instead of dropping its identity.
              const partialRemoval =
                removalAttempted &&
                existsSync(worktreePath) &&
                !pathEntryExists(join(worktreePath, ".git"));
              latestRegistry.worktrees[slug] = partialRemoval
                ? { ...rest, partialRemoval: true }
                : rest;
              writeWorktreeRegistry(root, latestRegistry);
            }
          },
          deps.lockOptions,
        );
      } catch {
        // Best-effort token release.
      }
    }
    throw error;
  }
};

export const formatCreateSummary = (result: WorktreeCreateResult): string =>
  [
    `Created worktree "${result.slug}"`,
    `  path:     ${result.path}`,
    `  branch:   ${result.branch} (from ${result.baseRef})`,
    `  database: ${result.databaseName} (${result.databaseCreated ? "created" : "not created"})`,
    `  db url:   ${result.databaseUrl}`,
    `  ports:    dev=${result.ports.MERIT_DEV_PORT}, app=${result.ports.MERIT_APP_PORT}, workspace=${result.ports.MERIT_WORKSPACE_PORT}, storybook=${result.ports.MERIT_STORYBOOK_DEV_PORT}/${result.ports.MERIT_STORYBOOK_PORT}`,
  ].join("\n");

export const formatListSummary = (entries: readonly WorktreeListEntry[]): string => {
  if (entries.length === 0) {
    return "No active worktrees.";
  }
  return entries
    .map((entry) =>
      [
        `${entry.slug}  (${entry.branch})`,
        `  path:     ${entry.path}`,
        `  database: ${entry.databaseName} (${entry.databaseUrl})`,
        `  ports:    dev=${entry.ports.MERIT_DEV_PORT}, app=${entry.ports.MERIT_APP_PORT}, workspace=${entry.ports.MERIT_WORKSPACE_PORT}, storybook=${entry.ports.MERIT_STORYBOOK_DEV_PORT}/${entry.ports.MERIT_STORYBOOK_PORT}`,
      ].join("\n"),
    )
    .join("\n\n");
};

export const formatCleanSummary = (result: WorktreeCleanResult): string =>
  [
    `Cleaned worktree "${result.slug}"`,
    `  path:     ${result.path} (${result.worktreeRemoved ? "removed" : "already absent"})`,
    `  database: ${result.databaseName} (${result.databaseDropped ? "dropped" : "skipped"})`,
    `  branch:   ${result.branch} (${result.branchDeleted ? "deleted" : "kept/absent"})`,
  ].join("\n");

const runCli = async () => {
  const [command, ...rest] = process.argv.slice(2);
  const cwd = process.cwd();
  const primaryRepoRoot = resolvePrimaryRepoRoot(cwd);

  if (command === "create") {
    const options = parseCreateArgs(rest);
    const result = await createWorktree({ ...options, primaryRepoRoot, cwd });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatCreateSummary(result));
    return;
  }

  if (command === "list") {
    const options = parseListArgs(rest);
    const entries = listWorktrees({ primaryRepoRoot });
    console.log(
      options.json ? JSON.stringify({ worktrees: entries }, null, 2) : formatListSummary(entries),
    );
    return;
  }

  if (command === "clean") {
    const options = parseCleanArgs(rest);
    const result = await cleanWorktree({ ...options, primaryRepoRoot });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatCleanSummary(result));
    return;
  }

  throw new Error(
    `Unknown worktree command "${command ?? ""}". Expected "create", "list", or "clean".`,
  );
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  await runCli();
}
