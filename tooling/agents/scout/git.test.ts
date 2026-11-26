import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { buildCommitQueryArgs, createGitPort, parseCommitLog } from "./git.ts";

describe("scout commit query", () => {
  const fallbackSinceIso = "2026-11-15T00:00:00Z";

  test("resumes from the cursor commit when it is still an ancestor of the scan tip", () => {
    const args = buildCommitQueryArgs({
      cursor: {
        lastCommitSha: "abcdef1234",
        lastCommitDate: "2026-11-20T00:00:00Z",
        lastRunAt: "2026-11-20T01:00:00Z",
      },
      isAncestor: () => true,
      fallbackSinceIso,
    });
    expect(args).toContain("abcdef1234..origin/main");
  });

  test("falls back to the cursor commit date when its commit was squashed away", () => {
    const args = buildCommitQueryArgs({
      cursor: {
        lastCommitSha: "deadbeef00",
        lastCommitDate: "2026-11-20T00:00:00Z",
        lastRunAt: "2026-11-20T01:00:00Z",
      },
      isAncestor: () => false,
      fallbackSinceIso,
    });
    expect(args).toContain("--since=2026-11-20T00:00:00Z");
    expect(args).not.toContain("deadbeef00..origin/main");
  });

  test("falls back to the lookback date when the lens has no cursor", () => {
    const args = buildCommitQueryArgs({
      cursor: undefined,
      isAncestor: () => false,
      fallbackSinceIso,
    });
    expect(args).toContain("--since=2026-11-15T00:00:00Z");
  });

  test("parses tab-separated log lines and keeps tabs inside subjects", () => {
    expect(parseCommitLog("abc1234\t2026-11-22T00:00:00Z\tfeat: a\tb\n\nbroken-line\n")).toEqual([
      { sha: "abc1234", date: "2026-11-22T00:00:00Z", subject: "feat: a\tb" },
    ]);
  });
});

describe("scout git paths", () => {
  test("reads non-ASCII paths as written, not quoted", () => {
    const repo = mkdtempSync(join(tmpdir(), "merit-scout-git-"));
    try {
      const git = (args: readonly string[]) =>
        execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo });

      git(["init", "-q"]);
      mkdirSync(join(repo, "docs/guides"), { recursive: true });
      writeFileSync(join(repo, "docs/guides/café.md"), "# Café\n");
      writeFileSync(join(repo, "README.md"), "# Readme\n");
      git(["add", "."]);
      git(["-c", "user.name=Scout", "-c", "user.email=scout@example.com", "commit", "-qm", "docs"]);

      const port = createGitPort(repo);
      const head = port.revParse("HEAD");

      expect(port.trackedFiles(head)).toEqual(["README.md", "docs/guides/café.md"]);
      expect(port.filesChangedIn(head)).toEqual(["README.md", "docs/guides/café.md"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
