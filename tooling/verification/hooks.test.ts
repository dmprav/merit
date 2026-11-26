import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { REPO_ROOT } from "../paths.ts";

const hooksDir = join(REPO_ROOT, ".agents/hooks");

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
) => {
  const effectiveCwd = options.cwd ?? REPO_ROOT;
  return spawnSync(process.execPath, [join(hooksDir, script)], {
    cwd: effectiveCwd,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: effectiveCwd,
      MERIT_ALLOW_DESTRUCTIVE_GIT: "",
      ...options.env,
    },
  });
};

it("blocks edits to committed SQL migrations while allowing new and feature-branch migrations", () => {
  const repo = initTempRepo();
  const mainRepo = initTempRepo();
  try {
    const blocked = runHook(
      "guard-migrations.mjs",
      {
        tool_name: "Edit",
        tool_input: { file_path: join(repo, "foundation/db/database/migrations/0001_init.sql") },
      },
      { cwd: repo, env: { CLAUDE_PROJECT_DIR: mainRepo } },
    );
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain("0001_init.sql");

    const blockedByEventCwd = runHook(
      "guard-migrations.mjs",
      {
        cwd: repo,
        tool_name: "Edit",
        tool_input: { file_path: join(repo, "foundation/db/database/migrations/0001_init.sql") },
      },
      { cwd: mainRepo, env: { CLAUDE_PROJECT_DIR: mainRepo } },
    );
    expect(blockedByEventCwd.status).toBe(2);

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
    rmSync(mainRepo, { recursive: true, force: true });
  }
});

it("blocks destructive git commands unless explicitly overridden", () => {
  const repo = initTempRepo();
  const branchRepo = initTempRepo();
  git(branchRepo, ["checkout", "-b", "feat/safe"]);
  try {
    for (const command of [
      "git reset --hard",
      "(git reset --hard)",
      "{ git reset --hard; }",
      'git reset "--hard"',
      "git -C . reset --hard",
      "echo ok && git reset --hard HEAD~1",
      "git clean -fd",
      "git clean -fdx",
      "git clean -f -d",
      "git push --force origin main",
      "git push -vf origin main",
      "git push -f origin HEAD:main",
      "git push origin +HEAD:main",
      "git push -o skip origin +HEAD:main",
      "git push --force origin HEAD",
      "git push origin +HEAD",
      "git push --force",
      'echo "$(git reset --hard)"',
      "git reset --\\\nhard",
      "git checkout feat/safe -- README.md && git push --force origin",
      "git switch definitely-missing || git push --force origin",
    ]) {
      const blocked = runHook("guard-git.mjs", { tool_input: { command } }, { cwd: repo });
      expect(blocked.status, command).toBe(2);
      expect(blocked.stderr).toContain("MERIT_ALLOW_DESTRUCTIVE_GIT=1");
    }

    for (const command of [
      `git -C "${repo}" push --force`,
      "git push --force --all origin",
      "git push --mirror origin",
      "git push origin +:",
      "git push origin +refs/heads/*:refs/heads/*",
      "git switch main && git push --force origin",
      "git switch -- main && git push --force origin",
      "git -C foundation switch main && git push --force origin",
    ]) {
      const blocked = runHook("guard-git.mjs", { tool_input: { command } }, { cwd: branchRepo });
      expect(blocked.status, command).toBe(2);
    }

    for (const command of ["git push --force origin HEAD", "git push origin +HEAD"]) {
      const allowedOnFeature = runHook(
        "guard-git.mjs",
        { tool_input: { command } },
        { cwd: branchRepo },
      );
      expect(allowedOnFeature.status, `${command}: ${allowedOnFeature.stderr}`).toBe(0);
    }

    const overridden = runHook(
      "guard-git.mjs",
      { tool_input: { command: "git reset --hard" } },
      { cwd: repo, env: { MERIT_ALLOW_DESTRUCTIVE_GIT: "1" } },
    );
    expect(overridden.status, overridden.stderr).toBe(0);

    for (const command of [
      "git status",
      "git push origin main",
      "git push --force-with-lease origin feat/safe",
      "git push origin +HEAD:feat/safe",
      'git commit -m "avoid git reset --hard"',
    ]) {
      const allowed = runHook("guard-git.mjs", { tool_input: { command } }, { cwd: repo });
      expect(allowed.status, `${command}: ${allowed.stderr}`).toBe(0);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(branchRepo, { recursive: true, force: true });
  }
});

it("warns on SessionStart when core.hooksPath is missing or hook files are not installed", () => {
  const repo = initTempRepo();
  try {
    const missing = runHook("session-health.mjs", {}, { cwd: repo });
    expect(missing.status).toBe(0);
    expect(missing.stdout).toContain("vp config --no-agent");

    git(repo, ["config", "core.hooksPath", ".vite-hooks/_"]);
    const incomplete = runHook("session-health.mjs", {}, { cwd: repo });
    expect(incomplete.status).toBe(0);
    expect(incomplete.stdout).toContain("vp config --no-agent");

    mkdirSync(join(repo, ".vite-hooks/_"), { recursive: true });
    writeFileSync(join(repo, ".vite-hooks/_/pre-commit"), "#!/bin/sh\n");
    writeFileSync(join(repo, ".vite-hooks/_/commit-msg"), "#!/bin/sh\n");

    const active = runHook("session-health.mjs", {}, { cwd: repo });
    expect(active.status).toBe(0);
    expect(active.stdout).toBe("");
    expect(active.stderr).toBe("");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
