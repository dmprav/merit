import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const commitlint = join(root, "node_modules/.bin/commitlint");

const runCommand = (command: string, args: string[], env?: NodeJS.ProcessEnv) =>
  new Promise<{ status: number | null; output: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out running ${command} ${args.join(" ")}:\n${output}`));
    }, 15_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      expect(signal).toBeNull();
      resolve({ status, output });
    });
  });

const checkWith = async (
  message: string,
  runner: (path: string) => Promise<{ status: number | null; output: string }>,
) => {
  const directory = mkdtempSync(join(tmpdir(), "merit-commits-"));
  const path = join(directory, "commit message.txt");

  try {
    writeFileSync(path, `${message}\n`);
    return await runner(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const checkHook = (message: string) =>
  checkWith(message, (path) =>
    runCommand("sh", [join(root, ".vite-hooks/commit-msg"), path], {
      ...process.env,
      PATH: `${join(root, "node_modules/.bin")}:${process.env.PATH}`,
    }),
  );

const checkCommitlint = (message: string) =>
  checkWith(message, (path) => runCommand(commitlint, ["--edit", path]));

it.concurrent("runs commitlint through the commit-msg hook for paths with spaces", async () => {
  const [accepted, rejected] = await Promise.all([
    checkHook("feat(reviews): add reviewer assignment"),
    checkHook("add reviewer assignment"),
  ]);

  expect(accepted.status, accepted.output).toBe(0);
  expect(rejected.status, rejected.output).not.toBe(0);
  expect(rejected.output).toContain("type-empty");
}, 15_000);

it.concurrent.each([
  "feat(reviews): add reviewer assignment",
  "fix(organizations): prevent duplicate invitations",
  "docs: clarify local verification steps",
  "refactor(new-area): simplify queries",
  "test: cover invitation expiry",
  "perf: reduce query count",
  "build: update dependencies",
  "ci: check pull requests",
  "chore: refresh fixtures",
  "fix(mcp): preserve OAuth client names",
  "feat(mcp)!: require a workspace identifier\n\nClients must pass their selected workspace.",
  "feat(mcp): require a workspace identifier\n\nBREAKING CHANGE: Clients must pass their selected workspace.",
  "Merge branch 'main' into feature",
  'Revert "feat: add reviewer assignment"\n\nThis reverts commit 0123456789abcdef0123456789abcdef01234567.',
  "fixup! feat: add reviewer assignment",
  "squash! feat: add reviewer assignment",
])("accepts %s", async (message) => {
  const result = await checkCommitlint(message);

  expect(result.status, result.output).toBe(0);
});

it.concurrent.each([
  ["add reviewer assignment", "type-empty"],
  ["feature: add reviewer assignment", "type-enum"],
  ["feat(Reviews): add reviewer assignment", "scope-case"],
  ["feat:", "subject-empty"],
  ["feat: add reviewer assignment.", "subject-full-stop"],
  [`feat: ${"a".repeat(95)}`, "header-max-length"],
])("rejects %s", async (message, rule) => {
  const result = await checkCommitlint(message);

  expect(result.status, result.output).not.toBe(0);
  expect(result.output).toContain(rule);
});
