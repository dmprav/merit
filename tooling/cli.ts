import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

/**
 * Drops the `--` that `vp run <task> -- <args>` forwards ahead of a script's own arguments.
 */
export const stripLeadingSeparator = (args: readonly string[]): string[] =>
  args[0] === "--" ? args.slice(1) : [...args];

const LONG_OPTION_PATTERN = /^--[a-z0-9]/i;

/**
 * Strict `util.parseArgs` rejects a separate value that starts with "-", so "--reason -retry later"
 * would fail. Joining each string option with the token after it keeps such text a value, while a
 * missing value or a following long option is still an error rather than silently becoming the value.
 */
const attachOptionValues = (args: readonly string[], options: ParseArgsOptionsConfig): string[] => {
  const attached: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    if (token === "--") {
      attached.push(...args.slice(index));
      break;
    }
    const name = token.slice(2);
    if (
      !token.startsWith("--") ||
      !Object.hasOwn(options, name) ||
      options[name]?.type !== "string"
    ) {
      attached.push(token);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value === "--" || LONG_OPTION_PATTERN.test(value)) {
      const hint = value?.startsWith("--")
        ? ` To pass "${value}" as its value, write ${token}=${value}.`
        : "";
      throw new Error(`${token} requires a value.${hint}`);
    }
    attached.push(`${token}=${value}`);
    index += 1;
  }
  return attached;
};

export type CliSpec<O extends ParseArgsOptionsConfig> = {
  options: O;
  /** Appended to every argument error so the caller sees the accepted form. */
  usage: string;
  allowPositionals?: boolean;
};

/**
 * Parses a script's arguments with `util.parseArgs` in strict mode after dropping a leading `--`.
 * Unknown options, missing values, values on boolean flags, and unexpected positionals are errors;
 * `--flag=value` and `--flag value` are both accepted.
 */
export const parseCliArgs = <const O extends ParseArgsOptionsConfig>(
  args: readonly string[],
  { options, usage, allowPositionals = false }: CliSpec<O>,
) => {
  try {
    const parsed = parseArgs({
      args: attachOptionValues(stripLeadingSeparator(args), options),
      options,
      strict: true,
      allowPositionals,
    });
    const positionals: string[] = parsed.positionals;
    return { values: parsed.values, positionals };
  } catch (error) {
    throw new Error(`${errorMessage(error)}\n${usage}`, { cause: error });
  }
};

/**
 * Reads a whole number of at least `min` from a flag value or positional. Signs, leading zeros,
 * decimals, exponents, and trailing text are rejected rather than truncated, so "12abc" never means 12.
 */
export const parseWholeNumber = (raw: string, name: string, min: 0 | 1 = 1): number => {
  const value = Number(raw);
  if (!/^(?:0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`${name} must be a whole number of at least ${min} (got "${raw}").`);
  }
  return value;
};

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
