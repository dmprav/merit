import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** @returns {string | undefined} */
const readBashCommand = () => {
  try {
    const raw = readFileSync(0, "utf8").trim();
    if (!raw) {
      return undefined;
    }
    /** @type {unknown} */
    const payload = JSON.parse(raw);
    if (typeof payload !== "object" || payload === null || !("tool_input" in payload)) {
      return undefined;
    }
    const toolInput = payload.tool_input;
    if (typeof toolInput !== "object" || toolInput === null || !("command" in toolInput)) {
      return undefined;
    }
    return typeof toolInput.command === "string" ? toolInput.command : undefined;
  } catch {
    return undefined;
  }
};

/** @param {string} command */
const stripQuotes = (command) =>
  command
    .replace(/\\./g, " ")
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

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
 * @param {string[]} args
 * @param {string} cwd
 */
const targetsMain = (args, cwd) => {
  const positionals = args.filter((token) => !token.startsWith("-") && token !== "push");
  const refspecs = positionals.slice(1);
  if (
    refspecs.some(
      (spec) =>
        spec === "main" ||
        spec === "+main" ||
        spec.endsWith(":main") ||
        spec.endsWith(":refs/heads/main"),
    )
  ) {
    return true;
  }
  if (refspecs.length === 0) {
    return currentBranch(cwd) === "main";
  }
  return false;
};

/**
 * @param {string} segment
 * @param {string} cwd
 * @returns {string | null}
 */
const checkSegment = (segment, cwd) => {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] !== "git") {
    return null;
  }
  const rest = tokens.slice(1);
  if (rest[0] === "reset" && rest.includes("--hard")) {
    return "git reset --hard";
  }
  if (rest[0] === "clean" && hasCleanForceAndDir(rest.slice(1))) {
    return "git clean -fd";
  }
  if (rest[0] === "push" && rest.some(isForceFlag) && targetsMain(rest, cwd)) {
    return "git push --force to main";
  }
  return null;
};

const main = () => {
  if (process.env.MERIT_ALLOW_DESTRUCTIVE_GIT === "1") {
    process.exit(0);
  }
  const command = readBashCommand();
  if (!command) {
    process.exit(0);
  }

  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const unquoted = stripQuotes(command);
  const segments = unquoted.split(/&&|\|\||[;\n|]/);
  for (const segment of segments) {
    const blocked = checkSegment(segment, cwd);
    if (blocked) {
      process.stderr.write(
        `Blocked destructive git command (${blocked}). Set MERIT_ALLOW_DESTRUCTIVE_GIT=1 to override intentionally.\n`,
      );
      process.exit(2);
    }
  }
};

main();
