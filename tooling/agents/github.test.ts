import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { AGENT_LABELS } from "../verification/agent-policy.ts";
import {
  createGhExec,
  createGitHubIssueClient,
  createGitHubRestClient,
  parseGitHubRemote,
  resolveRepoIdentity,
  resolveScoutGhEnv,
  SCOUT_GH_TOKEN_ENV,
} from "./github.ts";

const repo = { owner: "dmprav", name: "merit" };

/** Records each `gh` invocation and answers it with `respond`'s JSON, or empty output for `undefined`. */
const fakeGh = (respond: (args: readonly string[]) => unknown = () => undefined) => {
  const calls: string[][] = [];

  const exec = (args: readonly string[]) => {
    calls.push([...args]);
    const response = respond(args);
    return response === undefined ? "" : JSON.stringify(response);
  };

  return { calls, exec };
};

const tempDirs: string[] = [];

const createTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Puts a real `gh` executable on a PATH that records each call's argv and `GH_TOKEN` and prints
 * `response` as JSON, so a client can be tested with its default process runner.
 */
const createFakeGhFixture = (response: unknown) => {
  const dir = createTempDir("merit-github-");
  const payloadPath = join(dir, "response.json");
  const capturePath = join(dir, "captures.jsonl");
  writeFileSync(payloadPath, JSON.stringify(response), "utf8");
  writeFileSync(capturePath, "", "utf8");
  writeFileSync(
    join(dir, "gh"),
    [
      "#!/usr/bin/env node",
      'const { appendFileSync, readFileSync } = require("node:fs");',
      `appendFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ argv: process.argv.slice(2), token: process.env.GH_TOKEN ?? null }) + "\\n");`,
      `process.stdout.write(readFileSync(${JSON.stringify(payloadPath)}, "utf8"));`,
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(join(dir, "gh"), 0o755);

  return {
    dir,
    env: (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
      ...process.env,
      ...extra,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
    }),
    readCaptures: (): Array<{ argv: string[]; token: string | null }> =>
      readFileSync(capturePath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { argv: string[]; token: string | null }),
  };
};

const endpointOf = (args: readonly string[]) => args.find((arg) => arg.startsWith("repos/")) ?? "";

const restIssue = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  state: "open",
  title: `Issue ${number}`,
  body: null,
  labels: [{ name: AGENT_LABELS.ready }],
  comments: 0,
  ...extra,
});

const restPull = {
  number: 221,
  title: "refactor: tidy",
  body: "Closes #120",
  draft: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T01:00:00Z",
  labels: [{ name: AGENT_LABELS.pr }],
  head: { ref: "claude/issue-120", sha: "abc1234" },
};

const openedPull = { number: 221, html_url: "https://github.com/pr/221", head: { ref: "b" } };

const respondLikeGitHub = (args: readonly string[]): unknown => {
  const endpoint = endpointOf(args);
  if (endpoint.includes("/check-runs")) {
    return [{ check_runs: [{ id: 1, name: "verify", status: "completed", conclusion: null }] }];
  }
  if (endpoint.includes("/status")) {
    return [{ statuses: [{ context: "ci", state: "success" }] }];
  }
  if (endpoint.includes("/actions/workflows/")) {
    return { workflow_runs: [{ id: 9, run_attempt: 1, conclusion: "failure" }] };
  }
  if (endpoint.includes("/pulls?state=open")) {
    return [];
  }
  if (endpoint.endsWith("/pulls") || endpoint.endsWith("/pulls/221")) {
    return endpoint.endsWith("/pulls") ? openedPull : restPull;
  }
  if (endpoint.includes("/pulls/221/comments?")) {
    return [[]];
  }
  if (endpoint.includes("/comments?")) {
    return [[{ body: "first", author_association: "MEMBER" }], [{ body: null }]];
  }
  if (endpoint.includes("/issues?state=open")) {
    return [[restIssue(120), restIssue(221, { pull_request: {} })]];
  }
  if (endpoint.endsWith("/issues/120")) {
    return restIssue(120, { comments: 2 });
  }
  return undefined;
};

describe("GitHub REST client", () => {
  test("sends every queue operation as a gh api REST request, never a GraphQL-backed gh command", () => {
    const { calls, exec } = fakeGh(respondLikeGitHub);
    const client = createGitHubRestClient({ repoRoot: "/repo", repo, exec });

    client.getIssue(120);
    client.listOpenIssues(AGENT_LABELS.ready);
    client.listIssueComments(120);
    client.getPull(221);
    client.listReviewComments(221);
    client.listCommitChecks("abc1234");
    client.listWorkflowRuns("verify.yml", "abc1234");
    client.rerunFailedJobs(9);
    client.postIssueComment(120, "hello");
    client.addLabels(221, [AGENT_LABELS.pr]);
    client.findOpenPull({ head: "b", base: "main" });
    client.createPull({ title: "t", head: "b", base: "main", body: "x" });
    client.replyToReviewComment(221, 5, "done");

    expect(calls).toHaveLength(14);
    for (const args of calls) {
      expect(args.slice(0, 3)).toEqual(["api", "--hostname", "github.com"]);
      expect(endpointOf(args)).toMatch(/^repos\/dmprav\/merit\//);
      expect(args).not.toContain("graphql");
    }
  });

  test("flattens paginated pages and maps REST fields to the queue's shapes", () => {
    const { calls, exec } = fakeGh(respondLikeGitHub);
    const client = createGitHubRestClient({ repoRoot: "/repo", repo, exec });

    expect(client.listIssueComments(120)).toEqual([
      { body: "first", authorAssociation: "MEMBER" },
      { body: "", authorAssociation: "" },
    ]);
    expect(calls.at(-1)).toEqual([
      "api",
      "--hostname",
      "github.com",
      "--paginate",
      "--slurp",
      "repos/dmprav/merit/issues/120/comments?per_page=100",
    ]);

    expect(client.listOpenIssues(AGENT_LABELS.pr).map((item) => item.isPullRequest)).toEqual([
      false,
      true,
    ]);
    expect(endpointOf(calls.at(-1) ?? [])).toBe(
      "repos/dmprav/merit/issues?state=open&per_page=100&labels=agent%3Apr",
    );
    expect(client.getIssue(120)).toMatchObject({
      body: "",
      commentCount: 2,
      labels: ["agent:ready"],
    });
    expect(client.getPull(221)).toMatchObject({
      headRefName: "claude/issue-120",
      headSha: "abc1234",
    });
    expect(client.listCommitChecks("abc1234")).toEqual({
      checkRuns: [{ id: 1, name: "verify", status: "completed", conclusion: null }],
      statuses: [{ context: "ci", state: "success" }],
    });
    expect(client.listWorkflowRuns("verify.yml", "abc1234")).toEqual([
      { id: 9, attempt: 1, conclusion: "failure" },
    ]);
  });

  test("writes comments, labels, reruns, and pull requests as POST form fields", () => {
    const { calls, exec } = fakeGh(respondLikeGitHub);
    const client = createGitHubRestClient({ repoRoot: "/repo", repo, exec });

    client.postIssueComment(120, "body with = sign");
    client.addLabels(120, [AGENT_LABELS.needsHuman]);
    client.rerunFailedJobs(9);
    expect(client.findOpenPull({ head: "claude/x", base: "main" })).toBeNull();
    expect(client.createPull({ title: "T", head: "claude/x", base: "main", body: "B" })).toEqual({
      number: 221,
      url: "https://github.com/pr/221",
      headRefName: "b",
    });
    client.replyToReviewComment(221, 5, "fixed");

    expect(calls).toEqual([
      [
        "api",
        "--hostname",
        "github.com",
        "repos/dmprav/merit/issues/120/comments",
        "-X",
        "POST",
        "-f",
        "body=body with = sign",
      ],
      [
        "api",
        "--hostname",
        "github.com",
        "repos/dmprav/merit/issues/120/labels",
        "-X",
        "POST",
        "-f",
        "labels[]=agent:needs-human",
      ],
      [
        "api",
        "--hostname",
        "github.com",
        "repos/dmprav/merit/actions/runs/9/rerun-failed-jobs",
        "-X",
        "POST",
      ],
      [
        "api",
        "--hostname",
        "github.com",
        "repos/dmprav/merit/pulls?state=open&head=dmprav%3Aclaude%2Fx&base=main&per_page=10",
      ],
      [
        "api",
        "--hostname",
        "github.com",
        "repos/dmprav/merit/pulls",
        "-X",
        "POST",
        "-f",
        "title=T",
        "-f",
        "head=claude/x",
        "-f",
        "base=main",
        "-f",
        "body=B",
      ],
      [
        "api",
        "--hostname",
        "github.com",
        "repos/dmprav/merit/pulls/221/comments/5/replies",
        "-X",
        "POST",
        "-f",
        "body=fixed",
      ],
    ]);
  });
});

describe("repository identity", () => {
  const createRepoWithOrigin = (origin: string) => {
    const repoDir = createTempDir("merit-repo-identity-");
    execFileSync("git", ["init", "-q"], { cwd: repoDir });
    execFileSync("git", ["remote", "add", "origin", origin], { cwd: repoDir });
    return repoDir;
  };

  test("parses GitHub owner/repo from SSH, HTTPS, and cloud proxy remote URLs", () => {
    expect(parseGitHubRemote("git@github.com:dmprav/merit.git")).toEqual(repo);
    expect(parseGitHubRemote("https://github.com/dmprav/merit.git")).toEqual(repo);
    expect(parseGitHubRemote("http://local_proxy@127.0.0.1:41234/git/dmprav/merit")).toEqual(repo);
    expect(parseGitHubRemote("https://example.com/not-a-repo")).toBeNull();
  });

  test("resolves the repository with GH_REPO, then GITHUB_REPOSITORY, then the origin remote", () => {
    const repoDir = createRepoWithOrigin("https://github.com/fork-owner/merit.git");

    expect(
      resolveRepoIdentity(repoDir, {
        GH_REPO: "github.com/dmprav/merit",
        GITHUB_REPOSITORY: "o/r",
      }),
    ).toEqual(repo);
    expect(
      resolveRepoIdentity(repoDir, { GH_REPO: "   ", GITHUB_REPOSITORY: "ci-owner/merit" }),
    ).toEqual({ owner: "ci-owner", name: "merit" });
    expect(resolveRepoIdentity(repoDir, {})).toEqual({ owner: "fork-owner", name: "merit" });
  });

  test("reads GH_REPO as OWNER/REPO, github.com/OWNER/REPO, or a GitHub URL and rejects anything else", () => {
    for (const spec of [
      "dmprav/merit",
      "github.com/dmprav/merit.git",
      "https://github.com/dmprav/merit.git",
    ]) {
      expect(resolveRepoIdentity("/nonexistent", { GH_REPO: spec })).toEqual(repo);
    }
    for (const spec of ["https://only-one", "not a repo", "a/b/c/d", "invalid-spec"]) {
      expect(() => resolveRepoIdentity("/nonexistent", { GH_REPO: spec })).toThrow(
        /Invalid GH_REPO/,
      );
    }
  });

  test("rejects a GH_REPO on another host instead of sending its requests to github.com", () => {
    expect(resolveRepoIdentity("/nonexistent", { GH_REPO: "GitHub.com/dmprav/merit" })).toEqual(
      repo,
    );
    for (const spec of [
      "git.example.com/dmprav/merit",
      "https://git.example.com/dmprav/merit.git",
      "git@git.example.com:dmprav/merit.git",
      "https://git.example.com/git/dmprav/merit",
      "http://local_proxy@127.0.0.1:41234/git/dmprav/merit",
    ]) {
      expect(() => resolveRepoIdentity("/nonexistent", { GH_REPO: spec })).toThrow(
        /Invalid GH_REPO .*only github\.com repositories are supported/,
      );
    }
  });

  test("reads the repository on the first request, so building a client touches neither git nor gh", () => {
    const { calls, exec } = fakeGh(() => [[]]);
    const client = createGitHubIssueClient({ repoRoot: "/nonexistent", env: {}, exec });

    expect(calls).toEqual([]);
    expect(() => client.listIssues({ state: "open" })).toThrow();
    expect(calls).toEqual([]);
  });
});

describe("gh credentials", () => {
  test("prefers MERIT_SCOUT_GH_TOKEN over injected GH_TOKEN without mutating input env", () => {
    const baseEnv = { GH_TOKEN: "injected-integration-token", PATH: "/usr/bin" };
    expect(resolveScoutGhEnv(baseEnv)).toBe(baseEnv);
    expect(resolveScoutGhEnv({ ...baseEnv, [SCOUT_GH_TOKEN_ENV]: "   " })).toEqual({
      ...baseEnv,
      [SCOUT_GH_TOKEN_ENV]: "   ",
    });

    const withScoutToken = {
      ...baseEnv,
      [SCOUT_GH_TOKEN_ENV]: "  scout-token-fixture  ",
    };
    const resolved = resolveScoutGhEnv(withScoutToken);
    expect(resolved.GH_TOKEN).toBe("scout-token-fixture");
    expect(resolved.PATH).toBe("/usr/bin");
    expect(withScoutToken.GH_TOKEN).toBe("injected-integration-token");
  });

  test("runs gh in the repository with a large output buffer and scout or ambient credentials", () => {
    const runs: Array<{ file: string; args: readonly string[]; cwd: string; token?: string }> = [];
    const buffers: number[] = [];

    const execFile = (
      file: string,
      args: readonly string[],
      options: { cwd: string; maxBuffer: number; env?: NodeJS.ProcessEnv },
    ) => {
      buffers.push(options.maxBuffer);
      runs.push({
        file,
        args,
        cwd: options.cwd,
        ...(options.env ? { token: options.env.GH_TOKEN } : {}),
      });
      return "ok";
    };

    const env = { GH_TOKEN: "injected", [SCOUT_GH_TOKEN_ENV]: "scout" };

    expect(createGhExec({ repoRoot: "/repo", auth: "scout", env, execFile })(["api"])).toBe("ok");
    createGhExec({ repoRoot: "/repo", auth: "ambient", env, execFile })(["api"]);

    expect(runs).toEqual([
      { file: "gh", args: ["api"], cwd: "/repo", token: "scout" },
      { file: "gh", args: ["api"], cwd: "/repo" },
    ]);
    expect(buffers.every((bytes) => bytes > 1024 * 1024)).toBe(true);
  });

  test("files issues with MERIT_SCOUT_GH_TOKEN when it is set, else with the runner's own token", () => {
    const fixture = createFakeGhFixture({
      html_url: "https://github.com/dmprav/merit/issues/9",
      labels: [],
    });
    const runnerEnv = fixture.env({ GH_REPO: "dmprav/merit", GH_TOKEN: "runner-token" });

    createGitHubIssueClient({
      repoRoot: fixture.dir,
      env: { ...runnerEnv, [SCOUT_GH_TOKEN_ENV]: "scout-token" },
    }).createIssue({ title: "t", body: "b", labels: [] });
    createGitHubIssueClient({ repoRoot: fixture.dir, env: runnerEnv }).createIssue({
      title: "t",
      body: "b",
      labels: [],
    });

    expect(fixture.readCaptures().map((capture) => capture.token)).toEqual([
      "scout-token",
      "runner-token",
    ]);
  });

  test("sends queue requests with the runner's own credentials even when a scout token is set", () => {
    const fixture = createFakeGhFixture("");
    vi.stubEnv("PATH", fixture.env().PATH);
    vi.stubEnv("GH_TOKEN", "runner-token");
    vi.stubEnv(SCOUT_GH_TOKEN_ENV, "scout-token");

    createGitHubRestClient({ repoRoot: fixture.dir, repo }).rerunFailedJobs(9);

    expect(fixture.readCaptures()).toEqual([
      {
        argv: [
          "api",
          "--hostname",
          "github.com",
          "repos/dmprav/merit/actions/runs/9/rerun-failed-jobs",
          "-X",
          "POST",
        ],
        token: "runner-token",
      },
    ]);
  });
});

/** Answers issue requests like GitHub REST: list pages, comment pages, one issue, or a created issue. */
const respondToIssueRequests = (args: readonly string[]): unknown => {
  const endpoint = endpointOf(args);
  if (endpoint.includes("/comments?")) {
    return [[{ body: "Not now.", author_association: "OWNER" }]];
  }
  if (endpoint.includes("/issues?")) {
    return [
      [
        restIssue(7, { state: "closed", labels: [{ name: AGENT_LABELS.wontfix }], comments: 1 }),
        restIssue(8, { state: "closed", labels: [], comments: 0 }),
      ],
      [restIssue(9, { pull_request: {} })],
    ];
  }
  if (args.includes("POST")) {
    return {
      html_url: "https://github.com/dmprav/merit/issues/400",
      labels: [{ name: "Agent:Ready" }, { name: "type:maintenance" }],
    };
  }
  return restIssue(219, { title: "chore: agent scout state", body: "state" });
};

describe("GitHub issue client", () => {
  test("sends every scout and proposal operation as a gh api REST request, never GraphQL", () => {
    const { calls, exec } = fakeGh(respondToIssueRequests);
    const client = createGitHubIssueClient({ repoRoot: "/repo", repo, exec });

    client.listIssues({ state: "closed", label: AGENT_LABELS.wontfix, withComments: true });
    client.viewIssue(219);
    client.editIssueBody(219, "state");
    client.createIssue({ title: "T", body: "B", labels: [AGENT_LABELS.ready] });

    expect(calls).toHaveLength(5);
    for (const args of calls) {
      expect(args.slice(0, 3)).toEqual(["api", "--hostname", "github.com"]);
      expect(endpointOf(args)).toMatch(/^repos\/dmprav\/merit\//);
      expect(args).not.toContain("graphql");
    }
  });

  test("pages through every issue, drops pull requests, and fetches comments only where they exist", () => {
    const { calls, exec } = fakeGh(respondToIssueRequests);
    const client = createGitHubIssueClient({ repoRoot: "/repo", repo, exec });

    expect(
      client.listIssues({ state: "closed", label: AGENT_LABELS.wontfix, withComments: true }),
    ).toEqual([
      {
        number: 7,
        title: "Issue 7",
        state: "CLOSED",
        body: "",
        labels: ["wontfix"],
        comments: [{ body: "Not now.", authorAssociation: "OWNER" }],
      },
      { number: 8, title: "Issue 8", state: "CLOSED", body: "", labels: [], comments: [] },
    ]);
    expect(client.listIssues({ state: "open" }).map((issue) => issue.comments)).toEqual([[], []]);

    expect(calls).toEqual([
      [
        "api",
        "--hostname",
        "github.com",
        "--paginate",
        "--slurp",
        "repos/dmprav/merit/issues?state=closed&per_page=100&labels=wontfix",
      ],
      [
        "api",
        "--hostname",
        "github.com",
        "--paginate",
        "--slurp",
        "repos/dmprav/merit/issues/7/comments?per_page=100",
      ],
      [
        "api",
        "--hostname",
        "github.com",
        "--paginate",
        "--slurp",
        "repos/dmprav/merit/issues?state=open&per_page=100",
      ],
    ]);
  });

  test("reads and rewrites the scout state issue with GET and PATCH", () => {
    const { calls, exec } = fakeGh(respondToIssueRequests);
    const client = createGitHubIssueClient({ repoRoot: "/repo", repo, exec });

    expect(client.viewIssue(219)).toEqual({
      number: 219,
      state: "OPEN",
      title: "chore: agent scout state",
      body: "state",
    });
    client.editIssueBody(219, "next = state");

    expect(calls).toEqual([
      ["api", "--hostname", "github.com", "repos/dmprav/merit/issues/219"],
      [
        "api",
        "--hostname",
        "github.com",
        "repos/dmprav/merit/issues/219",
        "-X",
        "PATCH",
        "-f",
        "body=next = state",
      ],
    ]);
  });

  test("files an issue with every label as a POST form field and returns its URL", () => {
    const { calls, exec } = fakeGh(respondToIssueRequests);
    const client = createGitHubIssueClient({ repoRoot: "/repo", repo, exec });

    expect(
      client.createIssue({
        title: "T",
        body: "B",
        labels: [AGENT_LABELS.ready, AGENT_LABELS.maintenance],
      }),
    ).toBe("https://github.com/dmprav/merit/issues/400");

    expect(calls).toEqual([
      [
        "api",
        "--hostname",
        "github.com",
        "repos/dmprav/merit/issues",
        "-X",
        "POST",
        "-f",
        "title=T",
        "-f",
        "body=B",
        "-f",
        "labels[]=agent:ready",
        "-f",
        "labels[]=type:maintenance",
      ],
    ]);
  });

  test("fails with the created issue's URL when GitHub silently drops a requested label", () => {
    const { exec } = fakeGh(() => ({
      html_url: "https://github.com/dmprav/merit/issues/401",
      labels: [{ name: "type:maintenance" }],
    }));
    const client = createGitHubIssueClient({ repoRoot: "/repo", repo, exec });

    expect(() =>
      client.createIssue({
        title: "T",
        body: "B",
        labels: [AGENT_LABELS.proposed, AGENT_LABELS.design, AGENT_LABELS.maintenance],
      }),
    ).toThrow(
      "Issue created at https://github.com/dmprav/merit/issues/401, but GitHub did not apply requested label(s): agent:proposed, agent:design.",
    );
  });

  test("reads issue pages larger than Node's 1 MiB default output buffer", () => {
    const largeBody = "x".repeat(400_000);
    const fixture = createFakeGhFixture([
      [1, 2, 3, 4].map((number) => restIssue(number, { state: "closed", body: largeBody })),
    ]);
    const client = createGitHubIssueClient({ repoRoot: fixture.dir, repo, env: fixture.env() });

    const issues = client.listIssues({ state: "closed" });

    expect(issues).toHaveLength(4);
    expect(issues[0]?.body).toHaveLength(400_000);
  });
});

describe("GitHub transport guard", () => {
  const agentsDirectory = fileURLToPath(new URL(".", import.meta.url));
  const githubCallers = [
    "github.ts",
    "proposal.ts",
    "queue.ts",
    "scout.ts",
    ...readdirSync(join(agentsDirectory, "scout"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => `scout/${file}`),
  ];

  const sourceOf = (file: string) => readFileSync(join(agentsDirectory, file), "utf8");

  test("keeps gh behind github.ts and forbids GraphQL or gh issue, pr, and repo commands", () => {
    expect(githubCallers).toContain("scout/commands.ts");
    for (const file of githubCallers) {
      const source = sourceOf(file);
      expect(source, file).not.toMatch(/\(\s*"gh",\s*\[\s*"(?:pr|issue|repo)"/);
      expect(source, file).not.toMatch(/["'`]graphql["'`/]/);
      if (file !== "github.ts") {
        expect(source, file).not.toMatch(/["']gh["']/);
      }
    }
    expect(sourceOf("github.ts")).not.toMatch(/\bexec\(\[\s*(?!"api")/);
  });
});
