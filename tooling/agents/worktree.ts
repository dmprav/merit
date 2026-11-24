import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  assertSafeManagedDatabaseName,
  buildLocalDatabaseUrl,
  DEFAULT_COMPOSE_DATABASE_URL,
  dropLocalDatabase,
  ensureLocalDatabase,
  isLocalPostgresReachable,
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
  branch: z.string().min(1),
  baseRef: z.string().min(1),
  databaseName: z.string().min(1),
  databaseUrl: z.string().min(1),
  databaseCreated: z.boolean(),
  ports: worktreePortsSchema,
  createdAt: z.string().min(10),
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
  if (!existsSync(resolved)) {
    return resolved;
  }
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
};

export const parseGitWorktreePorcelain = (output: string): GitWorktreeEntry[] => {
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
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
      current = { path: line.slice("worktree ".length).trim() };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
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
  let stale = ageMs >= staleMs;
  if (!stale && raw.trim().length > 0) {
    try {
      const parsed = lockMetadataSchema.safeParse(JSON.parse(raw));
      if (parsed.success && !isProcessAlive(parsed.data.pid)) {
        stale = true;
      } else if (!parsed.success && ageMs >= LOCK_WRITE_GRACE_MS) {
        stale = true;
      }
    } catch {
      if (ageMs >= LOCK_WRITE_GRACE_MS) {
        stale = true;
      }
    }
  } else if (!stale && ageMs >= LOCK_WRITE_GRACE_MS) {
    stale = true;
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
  if (!existsSync(path)) {
    return { version: 1, worktrees: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return worktreeRegistrySchema.parse(raw);
  } catch {
    return { version: 1, worktrees: {} };
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
    if (activeWorktreePaths && !activeWorktreePaths.has(canonicalPath(record.path))) {
      continue;
    }
    for (const port of Object.values(record.ports)) {
      reserved.add(port);
    }
  }
  return reserved;
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
  parseGitWorktreePorcelain(execGit(primaryRepoRoot, ["worktree", "list", "--porcelain"]));

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
  const checkPostgres = deps.isPostgresReachable ?? (() => isLocalPostgresReachable());
  const createDb = deps.ensureDatabase ?? ((name) => ensureLocalDatabase(name));
  const dropDb = deps.dropDatabase ?? ((name) => dropLocalDatabase(name));
  const now = deps.now ?? (() => new Date());

  const slug = validateWorktreeSlug(options.slug);
  const primaryRepoRoot = canonicalPath(options.primaryRepoRoot);
  const invokeCwd = options.cwd ? resolve(options.cwd) : primaryRepoRoot;
  const targetDir = options.dir
    ? resolve(invokeCwd, options.dir)
    : join(primaryRepoRoot, ".tmp", "worktrees", slug);

  if (canonicalPath(targetDir) === primaryRepoRoot) {
    throw new Error("Refusing to create a worktree at the primary repository root.");
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

  let worktreeAdded = false;
  let registryReserved = false;
  let databaseCreated = false;
  let resolvedTargetDir = targetDir;
  try {
    const { ports } = await withWorktreeRegistryLock(
      primaryRepoRoot,
      async () => {
        const registry = readWorktreeRegistry(primaryRepoRoot);
        const gitWorktrees = getActiveGitWorktrees(primaryRepoRoot, execGit);
        const activePaths = new Set(gitWorktrees.map((entry) => canonicalPath(entry.path)));

        const existingRecord = registry.worktrees[slug];
        if (existingRecord && activePaths.has(canonicalPath(existingRecord.path))) {
          throw new Error(
            `Worktree "${slug}" already exists at ${existingRecord.path}. Run \`vp run worktree:clean ${slug}\` first.`,
          );
        }
        if (existsSync(targetDir)) {
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
        const allocatedPorts = await allocateWorktreePorts({ reservedPorts, checkPortAvailable });

        mkdirSync(dirname(targetDir), { recursive: true });
        execGit(primaryRepoRoot, ["worktree", "add", "-b", branch, targetDir, baseRef]);
        worktreeAdded = true;

        resolvedTargetDir = canonicalPath(targetDir);
        registry.worktrees[slug] = {
          slug,
          path: resolvedTargetDir,
          branch,
          baseRef,
          databaseName,
          databaseUrl,
          databaseCreated: false,
          ports: allocatedPorts,
          createdAt: now().toISOString(),
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

    if (databaseCreated) {
      await withWorktreeRegistryLock(
        primaryRepoRoot,
        () => {
          const updatedRegistry = readWorktreeRegistry(primaryRepoRoot);
          const current = updatedRegistry.worktrees[slug];
          if (current) {
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
    if (databaseCreated) {
      try {
        await dropDb(databaseName);
      } catch {
        // Best-effort rollback.
      }
    }
    if (worktreeAdded) {
      if (existsSync(resolvedTargetDir)) {
        try {
          execGit(primaryRepoRoot, ["worktree", "remove", "--force", resolvedTargetDir]);
        } catch {
          rmSync(resolvedTargetDir, { recursive: true, force: true });
        }
      }
      if (existsSync(resolvedTargetDir)) {
        rmSync(resolvedTargetDir, { recursive: true, force: true });
      }
      try {
        execGit(primaryRepoRoot, ["worktree", "prune"]);
      } catch {
        // Best-effort rollback.
      }
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
            if (current && canonicalPath(current.path) === resolvedTargetDir) {
              delete latestRegistry.worktrees[slug];
              writeWorktreeRegistry(primaryRepoRoot, latestRegistry);
            }
          },
          deps.lockOptions,
        );
      } catch {
        // Best-effort rollback.
      }
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
    .filter((record) => {
      const normalized = canonicalPath(record.path);
      return activeByPath.has(normalized) && existsSync(normalized);
    })
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((record) => {
      const normalized = canonicalPath(record.path);
      const gitEntry = activeByPath.get(normalized);
      return {
        slug: record.slug,
        path: normalized,
        branch: gitEntry?.branch ?? record.branch,
        databaseName: record.databaseName,
        databaseUrl: record.databaseUrl,
        ports: record.ports,
      };
    });
};

export const cleanWorktree = async (
  options: CleanCliOptions & { primaryRepoRoot: string },
  deps: Pick<WorktreeDeps, "execGit" | "isPostgresReachable" | "dropDatabase" | "lockOptions"> = {},
): Promise<WorktreeCleanResult> => {
  const execGit = deps.execGit ?? defaultExecGit;
  const checkPostgres = deps.isPostgresReachable ?? (() => isLocalPostgresReachable());
  const dropDb = deps.dropDatabase ?? ((name) => dropLocalDatabase(name));

  const slug = validateWorktreeSlug(options.slug);
  const root = canonicalPath(options.primaryRepoRoot);
  const initialRegistry = readWorktreeRegistry(root);
  const record = initialRegistry.worktrees[slug];

  const worktreePath = record?.path ?? join(root, ".tmp", "worktrees", slug);
  const normalizedPath = canonicalPath(worktreePath);
  if (normalizedPath === root) {
    throw new Error("Refusing to remove the primary repository root.");
  }

  const branch = record?.branch ?? `worktree/${slug}`;
  const databaseName = record?.databaseName ?? databaseNameForSlug(slug);
  assertSafeManagedDatabaseName(databaseName);

  const gitWorktrees = getActiveGitWorktrees(root, execGit);
  const registeredInGit = gitWorktrees.some(
    (entry) => canonicalPath(entry.path) === normalizedPath,
  );

  let worktreeRemoved = false;
  if (registeredInGit) {
    if (existsSync(worktreePath)) {
      try {
        execGit(root, ["worktree", "remove", "--force", worktreePath]);
      } catch {
        rmSync(worktreePath, { recursive: true, force: true });
      }
    }
    worktreeRemoved = true;
  }
  if (existsSync(worktreePath)) {
    rmSync(worktreePath, { recursive: true, force: true });
    worktreeRemoved = true;
  }
  execGit(root, ["worktree", "prune"]);

  let databaseDropped = false;
  if (await checkPostgres()) {
    await dropDb(databaseName);
    databaseDropped = true;
  } else if (!options.json) {
    console.error(
      `Warning: PostgreSQL at 127.0.0.1:55432 is not reachable; skipped dropping database "${databaseName}".`,
    );
  }

  const registryRemoved = await withWorktreeRegistryLock(
    root,
    () => {
      const latestRegistry = readWorktreeRegistry(root);
      if (!(slug in latestRegistry.worktrees)) {
        return false;
      }
      delete latestRegistry.worktrees[slug];
      writeWorktreeRegistry(root, latestRegistry);
      return true;
    },
    deps.lockOptions,
  );

  let branchDeleted = false;
  const primaryBranch = currentBranchName(root, execGit);
  if (
    !options.keepBranch &&
    !PROTECTED_BRANCH_NAMES.has(branch) &&
    branch !== primaryBranch &&
    gitRefExists(root, `refs/heads/${branch}`, execGit)
  ) {
    execGit(root, ["branch", "-D", branch]);
    branchDeleted = true;
  }

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
