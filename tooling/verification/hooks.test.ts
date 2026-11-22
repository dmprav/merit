import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const hooksDir = join(root, ".agents/hooks");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const initTempRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), "merit-hooks-test-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "user.email", "test@example.test"]);
  mkdirSync(join(dir, "foundation/db/database/migrations/meta"), { recursive: true });
  writeFileSync(join(dir, "foundation/db/database/migrations/0001_init.sql"), "-- init\n");
  writeFileSync(join(dir, "foundation/db/database/migrations/meta/_journal.json"), "{}\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "chore: init"]);
  return dir;
};

const runHook = (
  script: string,
  payload: unknown,
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) =>
  spawnSync(process.execPath, [join(hooksDir, script)], {
    cwd: options.cwd ?? root,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });

it("blocks edits to committed SQL migrations while allowing new and feature-branch migrations", () => {
  const repo = initTempRepo();
  try {
    const blocked = runHook(
      "guard-migrations.mjs",
      {
        tool_name: "Edit",
        tool_input: { file_path: join(repo, "foundation/db/database/migrations/0001_init.sql") },
      },
      { cwd: repo },
    );
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain("0001_init.sql");

    const allowedNew = runHook(
      "guard-migrations.mjs",
      {
        tool_name: "Write",
        tool_input: { file_path: "foundation/db/database/migrations/0002_new.sql" },
      },
      { cwd: repo },
    );
    expect(allowedNew.status, allowedNew.stderr).toBe(0);

    git(repo, ["checkout", "-b", "feat/new-migration"]);
    writeFileSync(join(repo, "foundation/db/database/migrations/0002_new.sql"), "-- branch\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "feat: new migration"]);

    const allowedBranchEdit = runHook(
      "guard-migrations.mjs",
      {
        tool_name: "Edit",
        tool_input: { file_path: "foundation/db/database/migrations/0002_new.sql" },
      },
      { cwd: repo },
    );
    expect(allowedBranchEdit.status, allowedBranchEdit.stderr).toBe(0);

    const allowedOther = runHook(
      "guard-migrations.mjs",
      { tool_name: "Edit", tool_input: { file_path: "README.md" } },
      { cwd: repo },
    );
    expect(allowedOther.status, allowedOther.stderr).toBe(0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

it("blocks destructive git commands unless explicitly overridden", () => {
  const repo = initTempRepo();
  try {
    for (const command of [
      "git reset --hard",
      "echo ok && git reset --hard HEAD~1",
      "git clean -fd",
      "git clean -fdx",
      "git clean -f -d",
      "git push --force origin main",
      "git push -f origin HEAD:main",
      "git push --force",
    ]) {
      const blocked = runHook("guard-git.mjs", { tool_input: { command } }, { cwd: repo });
      expect(blocked.status, command).toBe(2);
      expect(blocked.stderr).toContain("MERIT_ALLOW_DESTRUCTIVE_GIT=1");
    }

    const overridden = runHook(
      "guard-git.mjs",
      { tool_input: { command: "git reset --hard" } },
      { cwd: repo, env: { MERIT_ALLOW_DESTRUCTIVE_GIT: "1" } },
    );
    expect(overridden.status, overridden.stderr).toBe(0);

    for (const command of [
      "git status",
      "git push --force-with-lease origin feat/safe",
      'git commit -m "avoid git reset --hard"',
    ]) {
      const allowed = runHook("guard-git.mjs", { tool_input: { command } }, { cwd: repo });
      expect(allowed.status, `${command}: ${allowed.stderr}`).toBe(0);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

it("warns on SessionStart only when core.hooksPath is missing or inactive", () => {
  const repo = initTempRepo();
  try {
    const missing = runHook("session-health.mjs", {}, { cwd: repo });
    expect(missing.status).toBe(0);
    expect(missing.stdout).toContain("vp config --no-agent");

    git(repo, ["config", "core.hooksPath", ".vite-hooks/_"]);
    const active = runHook("session-health.mjs", {}, { cwd: repo });
    expect(active.status).toBe(0);
    expect(active.stdout).toBe("");
    expect(active.stderr).toBe("");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
