import { describe, expect, test } from "vite-plus/test";

import { AGENT_LABELS } from "../verification/agent-policy.ts";
import {
  createGhExec,
  createGitHubIssueCliClient,
  createGitHubRestClient,
  ISSUE_LIST_LIMIT,
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
      expect(args[0]).toBe("api");
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
      "--paginate",
      "--slurp",
      "repos/dmprav/merit/issues/120/comments?per_page=100",
    ]);

    expect(client.listOpenIssues(AGENT_LABELS.pr).map((item) => item.isPullRequest)).toEqual([
      false,
      true,
    ]);
    expect(endpointOf(calls.at(-1) ?? [])).toBe(
      "repos/dmprav/merit/issues?state=open&labels=agent:pr&per_page=100",
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
        "repos/dmprav/merit/issues/120/comments",
        "-X",
        "POST",
        "-f",
        "body=body with = sign",
      ],
      [
        "api",
        "repos/dmprav/merit/issues/120/labels",
        "-X",
        "POST",
        "-f",
        "labels[]=agent:needs-human",
      ],
      ["api", "repos/dmprav/merit/actions/runs/9/rerun-failed-jobs", "-X", "POST"],
      ["api", "repos/dmprav/merit/pulls?state=open&head=dmprav%3Aclaude%2Fx&base=main&per_page=10"],
      [
        "api",
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
      ["api", "repos/dmprav/merit/pulls/221/comments/5/replies", "-X", "POST", "-f", "body=fixed"],
    ]);
  });
});

describe("repository identity", () => {
  test("parses GitHub owner/repo from SSH, HTTPS, and cloud proxy remote URLs", () => {
    expect(parseGitHubRemote("git@github.com:dmprav/merit.git")).toEqual(repo);
    expect(parseGitHubRemote("https://github.com/dmprav/merit.git")).toEqual(repo);
    expect(parseGitHubRemote("http://local_proxy@127.0.0.1:41234/git/dmprav/merit")).toEqual(repo);
    expect(parseGitHubRemote("https://example.com/not-a-repo")).toBeNull();
  });

  test("prefers GITHUB_REPOSITORY over the origin remote", () => {
    expect(resolveRepoIdentity("/nonexistent", { GITHUB_REPOSITORY: "dmprav/merit" })).toEqual(
      repo,
    );
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

  test("runs gh in the repository with scout credentials for scout and ambient ones for the queue", () => {
    const runs: Array<{ file: string; args: readonly string[]; cwd: string; token?: string }> = [];

    const execFile = (
      file: string,
      args: readonly string[],
      options: { cwd: string; env?: NodeJS.ProcessEnv },
    ) => {
      runs.push({
        file,
        args,
        cwd: options.cwd,
        ...(options.env ? { token: options.env.GH_TOKEN } : {}),
      });
      return "ok";
    };

    const env = { GH_TOKEN: "injected", [SCOUT_GH_TOKEN_ENV]: "scout" };

    expect(createGhExec({ repoRoot: "/repo", auth: "scout", env, execFile })(["issue"])).toBe("ok");
    createGhExec({ repoRoot: "/repo", auth: "ambient", env, execFile })(["api"]);

    expect(runs).toEqual([
      { file: "gh", args: ["issue"], cwd: "/repo", token: "scout" },
      { file: "gh", args: ["api"], cwd: "/repo" },
    ]);
  });
});

describe("GitHub issue CLI client", () => {
  test("lists issues with a named limit and normalizes missing bodies, labels, and comments", () => {
    const { calls, exec } = fakeGh(() => [
      {
        number: 7,
        title: "Rejected idea",
        state: "CLOSED",
        labels: [{ name: AGENT_LABELS.wontfix }],
        comments: [{ authorAssociation: "OWNER", body: "Not now." }],
      },
    ]);
    const client = createGitHubIssueCliClient({ repoRoot: "/repo", exec });

    expect(
      client.listIssues({ state: "closed", label: AGENT_LABELS.wontfix, withComments: true }),
    ).toEqual([
      {
        number: 7,
        title: "Rejected idea",
        state: "CLOSED",
        body: "",
        labels: ["wontfix"],
        comments: [{ authorAssociation: "OWNER", body: "Not now." }],
      },
    ]);
    client.listIssues({ state: "open" });

    expect(calls).toEqual([
      [
        "issue",
        "list",
        "--state",
        "closed",
        "--label",
        "wontfix",
        "--limit",
        String(ISSUE_LIST_LIMIT),
        "--json",
        "number,title,state,labels,body,comments",
      ],
      [
        "issue",
        "list",
        "--state",
        "open",
        "--limit",
        String(ISSUE_LIST_LIMIT),
        "--json",
        "number,title,state,labels,body",
      ],
    ]);
  });

  test("files an issue with every label and returns its trimmed URL", () => {
    const calls: string[][] = [];
    const client = createGitHubIssueCliClient({
      repoRoot: "/repo",
      exec: (args) => {
        calls.push([...args]);
        return "https://github.com/dmprav/merit/issues/9\n";
      },
    });

    expect(
      client.createIssue({
        title: "T",
        body: "B",
        labels: [AGENT_LABELS.ready, AGENT_LABELS.maintenance],
      }),
    ).toBe("https://github.com/dmprav/merit/issues/9");
    client.editIssueBody(219, "state");

    expect(calls).toEqual([
      [
        "issue",
        "create",
        "--title",
        "T",
        "--body",
        "B",
        "--label",
        "agent:ready",
        "--label",
        "type:maintenance",
      ],
      ["issue", "edit", "219", "--body", "state"],
    ]);
  });
});
