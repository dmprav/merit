import { execFileSync } from "node:child_process";

import { z } from "zod";

import { type IssueCommentRecord } from "../verification/agent-policy.ts";

export type RepoIdentity = {
  owner: string;
  name: string;
};

export const restLabelSchema = z.object({ name: z.string() });

const restCommentSchema = z.object({
  body: z.string().nullable().default(""),
  author_association: z.string().default(""),
});

export const restIssueItemSchema = z.object({
  number: z.number(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable().default(""),
  labels: z.array(restLabelSchema),
  comments: z.number().default(0),
  pull_request: z.unknown().optional(),
});

type RestIssueItem = z.output<typeof restIssueItemSchema>;

/** Parses GitHub owner/repo from HTTPS, SSH, or cloud-proxy git remote URLs without invoking GraphQL. */
export const parseGitHubRemote = (remoteUrl: string): RepoIdentity | null => {
  const trimmed = remoteUrl.trim().replace(/\.git$/, "");
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+)$/.exec(trimmed);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }
  const httpsMatch = /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }
  const proxyMatch = /^https?:\/\/[^/]+\/git\/([^/]+)\/([^/]+)$/.exec(trimmed);
  if (proxyMatch?.[1] && proxyMatch[2]) {
    return { owner: proxyMatch[1], name: proxyMatch[2] };
  }
  return null;
};

export const getRepoIdentity = (repoRoot: string): RepoIdentity => {
  const envRepo = process.env.GITHUB_REPOSITORY;
  if (envRepo && /^[^/]+\/[^/]+$/.test(envRepo)) {
    const [owner, name] = envRepo.split("/");
    if (owner && name) {
      return { owner, name };
    }
  }
  const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const parsed = parseGitHubRemote(remoteUrl);
  if (!parsed) {
    throw new Error(`Could not determine GitHub owner/repo from origin remote "${remoteUrl}".`);
  }
  return parsed;
};

export const ghApiJson = (
  repoRoot: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): unknown => {
  const raw = execFileSync("gh", ["api", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...(env ? { env } : {}),
  });
  return raw.trim() ? JSON.parse(raw) : null;
};

export const ghApiPaginatedArray = <T>(
  repoRoot: string,
  endpoint: string,
  itemSchema: z.ZodType<T>,
  env?: NodeJS.ProcessEnv,
): T[] => {
  const pages = z
    .array(z.array(itemSchema))
    .parse(ghApiJson(repoRoot, ["--paginate", "--slurp", endpoint], env));
  return pages.flat();
};

export const fetchRestIssueComments = (
  repoRoot: string,
  repo: RepoIdentity,
  number: number,
  env?: NodeJS.ProcessEnv,
): IssueCommentRecord[] =>
  ghApiPaginatedArray(
    repoRoot,
    `repos/${repo.owner}/${repo.name}/issues/${number}/comments?per_page=100`,
    restCommentSchema,
    env,
  ).map((comment) => ({
    body: comment.body ?? "",
    authorAssociation: comment.author_association,
  }));

/** Lists repository issues (excluding pull requests) via GitHub REST pagination. */
export const listRestIssues = ({
  repoRoot,
  repo,
  state,
  labels,
  env,
}: {
  repoRoot: string;
  repo: RepoIdentity;
  state: "open" | "closed" | "all";
  labels?: readonly string[];
  env?: NodeJS.ProcessEnv;
}): RestIssueItem[] => {
  const query = new URLSearchParams({ state, per_page: "100" });
  if (labels && labels.length > 0) {
    query.set("labels", labels.join(","));
  }
  return ghApiPaginatedArray(
    repoRoot,
    `repos/${repo.owner}/${repo.name}/issues?${query.toString()}`,
    restIssueItemSchema,
    env,
  ).filter((item) => item.pull_request === undefined);
};
