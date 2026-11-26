/**
 * Drops the `--` that `vp run <task> -- <args>` forwards ahead of a script's own arguments.
 */
export const stripLeadingSeparator = (args: readonly string[]): string[] =>
  args[0] === "--" ? args.slice(1) : [...args];

/**
 * Returns the token after `flag`, or null when the flag is absent.
 */
export const readFlagValue = (args: readonly string[], flag: string): string | null => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
};

/** Describes a caught value for a command's output. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Converts a repository-relative path to forward slashes without a leading `./`. */
export const normalizeRepoPath = (value: string): string =>
  value.replaceAll("\\", "/").replace(/^\.\//, "");
