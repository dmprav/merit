import { execFileSync } from "node:child_process";

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let hooksPath = "";
try {
  hooksPath = execFileSync("git", ["config", "--get", "core.hooksPath"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  hooksPath = "";
}

if (!hooksPath.startsWith(".vite-hooks")) {
  const message = `Warning: Git hooks are inactive (core.hooksPath is ${hooksPath || "unset"}). Run: vp config --no-agent\n`;
  process.stdout.write(message);
  process.stderr.write(message);
}
