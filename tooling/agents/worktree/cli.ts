import { parseCliArgs } from "../../cli.ts";
import { cleanWorktree } from "./clean.ts";
import { createWorktree, type DatabaseMode } from "./create.ts";
import { defaultWorktreeDeps } from "./deps.ts";
import { formatCleanSummary, formatCreateSummary, formatListSummary } from "./format.ts";
import { defaultExecGit, resolvePrimaryRepoRoot } from "./git.ts";
import { listWorktrees } from "./list.ts";
import { validateWorktreeSlug } from "./naming.ts";

export type CreateCliOptions = {
  slug: string;
  base?: string;
  branch?: string;
  dir?: string;
  dbMode: DatabaseMode;
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

const CREATE_USAGE =
  "Usage: worktree:create <slug> [--base <ref>] [--branch <name>] [--dir <path>] [--with-db | --no-db] [--doctor] [--json]";
const CLEAN_USAGE = "Usage: worktree:clean <slug> [--keep-branch] [--json]";

const readSlug = (positionals: readonly string[], usage: string): string => {
  const [slug, extra] = positionals;
  if (!slug) {
    throw new Error(`Missing <slug>. ${usage}`);
  }
  if (extra !== undefined) {
    throw new Error(`Unexpected extra positional argument "${extra}".`);
  }
  return validateWorktreeSlug(slug);
};

/** Git would read a ref or path that starts with "-" as one of its own options. */
const readGitArgument = (value: string | undefined, flag: string): string | undefined => {
  if (value !== undefined && (value === "" || value.startsWith("-"))) {
    throw new Error(`${flag} requires a value that does not start with "-" (got "${value}").`);
  }
  return value;
};

const readDatabaseMode = (withDb: boolean | undefined, noDb: boolean | undefined): DatabaseMode => {
  if (withDb && noDb) {
    throw new Error("Cannot combine --with-db and --no-db.");
  }
  return withDb ? "required" : noDb ? "skip" : "auto";
};

export const parseCreateArgs = (args: readonly string[]): CreateCliOptions => {
  const { values, positionals } = parseCliArgs(args, {
    options: {
      base: { type: "string" },
      branch: { type: "string" },
      dir: { type: "string" },
      "with-db": { type: "boolean" },
      "no-db": { type: "boolean" },
      doctor: { type: "boolean" },
      json: { type: "boolean" },
    },
    usage: CREATE_USAGE,
    allowPositionals: true,
  });
  const slug = readSlug(positionals, CREATE_USAGE);
  const dbMode = readDatabaseMode(values["with-db"], values["no-db"]);
  return {
    slug,
    base: readGitArgument(values.base, "--base"),
    branch: readGitArgument(values.branch, "--branch"),
    dir: readGitArgument(values.dir, "--dir"),
    dbMode,
    doctor: values.doctor ?? false,
    json: values.json ?? false,
  };
};

export const parseListArgs = (args: readonly string[]): ListCliOptions => {
  const { values } = parseCliArgs(args, {
    options: { json: { type: "boolean" } },
    usage: "Usage: worktree:list [--json]",
  });
  return { json: values.json ?? false };
};

export const parseCleanArgs = (args: readonly string[]): CleanCliOptions => {
  const { values, positionals } = parseCliArgs(args, {
    options: { "keep-branch": { type: "boolean" }, json: { type: "boolean" } },
    usage: CLEAN_USAGE,
    allowPositionals: true,
  });
  return {
    slug: readSlug(positionals, CLEAN_USAGE),
    keepBranch: values["keep-branch"] ?? false,
    json: values.json ?? false,
  };
};

/** Prints a result as JSON, or as a summary preceded by any warnings on stderr. */
const report = <T>(
  json: boolean,
  { result, warnings }: { result: T; warnings: readonly string[] },
  summarize: (result: T) => string,
): void => {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const warning of warnings) {
    console.error(warning);
  }
  console.log(summarize(result));
};

type CommandContext = { primaryRepoRoot: string; cwd: string };

type Command = (args: readonly string[], context: CommandContext) => Promise<void>;

const COMMANDS = new Map<string | undefined, Command>([
  [
    "create",
    async (args, { primaryRepoRoot, cwd }) => {
      const { json, ...options } = parseCreateArgs(args);
      const outcome = await createWorktree(
        { ...options, primaryRepoRoot, cwd, quiet: json },
        defaultWorktreeDeps(primaryRepoRoot),
      );
      report(json, outcome, formatCreateSummary);
    },
  ],
  [
    "list",
    async (args, { primaryRepoRoot }) => {
      const { json } = parseListArgs(args);
      const worktrees = listWorktrees({ primaryRepoRoot }, { execGit: defaultExecGit });
      console.log(json ? JSON.stringify({ worktrees }, null, 2) : formatListSummary(worktrees));
    },
  ],
  [
    "clean",
    async (args, { primaryRepoRoot }) => {
      const { json, ...options } = parseCleanArgs(args);
      const outcome = await cleanWorktree(
        { ...options, primaryRepoRoot },
        defaultWorktreeDeps(primaryRepoRoot),
      );
      report(json, outcome, formatCleanSummary);
    },
  ],
]);

export const runWorktreeCli = async (argv: readonly string[], cwd: string): Promise<void> => {
  const [command, ...rest] = argv;
  const primaryRepoRoot = resolvePrimaryRepoRoot(cwd);
  const run = COMMANDS.get(command);
  if (!run) {
    throw new Error(
      `Unknown worktree command "${command ?? ""}". Expected "create", "list", or "clean".`,
    );
  }
  await run(rest, { primaryRepoRoot, cwd });
};
