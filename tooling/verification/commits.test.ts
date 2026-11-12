import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

const root = fileURLToPath(new URL("../../", import.meta.url));

const checkMessage = (message: string) => {
  const directory = mkdtempSync(join(tmpdir(), "merit-commits-"));
  const path = join(directory, "commit message.txt");

  try {
    writeFileSync(path, `${message}\n`);
    const result = spawnSync("sh", [join(root, ".vite-hooks/commit-msg"), path], {
      cwd: root,
      env: { ...process.env, PATH: `${join(root, "node_modules/.bin")}:${process.env.PATH}` },
      encoding: "utf8",
      timeout: 10_000,
    });

    if (result.error) {
      throw result.error;
    }

    expect(result.signal).toBeNull();
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

it.each([
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
])("accepts %s", (message) => {
  const result = checkMessage(message);

  expect(result.status, result.output).toBe(0);
});

it.each([
  ["add reviewer assignment", "type-empty"],
  ["feature: add reviewer assignment", "type-enum"],
  ["feat(Reviews): add reviewer assignment", "scope-case"],
  ["feat:", "subject-empty"],
  ["feat: add reviewer assignment.", "subject-full-stop"],
  [`feat: ${"a".repeat(95)}`, "header-max-length"],
])("rejects %s", (message, rule) => {
  const result = checkMessage(message);

  expect(result.status, result.output).not.toBe(0);
  expect(result.output).toContain(rule);
});
