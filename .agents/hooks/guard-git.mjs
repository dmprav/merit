import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const GLOBAL_VALUE_FLAGS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--exec-path",
  "--config-env",
]);

const PUSH_VALUE_FLAGS = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);

/** @returns {{ command?: string; eventCwd?: string }} */
const readHookInput = () => {
  try {
    const raw = readFileSync(0, "utf8").trim();
    if (!raw) {
      return {};
    }
    /** @type {unknown} */
    const payload = JSON.parse(raw);
    if (typeof payload !== "object" || payload === null) {
      return {};
    }
    const eventCwd =
      "cwd" in payload && typeof payload.cwd === "string" && payload.cwd.length > 0
        ? payload.cwd
        : undefined;
    if (!("tool_input" in payload)) {
      return { eventCwd };
    }
    const toolInput = payload.tool_input;
    if (typeof toolInput !== "object" || toolInput === null || !("command" in toolInput)) {
      return { eventCwd };
    }
    return {
      command: typeof toolInput.command === "string" ? toolInput.command : undefined,
      eventCwd,
    };
  } catch {
    return {};
  }
};

/**
 * Consume characters inside single or double quotes starting at `startIndex` (the opening quote).
 * @param {string} command
 * @param {number} startIndex
 * @param {string} quote
 * @returns {{ value: string; nextIndex: number; nested: string[] }}
 */
const readQuoted = (command, startIndex, quote) => {
  let value = "";
  /** @type {string[]} */
  const nested = [];
  let i = startIndex + 1;
  while (i < command.length) {
    const ch = command[i] ?? "";
    if (ch === quote) {
      return { value, nextIndex: i, nested };
    }
    if (quote === '"' && ch === "\\" && i + 1 < command.length) {
      if (command[i + 1] === "\n") {
        i += 2;
        continue;
      }
      value += command[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (quote === '"' && ch === "$" && command[i + 1] === "(") {
      const sub = readParens(command, i + 1);
      nested.push(sub.value);
      i = sub.nextIndex + 1;
      continue;
    }
    if (quote === '"' && ch === "`") {
      const sub = readBacktick(command, i);
      nested.push(sub.value);
      i = sub.nextIndex + 1;
      continue;
    }
    value += ch;
    i += 1;
  }
  return { value, nextIndex: i, nested };
};

/**
 * Consume a `(...)` group starting at the opening `(`.
 * @param {string} command
 * @param {number} startIndex
 * @returns {{ value: string; nextIndex: number }}
 */
const readParens = (command, startIndex) => {
  let depth = 0;
  let quote = "";
  let value = "";
  for (let i = startIndex; i < command.length; i += 1) {
    const ch = command[i] ?? "";
    if (quote) {
      if (quote === '"' && ch === "\\" && i + 1 < command.length) {
        value += ch + (command[i + 1] ?? "");
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = "";
      }
      value += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      value += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      if (depth > 1) {
        value += ch;
      }
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return { value, nextIndex: i };
      }
      value += ch;
    } else {
      value += ch;
    }
  }
  return { value, nextIndex: command.length };
};

/**
 * Consume a `` `...` `` command substitution starting at the opening backtick.
 * @param {string} command
 * @param {number} startIndex
 * @returns {{ value: string; nextIndex: number }}
 */
const readBacktick = (command, startIndex) => {
  let value = "";
  for (let i = startIndex + 1; i < command.length; i += 1) {
    const ch = command[i] ?? "";
    if (ch === "\\" && i + 1 < command.length) {
      value += command[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (ch === "`") {
      return { value, nextIndex: i };
    }
    value += ch;
  }
  return { value, nextIndex: command.length };
};

/**
 * Split a shell command into segments of unquoted-boundary-aware argument arrays
 * while preserving quoted values and inspecting nested command substitutions.
 *
 * @param {string} command
 * @returns {string[][]}
 */
const tokenizeSegments = (command) => {
  /** @type {string[][]} */
  const segments = [];
  /** @type {string[]} */
  const nestedCommands = [];
  /** @type {string[]} */
  let tokens = [];
  let current = "";
  let inToken = false;

  const flushToken = () => {
    if (inToken) {
      tokens.push(current);
      current = "";
      inToken = false;
    }
  };

  const flushSegment = () => {
    flushToken();
    if (tokens.length > 0) {
      segments.push(tokens);
      tokens = [];
    }
  };

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i] ?? "";
    if (ch === "'" || ch === '"') {
      const quoted = readQuoted(command, i, ch);
      current += quoted.value;
      nestedCommands.push(...quoted.nested);
      inToken = true;
      i = quoted.nextIndex;
    } else if (ch === "`") {
      const sub = readBacktick(command, i);
      nestedCommands.push(sub.value);
      i = sub.nextIndex;
    } else if (ch === "\\" && i + 1 < command.length) {
      if (command[i + 1] !== "\n") {
        current += command[i + 1] ?? "";
        inToken = true;
      }
      i += 1;
    } else if (ch === "\n" || ch === ";" || ch === "(" || ch === ")") {
      flushSegment();
    } else if (ch === "&" || ch === "|") {
      if (command[i + 1] === ch) {
        i += 1;
      }
      flushSegment();
    } else if (/\s/.test(ch)) {
      flushToken();
    } else {
      current += ch;
      inToken = true;
    }
  }

  flushSegment();
  for (const sub of nestedCommands) {
    segments.push(...tokenizeSegments(sub));
  }
  return segments;
};

/** @param {string} cwd */
const currentBranch = (cwd) => {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

/** @param {string} cwd */
const checkoutKey = (cwd) => {
  try {
    const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return gitDir ? resolve(cwd, gitDir) : cwd;
  } catch {
    return cwd;
  }
};

/** @param {string[]} tokens */
const hasCleanForceAndDir = (tokens) => {
  let hasForce = false;
  let hasDir = false;
  for (const token of tokens) {
    if (token === "--force") {
      hasForce = true;
    } else if (/^-[A-Za-z]+$/.test(token)) {
      if (token.includes("f")) {
        hasForce = true;
      }
      if (token.includes("d")) {
        hasDir = true;
      }
    }
  }
  return hasForce && hasDir;
};

/** @param {string} token */
const isForceFlag = (token) =>
  token === "--force" ||
  /^-[A-Za-z]*f[A-Za-z]*$/.test(token) ||
  token.startsWith("--force-with-lease") ||
  token.startsWith("--force-if-includes");

/**
 * Extract positional arguments to `git push` (skipping flags and option values).
 * @param {string[]} args
 * @returns {string[]}
 */
const extractPushPositionals = (args) => {
  /** @type {string[]} */
  const positionals = [];
  let afterDoubleDash = false;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i] ?? "";
    if (afterDoubleDash) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      afterDoubleDash = true;
      continue;
    }
    if (PUSH_VALUE_FLAGS.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    positionals.push(token);
  }
  return positionals;
};

/**
 * Extract target branch name from `git switch` or `git checkout`, ignoring checkout pathspecs.
 * @param {string} subcommand
 * @param {string[]} subArgs
 * @returns {string | null}
 */
const extractSwitchedBranch = (subcommand, subArgs) => {
  if (subcommand !== "switch" && subcommand !== "checkout") {
    return null;
  }
  const valueFlags = new Set(["-b", "-B", "-c", "-C", "--orphan"]);
  const hasCreateFlag = subArgs.some((token) => valueFlags.has(token));
  if (subcommand === "checkout" && subArgs.includes("--") && !hasCreateFlag) {
    return null;
  }
  /** @type {string | null} */
  let seenPositional = null;
  let afterDoubleDash = false;
  for (let i = 0; i < subArgs.length; i += 1) {
    const token = subArgs[i] ?? "";
    if (!afterDoubleDash && token === "--") {
      afterDoubleDash = true;
      continue;
    }
    if (!afterDoubleDash && valueFlags.has(token)) {
      return subArgs[i + 1] ?? null;
    }
    if (afterDoubleDash || !token.startsWith("-")) {
      if (seenPositional !== null) {
        return null;
      }
      seenPositional = token;
    }
  }
  return seenPositional;
};

/** @param {string} pattern */
const matchesMainGlob = (pattern) => {
  if (!pattern) {
    return false;
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`);
  return regex.test("main") || regex.test("refs/heads/main");
};

/**
 * @param {string} spec
 * @param {string} branchName
 */
const refspecTargetsMain = (spec, branchName) => {
  const clean = spec.startsWith("+") ? spec.slice(1) : spec;
  if (clean === ":") {
    return true;
  }
  const colon = clean.indexOf(":");
  if (colon !== -1) {
    const dst = clean.slice(colon + 1);
    return matchesMainGlob(dst) || ((dst === "" || dst === "HEAD") && branchName === "main");
  }
  return matchesMainGlob(clean) || (clean === "HEAD" && branchName === "main");
};

/**
 * @param {string[]} refspecs
 * @param {string} branchName
 */
const targetsMain = (refspecs, branchName) => {
  if (refspecs.some((spec) => refspecTargetsMain(spec, branchName))) {
    return true;
  }
  if (refspecs.length === 0) {
    return branchName === "main";
  }
  return false;
};

/**
 * Parse global git options before the subcommand so `-C <dir>`, `--git-dir=...`, etc.
 * do not hide the subcommand or use the wrong checkout for branch lookup.
 *
 * @param {string[]} tokens
 * @param {string} cwd
 * @returns {{ subcommand: string; subArgs: string[]; targetCwd: string } | null}
 */
const parseGitInvocation = (tokens, cwd) => {
  let index = 0;
  while (
    index < tokens.length &&
    (tokens[index] === "{" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] ?? ""))
  ) {
    index += 1;
  }
  if (tokens[index] !== "git") {
    return null;
  }
  index += 1;
  let targetCwd = cwd;

  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (token === "-C") {
      const dir = tokens[index + 1];
      if (dir) {
        targetCwd = resolve(targetCwd, dir);
        index += 2;
        continue;
      }
      break;
    }
    if (token.startsWith("-C") && token.length > 2) {
      targetCwd = resolve(targetCwd, token.slice(2));
      index += 1;
      continue;
    }
    if (GLOBAL_VALUE_FLAGS.has(token)) {
      index += 2;
      continue;
    }
    if (token.startsWith("-")) {
      index += 1;
      continue;
    }
    return {
      subcommand: token,
      subArgs: tokens.slice(index + 1),
      targetCwd,
    };
  }
  return null;
};

/**
 * @param {string[]} tokens
 * @param {string} cwd
 * @param {Set<string>} mayBeOnMain
 * @returns {string | null}
 */
const checkSegment = (tokens, cwd, mayBeOnMain) => {
  const parsed = parseGitInvocation(tokens, cwd);
  if (!parsed) {
    return null;
  }
  const { subcommand, subArgs, targetCwd } = parsed;
  const repoKey = checkoutKey(targetCwd);
  const switchedBranch = extractSwitchedBranch(subcommand, subArgs);
  if (switchedBranch === "main") {
    mayBeOnMain.add(repoKey);
  }
  if (subcommand === "reset" && subArgs.includes("--hard")) {
    return "git reset --hard";
  }
  if (subcommand === "clean" && hasCleanForceAndDir(subArgs)) {
    return "git clean -fd";
  }
  if (subcommand === "push") {
    if (subArgs.includes("--mirror")) {
      return "git push --force to main";
    }
    const hasForceFlag = subArgs.some(isForceFlag);
    const hasAllOrBranches = subArgs.includes("--all") || subArgs.includes("--branches");
    if (hasForceFlag && hasAllOrBranches) {
      return "git push --force to main";
    }
    const branchName = mayBeOnMain.has(repoKey) ? "main" : currentBranch(targetCwd);
    const refspecs = extractPushPositionals(subArgs).slice(1);
    const hasForcedMainRefspec = refspecs.some(
      (spec) => spec.startsWith("+") && refspecTargetsMain(spec, branchName),
    );
    if ((hasForceFlag && targetsMain(refspecs, branchName)) || hasForcedMainRefspec) {
      return "git push --force to main";
    }
  }
  return null;
};

const main = () => {
  if (process.env.MERIT_ALLOW_DESTRUCTIVE_GIT === "1") {
    process.exit(0);
  }
  const { command, eventCwd } = readHookInput();
  if (!command) {
    process.exit(0);
  }

  const cwd = eventCwd || process.cwd();
  const segments = tokenizeSegments(command);
  /** @type {Set<string>} */
  const mayBeOnMain = new Set();
  for (const tokens of segments) {
    const blocked = checkSegment(tokens, cwd, mayBeOnMain);
    if (blocked) {
      process.stderr.write(
        `Blocked destructive git command (${blocked}). Set MERIT_ALLOW_DESTRUCTIVE_GIT=1 to override intentionally.\n`,
      );
      process.exit(2);
    }
  }
};

main();
