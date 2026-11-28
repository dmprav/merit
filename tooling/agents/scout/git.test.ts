import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  assertCheckoutAt,
  buildChurnQueryArgs,
  buildCommitQueryArgs,
  createGitPort,
  parseChurn,
  parseCommitLog,
  parseHiddenPaths,
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

  test("falls back to the lookback date when the run has no cursor", () => {
    const args = buildCommitQueryArgs({
      cursor: undefined,
      isAncestor: () => false,
      fallbackSinceIso,
    });
    expect(args).toContain("--since=2026-11-15T00:00:00Z");
  });

  test("reads churn over the same range as the commit query", () => {
    const query = {
      cursor: { lastCommitSha: "abcdef1234", lastRunAt: "2026-11-20T01:00:00Z" },
      isAncestor: () => true,
      fallbackSinceIso,
    };
    expect(buildChurnQueryArgs(query)).toEqual([
      "-c",
      "core.quotePath=false",
      "log",
      "-m",
      "--first-parent",
      "--no-renames",
      "--numstat",
      "--format=",
      "abcdef1234..origin/main",
    ]);
    expect(buildChurnQueryArgs({ ...query, cursor: undefined, isAncestor: () => false })).toContain(
      "--since=2026-11-15T00:00:00Z",
    );
  });

  test("parses numstat lines, counting binary files as zero and keeping tabs in paths", () => {
    expect(
      parseChurn("12\t3\tapp/src/a.ts\n\n-\t-\tdocs/logo.png\n0\t7\tdocs/a\tb.md\nnot numstat\n"),
    ).toEqual([
      { path: "app/src/a.ts", additions: 12, deletions: 3 },
      { path: "docs/logo.png", additions: 0, deletions: 0 },
      { path: "docs/a\tb.md", additions: 0, deletions: 7 },
    ]);
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
      expect(port.checkoutState()).toEqual({ headSha: head, changedPaths: [], hiddenPaths: [] });
      expect(() => assertCheckoutAt(port, head)).not.toThrow();

      writeFileSync(join(repo, "README.md"), "# Changed\n");
      git(["mv", "docs/guides/café.md", "docs/guides/cafe.md"]);
      writeFileSync(join(repo, "scratch.ts"), "export {};\n");

      expect(port.checkoutState()).toEqual({
        headSha: head,
        changedPaths: ["README.md", "docs/guides/cafe.md", "scratch.ts"],
        hiddenPaths: [],
      });
      expect(() => assertCheckoutAt(port, head)).toThrow(/3 changed or untracked paths/);
    });
  });

  test("reads skip-worktree and assume-unchanged paths from ls-files tags", () => {
    expect(parseHiddenPaths("H a.ts\0S b.ts\0h c.ts\0s d.ts\0H café.md\0")).toEqual([
      "b.ts",
      "c.ts",
      "d.ts",
    ]);
  });

  test("reports tracked paths a sparse checkout or assume-unchanged flag hides", () => {
    withScratchRepo((repo, git) => {
      mkdirSync(join(repo, "tooling"));
      writeFileSync(join(repo, "tooling/x.ts"), "export {};\n");
      git(["add", "."]);
      git(["-c", "user.name=Scout", "-c", "user.email=scout@example.com", "commit", "-qm", "x"]);
      git(["sparse-checkout", "set", "docs"]);
      git(["update-index", "--assume-unchanged", "README.md"]);
      writeFileSync(join(repo, "README.md"), "# Edited but hidden\n");

      const port = createGitPort(repo);
      const head = port.revParse("HEAD");
      expect(port.checkoutState()).toEqual({
        headSha: head,
        changedPaths: [],
        hiddenPaths: ["README.md", "tooling/x.ts"],
      });
      expect(() => assertCheckoutAt(port, head)).toThrow(/hides 2 tracked paths from git status/);
    });
  });

  test("refuses a clean checkout at another commit", () => {
    expect(() =>
      assertCheckoutAt(
        { checkoutState: () => ({ headSha: "b", changedPaths: [], hiddenPaths: [] }) },
        "a",
      ),
    ).toThrow('scan tip a, but the checkout is at b. Run "git switch --detach a" and retry.');
  });
});

describe("scout churn", () => {
  test("sums added and deleted lines per path across the commits after the cursor", () => {
    withScratchRepo((repo, git) => {
      const port = createGitPort(repo);
      const base = port.revParse("HEAD");

      const commit = (message: string) =>
        git([
          "-c",
          "user.name=Scout",
          "-c",
          "user.email=scout@example.com",
          "commit",
          "-qm",
          message,
        ]);

      writeFileSync(join(repo, "README.md"), "# Readme\nmore\nlines\n");
      writeFileSync(join(repo, "docs/guides/café.md"), "# Café again\n");
      writeFileSync(join(repo, "image.png"), Buffer.from([0, 1, 2, 3, 0]));
      git(["add", "."]);
      commit("one");
      writeFileSync(join(repo, "README.md"), "# Readme\n");
      git(["add", "."]);
      commit("two");

      const tip = port.revParse("HEAD");
      const churn = port.churnSince({
        cursor: { lastCommitSha: base, lastRunAt: "2026-11-20T00:00:00Z" },
        tipSha: tip,
        fallbackSinceIso: "2000-01-01T00:00:00Z",
      });

      const byPath = (path: string) => churn.filter((entry) => entry.path === path);

      expect(byPath("README.md")).toHaveLength(2);
      expect(byPath("README.md")).toEqual(
        expect.arrayContaining([
          { path: "README.md", additions: 2, deletions: 0 },
          { path: "README.md", additions: 0, deletions: 2 },
        ]),
      );
      expect(byPath("docs/guides/café.md")).toEqual([
        { path: "docs/guides/café.md", additions: 1, deletions: 1 },
      ]);
      expect(byPath("image.png")).toEqual([{ path: "image.png", additions: 0, deletions: 0 }]);
      expect(
        port.listCommitsSince({
          cursor: { lastCommitSha: base, lastRunAt: "2026-11-20T00:00:00Z" },
          tipSha: tip,
          fallbackSinceIso: "2000-01-01T00:00:00Z",
        }),
      ).toHaveLength(2);
    });
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
