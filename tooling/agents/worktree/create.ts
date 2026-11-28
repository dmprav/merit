import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { buildLocalDatabaseUrl } from "../../scripts/local-postgres.ts";
import { readWorktreeGitDir, writeCheckoutToken } from "./checkout-identity.ts";
import { createRefusal, isClaimOwnerAlive, isCreateClaimAt, withoutOwner } from "./claims.ts";
import { LOCAL_POSTGRES_ADDRESS, type WorktreeDatabase } from "./database.ts";
import { type WorktreeDeps } from "./deps.ts";
import { formatWorktreeEnvFile } from "./env-file.ts";
import { type GitWorktreeEntry, type RepoGit, repoGit } from "./git.ts";
import {
  databaseNameForSlug,
  defaultBranchForSlug,
  isProtectedBranch,
  validateWorktreeSlug,
} from "./naming.ts";
import { canonicalPath, containsPath, defaultWorktreePath, pathsOverlap } from "./paths.ts";
import { allocateWorktreePorts, type WorktreePorts } from "./ports.ts";
import {
  readWorktreeRegistry,
  updateRecord,
  type WorktreeRegistry,
  withWorktreeRegistryLock,
  writeWorktreeRegistry,
} from "./registry.ts";
import { portsInUse } from "./reserved-ports.ts";
import { type CreateAttempt, type CreateProgress, rollBackCreate } from "./rollback.ts";

export type DatabaseMode = "auto" | "required" | "skip";

export type CreateWorktreeRequest = {
  primaryRepoRoot: string;
  /** The directory a relative `dir` is resolved against; defaults to the primary checkout. */
  cwd?: string;
  slug: string;
  base?: string;
  branch?: string;
  dir?: string;
  dbMode: DatabaseMode;
  doctor: boolean;
  /** Capture bootstrap command output instead of passing it through to the terminal. */
  quiet: boolean;
};

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

export type WorktreeCreateOutcome = { result: WorktreeCreateResult; warnings: string[] };

type CreatePlan = {
  slug: string;
  targetDir: string;
  branch: string;
  baseRef: string;
  databaseName: string;
  databaseUrl: string;
  checkoutToken: string;
};

type CreateRun = {
  request: CreateWorktreeRequest;
  plan: CreatePlan;
  progress: CreateProgress;
  git: RepoGit;
  deps: WorktreeDeps;
};

const planCreate = (request: CreateWorktreeRequest, git: RepoGit): CreatePlan => {
  const slug = validateWorktreeSlug(request.slug);
  const invokeCwd = request.cwd ? resolve(request.cwd) : git.root;
  const targetDir = request.dir
    ? resolve(invokeCwd, request.dir)
    : defaultWorktreePath(git.root, slug);
  if (containsPath(targetDir, git.root)) {
    throw new Error("Refusing to create a worktree at or containing the primary repository root.");
  }
  const branch = request.branch ?? defaultBranchForSlug(slug);
  if (isProtectedBranch(branch)) {
    throw new Error(`Refusing to use protected branch name "${branch}" for a worktree.`);
  }
  const baseRef = git.resolveBaseRef(request.base);
  const databaseName = databaseNameForSlug(slug);
  return {
    slug,
    targetDir,
    branch,
    baseRef,
    databaseName,
    databaseUrl: buildLocalDatabaseUrl(databaseName),
    checkoutToken: randomUUID(),
  };
};

/** Checks PostgreSQL before any Git or pnpm work, so `--with-db` fails fast when it is down. */
const checkDatabase = async (
  dbMode: DatabaseMode,
  database: WorktreeDatabase,
): Promise<boolean> => {
  if (dbMode === "skip") {
    return false;
  }
  const reachable = await database.isReachable();
  if (dbMode === "required" && !reachable) {
    throw new Error(
      `PostgreSQL is not reachable at ${LOCAL_POSTGRES_ADDRESS} (--with-db was requested). Start services with \`vp run services:start\` and retry.`,
    );
  }
  return reachable;
};

const assertNoWorktreePathOverlap = (
  targetDir: string,
  primaryRepoRoot: string,
  gitWorktrees: readonly GitWorktreeEntry[],
  registry?: WorktreeRegistry,
): void => {
  const existingPaths = new Set(
    [
      ...gitWorktrees.map((entry) => entry.path),
      ...Object.values(registry?.worktrees ?? {}).map((record) => record.path),
    ].map((path) => canonicalPath(path)),
  );
  existingPaths.delete(primaryRepoRoot);
  for (const existingPath of existingPaths) {
    if (pathsOverlap(targetDir, existingPath)) {
      throw new Error(
        `Target directory "${targetDir}" overlaps existing worktree "${existingPath}". Choose a different --dir.`,
      );
    }
  }
};

const assertTargetAndBranchFree = ({ plan, git }: CreateRun): void => {
  if (existsSync(plan.targetDir)) {
    throw new Error(
      `Target directory "${plan.targetDir}" already exists. Choose a different --dir or clean it up first.`,
    );
  }
  if (git.branchExists(plan.branch)) {
    throw new Error(
      `Branch "${plan.branch}" already exists. Choose a different --branch or delete the existing branch first.`,
    );
  }
};

const addCheckout = ({ plan, progress, git }: CreateRun): void => {
  mkdirSync(dirname(plan.targetDir), { recursive: true });
  // Creating the branch separately makes Git reject a name already in use.
  git.run(["branch", plan.branch, plan.baseRef]);
  progress.branchCreated = true;
  git.run(["worktree", "add", plan.targetDir, plan.branch]);
  progress.checkoutPath = canonicalPath(plan.targetDir);
  const gitDir = readWorktreeGitDir(progress.checkoutPath);
  if (!gitDir) {
    throw new Error(`Could not identify the linked checkout at "${progress.checkoutPath}".`);
  }
  writeCheckoutToken(gitDir, plan.checkoutToken);
  // Recorded only once the token is in place: rollback then requires it, and before that it
  // proves ownership through the checkout's branch and back-link instead.
  progress.gitDir = gitDir;
};

const recordCreating = (run: CreateRun, registry: WorktreeRegistry, ports: WorktreePorts) => {
  const { plan, progress, git, deps } = run;
  registry.worktrees[plan.slug] = {
    slug: plan.slug,
    path: progress.checkoutPath,
    gitDir: progress.gitDir,
    checkoutToken: plan.checkoutToken,
    branch: plan.branch,
    baseRef: plan.baseRef,
    databaseName: plan.databaseName,
    databaseUrl: plan.databaseUrl,
    databaseCreated: false,
    ports,
    createdAt: deps.now().toISOString(),
    status: "creating",
    ownerPid: process.pid,
  };
  writeWorktreeRegistry(git.root, registry);
  progress.registryReserved = true;
};

/**
 * Under the registry lock, checks that the slug, target, and branch are free, allocates ports,
 * adds the checkout, and records it as `creating` so no concurrent operation takes them.
 */
const reserveCheckout = async (run: CreateRun): Promise<WorktreePorts> => {
  const { plan, git, deps } = run;
  const registry = readWorktreeRegistry(git.root);
  const gitWorktrees = git.worktrees();
  const existing = registry.worktrees[plan.slug];
  const refusal = createRefusal(
    plan.slug,
    existing,
    Boolean(existing && isClaimOwnerAlive(existing)),
  );
  if (refusal) {
    throw new Error(refusal);
  }
  assertNoWorktreePathOverlap(plan.targetDir, git.root, gitWorktrees, registry);
  assertTargetAndBranchFree(run);

  const activePaths = new Set(gitWorktrees.map((entry) => canonicalPath(entry.path)));
  const ports = await allocateWorktreePorts({
    reservedPorts: portsInUse(git.root, registry, activePaths),
    checkPortAvailable: deps.checkPortAvailable,
  });

  // Re-check after async port probes in case an external process created an overlapping
  // Git worktree, target path, or branch while waiting.
  assertNoWorktreePathOverlap(plan.targetDir, git.root, git.worktrees());
  assertTargetAndBranchFree(run);

  addCheckout(run);
  recordCreating(run, registry, ports);
  return ports;
};

const bootstrapCheckout = async ({ request, progress, deps }: CreateRun): Promise<void> => {
  const options = { cwd: progress.checkoutPath, quiet: request.quiet };
  await deps.execCommand("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], options);
  const localVp = join(progress.checkoutPath, "node_modules/.bin/vp");
  await deps.execCommand(existsSync(localVp) ? localVp : "vp", ["config", "--no-agent"], options);
};

/** Creates the worktree's database when PostgreSQL is up, returning a warning when it was skipped. */
const createDatabase = async (run: CreateRun, postgresReachable: boolean): Promise<string[]> => {
  const { request, plan, progress, deps } = run;
  if (request.dbMode === "skip") {
    return [];
  }
  if (!postgresReachable) {
    return [
      `Warning: PostgreSQL at ${LOCAL_POSTGRES_ADDRESS} is not reachable; skipped creating database "${plan.databaseName}".`,
    ];
  }
  progress.databaseCreated = (await deps.database.ensure(plan.databaseName)).created;
  return [];
};

const runDoctor = async ({ request, plan, progress, git, deps }: CreateRun): Promise<void> => {
  if (!request.doctor) {
    return;
  }
  if (progress.databaseCreated) {
    await updateRecord(
      git.root,
      plan.slug,
      {
        when: isCreateClaimAt(progress.checkoutPath),
        apply: (record) => ({ ...record, databaseCreated: true }),
      },
      deps.lockOptions,
    );
  }
  const doctorScript = join(progress.checkoutPath, ".agents/install-environment.sh");
  if (existsSync(doctorScript)) {
    await deps.execCommand("bash", [doctorScript, "--doctor"], {
      cwd: progress.checkoutPath,
      quiet: request.quiet,
    });
  }
};

const activateRecord = async ({ plan, progress, git, deps }: CreateRun): Promise<void> => {
  await updateRecord(
    git.root,
    plan.slug,
    {
      when: isCreateClaimAt(progress.checkoutPath),
      apply: (record) => ({
        ...withoutOwner(record),
        databaseCreated: progress.databaseCreated,
        status: "active",
      }),
    },
    deps.lockOptions,
  );
};

const buildWorktree = async (
  run: CreateRun,
  postgresReachable: boolean,
): Promise<WorktreeCreateOutcome> => {
  const { plan, progress, git, deps } = run;
  const ports = await withWorktreeRegistryLock(
    git.root,
    () => reserveCheckout(run),
    deps.lockOptions,
  );
  writeFileSync(
    join(progress.checkoutPath, ".env.local"),
    formatWorktreeEnvFile({ slug: plan.slug, databaseUrl: plan.databaseUrl, ports }),
    "utf8",
  );
  await bootstrapCheckout(run);
  const warnings = await createDatabase(run, postgresReachable);
  await runDoctor(run);
  await activateRecord(run);
  return {
    result: {
      slug: plan.slug,
      path: progress.checkoutPath,
      branch: plan.branch,
      baseRef: plan.baseRef,
      databaseName: plan.databaseName,
      databaseUrl: plan.databaseUrl,
      databaseCreated: progress.databaseCreated,
      ports,
    },
    warnings,
  };
};

const attemptOf = ({ plan, git, deps }: CreateRun): CreateAttempt => ({
  slug: plan.slug,
  branch: plan.branch,
  databaseName: plan.databaseName,
  checkoutToken: plan.checkoutToken,
  git,
  database: deps.database,
  lockOptions: deps.lockOptions,
});

/**
 * Creates an isolated checkout with its own branch, ports, `.env.local`, and database. A failure
 * after the checkout is reserved rolls back what this attempt created and nothing else.
 */
export const createWorktree = async (
  request: CreateWorktreeRequest,
  deps: WorktreeDeps,
): Promise<WorktreeCreateOutcome> => {
  const git = repoGit(canonicalPath(request.primaryRepoRoot), deps.execGit);
  const plan = planCreate(request, git);
  const postgresReachable = await checkDatabase(request.dbMode, deps.database);
  const run: CreateRun = {
    request,
    plan,
    git,
    deps,
    progress: {
      branchCreated: false,
      checkoutPath: canonicalPath(plan.targetDir),
      registryReserved: false,
      databaseCreated: false,
    },
  };
  try {
    return await buildWorktree(run, postgresReachable);
  } catch (error) {
    throw await rollBackCreate(attemptOf(run), run.progress, error);
  }
};
