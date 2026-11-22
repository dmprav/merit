import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const REQUIRED_HOOK_FILES = ["pre-commit", "commit-msg"];

/** @returns {string | undefined} */
const readEventCwd = () => {
  try {
    const raw = readFileSync(0, "utf8").trim();
    if (!raw) {
      return undefined;
    }
    /** @type {unknown} */
    const payload = JSON.parse(raw);
    if (typeof payload !== "object" || payload === null) {
      return undefined;
    }
    return "cwd" in payload && typeof payload.cwd === "string" && payload.cwd.length > 0
      ? payload.cwd
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * @param {string[]} args
 * @param {string} cwd
 */
const git = (args, cwd) => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

const cwd = readEventCwd() || process.cwd();
const repoRoot = git(["rev-parse", "--show-toplevel"], cwd) || cwd;
const hooksPath = git(["config", "--get", "core.hooksPath"], repoRoot);
const hooksDir = hooksPath
  ? isAbsolute(hooksPath)
    ? hooksPath
    : resolve(repoRoot, hooksPath)
  : "";
const hooksInstalled =
  hooksPath.startsWith(".vite-hooks") &&
  Boolean(hooksDir) &&
  existsSync(hooksDir) &&
  REQUIRED_HOOK_FILES.every((file) => existsSync(resolve(hooksDir, file)));

if (!hooksInstalled) {
  const reason = hooksPath
    ? `core.hooksPath is ${hooksPath}, expected installed hook files`
    : "core.hooksPath is unset";
  const message = `Warning: Git hooks are inactive (${reason}). Run: vp config --no-agent\n`;
  process.stdout.write(message);
  process.stderr.write(message);
}
