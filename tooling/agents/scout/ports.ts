import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createGitHubIssueClient, type GitHubIssueClient } from "../github.ts";
import { createFallowPort, type FallowPort } from "./fallow-reports.ts";
import { createGitPort, type GitPort } from "./git.ts";

export type IssuePort = Pick<GitHubIssueClient, "viewIssue" | "listIssues" | "editIssueBody">;

/** Everything a scout run reads from or writes to outside its own process. */
export type ScoutPorts = {
  git: GitPort;
  issues: IssuePort;
  fallow: FallowPort;
  /** Reads a repository-relative file from the working tree. */
  readFile: (repoPath: string) => string;
  now: () => Date;
  /** Reports a problem the run can continue past. */
  warn: (message: string) => void;
};

export const createScoutPorts = (repoRoot: string): ScoutPorts => ({
  git: createGitPort(repoRoot),
  issues: createGitHubIssueClient({ repoRoot }),
  fallow: createFallowPort(repoRoot),
  readFile: (repoPath) => readFileSync(resolve(repoRoot, repoPath), "utf8"),
  now: () => new Date(),
  warn: (message) => console.error(message),
});
