import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const version = "1.10.0";
const binary = process.platform === "darwin" ? "betterleaks-v1" : "betterleaks";
const mode = process.argv[2] ?? "files";

if (process.argv.length > 3 || !["files", "staged", "history"].includes(mode)) {
  throw new Error("Expected secrets.ts [files|staged|history].");
}

const installed = spawnSync(binary, ["version"], { encoding: "utf8" });

if (installed.error || installed.status !== 0 || installed.stdout.trim() !== version) {
  throw new Error(
    `Install Betterleaks ${version} as ${binary}; see docs/guides/development.md#security-tools.`,
  );
}

const options = [
  "--config",
  fileURLToPath(new URL("../../.betterleaks.toml", import.meta.url)),
  "--redact",
  "--verbose",
  "--no-banner",
  "--no-color",
  "--validation=false",
];

const scan = (args: string[]) => {
  const result = spawnSync(binary, [...args, ...options], { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
};

if (mode === "files") {
  // Git selects source, including new files and force-added ignored files, without local secrets or build output.
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--deduplicate", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => path && existsSync(path))
    .map((path) => `./${path}`);

  // Bound argument size so large workspaces fit the operating system's command-line limit.
  for (let offset = 0; offset < paths.length; offset += 128) {
    scan(["dir", ...paths.slice(offset, offset + 128)]);
  }
} else {
  scan(
    mode === "staged"
      ? ["git", ".", "--pre-commit", "--staged"]
      : ["git", ".", "--log-opts=--full-history --all --diff-merges=first-parent"],
  );
}
