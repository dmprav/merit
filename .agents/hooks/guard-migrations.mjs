import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const MIGRATIONS_PREFIX = "foundation/db/database/migrations/";

/** @param {string} value */
const toPosix = (value) => value.replaceAll("\\", "/");

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

/** @returns {{ targetPath?: string; eventCwd?: string }} */
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
    if (typeof toolInput !== "object" || toolInput === null) {
      return { eventCwd };
    }
    if ("file_path" in toolInput && typeof toolInput.file_path === "string") {
      return { targetPath: toolInput.file_path, eventCwd };
    }
    if ("path" in toolInput && typeof toolInput.path === "string") {
      return { targetPath: toolInput.path, eventCwd };
    }
    return { eventCwd };
  } catch {
    return {};
  }
};

/** @param {string} cwd */
const baseRef = (cwd) => {
  for (const ref of ["origin/main", "main", "HEAD"]) {
    if (git(["rev-parse", "--verify", "--quiet", ref], cwd)) {
      return ref;
    }
  }
  return "";
};

const main = () => {
  const { targetPath, eventCwd } = readHookInput();
  if (!targetPath) {
    process.exit(0);
  }

  const cwd = eventCwd || process.cwd();
  const repoRoot = git(["rev-parse", "--show-toplevel"], cwd) || cwd;
  const resolved = isAbsolute(targetPath) ? targetPath : resolve(cwd, targetPath);
  const relPath = toPosix(relative(repoRoot, resolved));

  if (!relPath.startsWith(MIGRATIONS_PREFIX) || !relPath.endsWith(".sql")) {
    process.exit(0);
  }

  const ref = baseRef(repoRoot);
  if (!ref) {
    process.exit(0);
  }

  const existing = git(["ls-tree", "-r", "--name-only", ref, "--", relPath], repoRoot);
  if (existing === relPath) {
    process.stderr.write(
      `Blocked: "${relPath}" is an already-committed SQL migration (${ref}). Generate a new migration with Drizzle instead of modifying applied migrations.\n`,
    );
    process.exit(2);
  }
};

main();
