/**
 * Drops the `--` that `vp run <task> -- <args>` forwards ahead of a script's own arguments.
 */
export const stripLeadingSeparator = (args: readonly string[]): string[] =>
  args[0] === "--" ? args.slice(1) : [...args];

const LONG_OPTION_PATTERN = /^--[a-z0-9]/i;

/**
 * Returns the token after `flag`, or null when the flag is absent. A flag followed by nothing or by
 * another long option is an error, so a forgotten value never turns the next option into a value.
 */
export const readFlagValue = (args: readonly string[], flag: string): string | null => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (value === undefined || LONG_OPTION_PATTERN.test(value)) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
};

/** Returns a whole-number flag value of at least `min`, or null when the flag is absent. */
export const readIntegerFlag = (
  args: readonly string[],
  flag: string,
  min: number,
): number | null => {
  const raw = readFlagValue(args, flag);
  if (raw === null) {
    return null;
  }
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`${flag} must be a whole number of at least ${min} (got "${raw}").`);
  }
  return value;
};

/** Describes a caught value for a command's output. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Converts a repository-relative path to forward slashes without a leading `./`. */
export const normalizeRepoPath = (value: string): string =>
  value.replaceAll("\\", "/").replace(/^\.\//, "");
