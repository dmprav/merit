import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  assertCheckoutAt,
  buildCommitQueryArgs,
  createGitPort,
  parseCommitLog,
  parseStatusPaths,
} from "./git.ts";

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

/** Runs `body` against a fresh repository with one commit tracking `README.md` and a Café guide. */
const withScratchRepo = (body: (repo: string, git: (args: readonly string[]) => void) => void) => {
  const repo = mkdtempSync(join(tmpdir(), "merit-scout-git-"));
  try {
    const git = (args: readonly string[]) => {
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo });
    };

    git(["init", "-q"]);
    mkdirSync(join(repo, "docs/guides"), { recursive: true });
    writeFileSync(join(repo, "docs/guides/café.md"), "# Café\n");
    writeFileSync(join(repo, "README.md"), "# Readme\n");
    git(["add", "."]);
    git(["-c", "user.name=Scout", "-c", "user.email=scout@example.com", "commit", "-qm", "docs"]);
    body(repo, git);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
};

describe("scout checkout state", () => {
  test("skips the source path that follows a rename or copy", () => {
    expect(parseStatusPaths(" M a.ts\0R  new.ts\0old.ts\0?? notes/café.md\0")).toEqual([
      "a.ts",
      "new.ts",
      "notes/café.md",
    ]);
  });

  test("reports HEAD and modified, renamed, and untracked paths", () => {
    withScratchRepo((repo, git) => {
      const port = createGitPort(repo);
      const head = port.revParse("HEAD");
      expect(port.checkoutState()).toEqual({ headSha: head, changedPaths: [] });
      expect(() => assertCheckoutAt(port, head)).not.toThrow();

      writeFileSync(join(repo, "README.md"), "# Changed\n");
      git(["mv", "docs/guides/café.md", "docs/guides/cafe.md"]);
      writeFileSync(join(repo, "scratch.ts"), "export {};\n");

      expect(port.checkoutState()).toEqual({
        headSha: head,
        changedPaths: ["README.md", "docs/guides/cafe.md", "scratch.ts"],
      });
      expect(() => assertCheckoutAt(port, head)).toThrow(/3 changed or untracked paths/);
    });
  });

  test("refuses a clean checkout at another commit", () => {
    expect(() =>
      assertCheckoutAt({ checkoutState: () => ({ headSha: "b", changedPaths: [] }) }, "a"),
    ).toThrow('scan tip a, but the checkout is at b. Run "git switch --detach a" and retry.');
  });
});

describe("scout git paths", () => {
  test("reads non-ASCII paths as written, not quoted", () => {
    withScratchRepo((repo) => {
      const port = createGitPort(repo);
      const head = port.revParse("HEAD");

      expect(port.trackedFiles(head)).toEqual(["README.md", "docs/guides/café.md"]);
      expect(port.filesChangedIn(head)).toEqual(["README.md", "docs/guides/café.md"]);
    });
  });
});
