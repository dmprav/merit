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
 * @returns {{ value: string; nextIndex: number }}
 */
const readQuoted = (command, startIndex, quote) => {
  let value = "";
  let i = startIndex + 1;
  while (i < command.length) {
    const ch = command[i] ?? "";
    if (ch === quote) {
      return { value, nextIndex: i };
    }
    if (quote === '"' && ch === "\\" && i + 1 < command.length) {
      value += command[i + 1] ?? "";
      i += 2;
      continue;
    }
    value += ch;
    i += 1;
  }
  return { value, nextIndex: i };
};

/**
 * Split a shell command into segments of unquoted-boundary-aware argument arrays
 * while preserving quoted values (e.g. `git reset "--hard"` -> `["git", "reset", "--hard"]`,
 * `git commit -m "avoid git reset --hard"` -> single argument token).
 *
 * @param {string} command
 * @returns {string[][]}
 */
const tokenizeSegments = (command) => {
  /** @type {string[][]} */
  const segments = [];
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
      inToken = true;
      i = quoted.nextIndex;
    } else if (ch === "\\" && i + 1 < command.length) {
      current += command[i + 1] ?? "";
      inToken = true;
      i += 1;
    } else if (ch === "\n" || ch === ";") {
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
  token === "-f" ||
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
 * @param {string} spec
 * @param {string} cwd
 */
const refspecTargetsMain = (spec, cwd) => {
  const clean = spec.startsWith("+") ? spec.slice(1) : spec;
  const colon = clean.indexOf(":");
  if (colon !== -1) {
    const dst = clean.slice(colon + 1);
    return (
      dst === "main" || dst === "refs/heads/main" || (dst === "" && currentBranch(cwd) === "main")
    );
  }
  return clean === "main" || clean === "refs/heads/main";
};

/**
 * @param {string[]} refspecs
 * @param {string} cwd
 */
const targetsMain = (refspecs, cwd) => {
  if (refspecs.some((spec) => refspecTargetsMain(spec, cwd))) {
    return true;
  }
  if (refspecs.length === 0) {
    return currentBranch(cwd) === "main";
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
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] ?? "")) {
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
 * @returns {string | null}
 */
const checkSegment = (tokens, cwd) => {
  const parsed = parseGitInvocation(tokens, cwd);
  if (!parsed) {
    return null;
  }
  const { subcommand, subArgs, targetCwd } = parsed;
  if (subcommand === "reset" && subArgs.includes("--hard")) {
    return "git reset --hard";
  }
  if (subcommand === "clean" && hasCleanForceAndDir(subArgs)) {
    return "git clean -fd";
  }
  if (subcommand === "push") {
    const refspecs = extractPushPositionals(subArgs).slice(1);
    const hasForceFlag = subArgs.some(isForceFlag);
    const hasForcedMainRefspec = refspecs.some(
      (spec) => spec.startsWith("+") && refspecTargetsMain(spec, targetCwd),
    );
    if ((hasForceFlag && targetsMain(refspecs, targetCwd)) || hasForcedMainRefspec) {
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
  for (const tokens of segments) {
    const blocked = checkSegment(tokens, cwd);
    if (blocked) {
      process.stderr.write(
        `Blocked destructive git command (${blocked}). Set MERIT_ALLOW_DESTRUCTIVE_GIT=1 to override intentionally.\n`,
      );
      process.exit(2);
    }
  }
};

main();
