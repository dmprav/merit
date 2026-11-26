import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  fetchRestIssueComments,
  getRepoIdentity,
  listRestIssues,
  parseGitHubRepoSpec,
} from "./github-rest.ts";

const tempDirs: string[] = [];

const createTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const createFakeGhFixture = (response: unknown) => {
  const dir = createTempDir("merit-github-rest-");
  const payloadPath = join(dir, "response.json");
  const capturePath = join(dir, "capture.json");
  const ghPath = join(dir, "gh");

  writeFileSync(payloadPath, JSON.stringify(response), "utf8");
  writeFileSync(
    ghPath,
    [
      "#!/usr/bin/env node",
      'const { readFileSync, writeFileSync } = require("node:fs");',
      `writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ argv: process.argv.slice(2), token: process.env.GH_TOKEN ?? null }));`,
      `process.stdout.write(readFileSync(${JSON.stringify(payloadPath)}, "utf8"));`,
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(ghPath, 0o755);

  return {
    dir,
    env: (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
      ...process.env,
      ...extra,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
    }),
    readCapture: (): { argv: string[]; token: string | null } =>
      JSON.parse(readFileSync(capturePath, "utf8")) as { argv: string[]; token: string | null },
  };
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("github-rest", () => {
  test("parses OWNER/REPO, HOST/OWNER/REPO, and GitHub URLs in parseGitHubRepoSpec", () => {
    expect(parseGitHubRepoSpec("dmprav/merit")).toEqual({ owner: "dmprav", name: "merit" });
    expect(parseGitHubRepoSpec("github.com/dmprav/merit.git")).toEqual({
      owner: "dmprav",
      name: "merit",
    });
    expect(parseGitHubRepoSpec("https://github.com/dmprav/merit.git")).toEqual({
      owner: "dmprav",
      name: "merit",
    });
    expect(parseGitHubRepoSpec("https://only-one")).toBeNull();
    expect(parseGitHubRepoSpec("not a repo")).toBeNull();
    expect(parseGitHubRepoSpec("a/b/c/d")).toBeNull();
  });

  test("resolves repository identity with GH_REPO > GITHUB_REPOSITORY > origin remote precedence", () => {
    const repoDir = createTempDir("merit-repo-identity-");
    execFileSync("git", ["init", "-q"], { cwd: repoDir });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/fork-owner/merit.git"], {
      cwd: repoDir,
    });

    expect(
      getRepoIdentity(repoDir, {
        GH_REPO: "github.com/dmprav/merit",
        GITHUB_REPOSITORY: "other/repo",
      }),
    ).toEqual({ owner: "dmprav", name: "merit" });

    expect(
      getRepoIdentity(repoDir, {
        GH_REPO: "   ",
        GITHUB_REPOSITORY: "ci-owner/merit",
      }),
    ).toEqual({ owner: "ci-owner", name: "merit" });

    expect(getRepoIdentity(repoDir, {})).toEqual({ owner: "fork-owner", name: "merit" });

    expect(() =>
      getRepoIdentity(repoDir, {
        GH_REPO: "invalid-spec",
        GITHUB_REPOSITORY: "ci-owner/merit",
      }),
    ).toThrow(/Invalid GH_REPO/);
  });

  test("flattens paginated issue responses, excludes pull requests, and forwards labels and env", () => {
    const fixture = createFakeGhFixture([
      [
        {
          number: 10,
          state: "open",
          title: "Real issue",
          body: null,
          labels: [{ name: "agent:proposed" }],
          comments: 2,
        },
        {
          number: 11,
          state: "open",
          title: "Pull request item",
          body: "PR body",
          labels: [{ name: "agent:proposed" }],
          pull_request: { url: "https://api.github.com/repos/dmprav/merit/pulls/11" },
        },
      ],
      [
        {
          number: 12,
          state: "open",
          title: "Second page issue",
          body: "Details",
          labels: [{ name: "agent:proposed" }, { name: "type:maintenance" }],
        },
      ],
    ]);

    const issues = listRestIssues({
      repoRoot: fixture.dir,
      repo: { owner: "dmprav", name: "merit" },
      state: "open",
      labels: ["agent:proposed", "type:maintenance"],
      env: fixture.env({ GH_TOKEN: "fixture-forwarded-token" }),
    });

    expect(issues.map((issue) => ({ number: issue.number, body: issue.body }))).toEqual([
      { number: 10, body: null },
      { number: 12, body: "Details" },
    ]);
    const capture = fixture.readCapture();
    expect(capture.token).toBe("fixture-forwarded-token");
    expect(capture.argv).toEqual([
      "api",
      "--paginate",
      "--slurp",
      "repos/dmprav/merit/issues?state=open&per_page=100&labels=agent%3Aproposed%2Ctype%3Amaintenance",
    ]);
  });

  test("handles paginated issue payloads larger than Node's 1 MiB default maxBuffer", () => {
    const largeBody = "x".repeat(400_000);
    const fixture = createFakeGhFixture([
      [
        { number: 1, state: "closed", title: "One", body: largeBody, labels: [] },
        { number: 2, state: "closed", title: "Two", body: largeBody, labels: [] },
        { number: 3, state: "closed", title: "Three", body: largeBody, labels: [] },
        { number: 4, state: "closed", title: "Four", body: largeBody, labels: [] },
      ],
    ]);

    const issues = listRestIssues({
      repoRoot: fixture.dir,
      repo: { owner: "dmprav", name: "merit" },
      state: "closed",
      env: fixture.env(),
    });

    expect(issues).toHaveLength(4);
    expect(issues[0]?.body?.length).toBe(400_000);
  });

  test("maps paginated issue comments and forwards custom env", () => {
    const fixture = createFakeGhFixture([
      [{ body: null, author_association: "OWNER" }],
      [{ body: "Keep cents everywhere.", author_association: "MEMBER" }],
    ]);

    const comments = fetchRestIssueComments(
      fixture.dir,
      { owner: "dmprav", name: "merit" },
      237,
      fixture.env({ GH_TOKEN: "fixture-comment-token" }),
    );

    expect(comments).toEqual([
      { body: "", authorAssociation: "OWNER" },
      { body: "Keep cents everywhere.", authorAssociation: "MEMBER" },
    ]);
    const capture = fixture.readCapture();
    expect(capture.token).toBe("fixture-comment-token");
    expect(capture.argv).toEqual([
      "api",
      "--paginate",
      "--slurp",
      "repos/dmprav/merit/issues/237/comments?per_page=100",
    ]);
  });
});
