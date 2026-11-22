import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseNameStatus, type ChangedFile } from "./verification-record.ts";

export const AGENT_PR_LABEL = "agent:pr";
export const ALLOW_PROTECTED_LABEL = "agent:allow-protected";

export const PROTECTED_PATH_PATTERNS = [
  ".github/**",
  ".agents/hooks/**",
  ".claude/**",
  ".fallowrc.jsonc",
  "tooling/agents/**",
  "tooling/verification/**",
  "vite.config.ts",
  "foundation/db/database/migrations/**",
  "capabilities/access/src/**",
] as const;

const APPLIED_MIGRATION_PATTERN = "foundation/db/database/migrations/*.sql";
const LINKED_ISSUE_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;
const PROPOSAL_MARKER_GLOBAL = /<!--\s*merit-proposal:\s*(\{[\s\S]*?\})\s*-->/g;
const CATCH_ALL_PATTERN = /^\*+(?:\/\*+)*$/;

export type ProposalMarkerData = {
  paths: string[];
};

export type LinkedIssueApprovalRecord = {
  number: number;
  state: string;
  labels: string[];
  body: string;
};

export type AgentPolicyResult = { exempt: string } | { exempt: null; errors: string[] };

const normalizePath = (value: string) => value.replaceAll("\\", "/").replace(/^\.\//, "");

export const isProtectedPath = (filePath: string): boolean => {
  const normalized = normalizePath(filePath);
  return PROTECTED_PATH_PATTERNS.some((pattern) => matchesGlob(normalized, pattern));
};

export const findProtectedPaths = (paths: readonly string[]): string[] =>
  [...new Set(paths.map(normalizePath).filter(isProtectedPath))].sort();

export const extractLinkedIssueNumbers = (prBody: string): number[] => {
  const numbers = new Set<number>();
  for (const match of prBody.matchAll(LINKED_ISSUE_PATTERN)) {
    const parsed = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      numbers.add(parsed);
    }
  }
  return [...numbers].sort((a, b) => a - b);
};

const stripFencedCodeBlocks = (markdown: string): string => {
  const kept: string[] = [];
  let fence: RegExp | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (fence) {
      if (fence.test(line)) {
        fence = null;
      }
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (opening) {
      fence = new RegExp(`^ {0,3}${opening[0]}{${opening.length},}\\s*$`);
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
};

const isNarrowApprovedPattern = (pattern: string): boolean => {
  const normalized = normalizePath(pattern).trim();
  if (!normalized || CATCH_ALL_PATTERN.test(normalized)) {
    return false;
  }
  // Require at least one concrete leading path segment before any wildcard.
  const firstSegment = normalized.split("/")[0] ?? "";
  return firstSegment.length > 0 && !/[*?{}[\]]/.test(firstSegment);
};

/** Parses the last `<!-- merit-proposal: {...} -->` marker outside fenced code blocks. */
export const parseProposalMarker = (issueBody: string): ProposalMarkerData | null => {
  const visible = stripFencedCodeBlocks(issueBody);
  let lastValid: ProposalMarkerData | null = null;
  for (const match of visible.matchAll(PROPOSAL_MARKER_GLOBAL)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      const rawPaths = "paths" in parsed && Array.isArray(parsed.paths) ? parsed.paths : [];
      const paths = rawPaths
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map(normalizePath);
      lastValid = { paths };
    } catch {
      continue;
    }
  }
  return lastValid;
};

const isMaintainerAuthorizedIssue = (issue: LinkedIssueApprovalRecord): boolean =>
  issue.state === "OPEN" &&
  issue.labels.includes(ALLOW_PROTECTED_LABEL) &&
  !issue.labels.includes("wontfix") &&
  !issue.labels.includes("agent:proposed");

const isApprovedByIssue = (
  filePath: string,
  issues: readonly LinkedIssueApprovalRecord[],
): boolean => {
  for (const issue of issues) {
    if (!isMaintainerAuthorizedIssue(issue)) {
      continue;
    }
    const marker = parseProposalMarker(issue.body);
    if (!marker) {
      continue;
    }
    const matched = marker.paths
      .filter(isNarrowApprovedPattern)
      .some((pattern) => pattern === filePath || matchesGlob(filePath, pattern));
    if (matched) {
      return true;
    }
  }
  return false;
};

export const checkAgentPolicy = ({
  isAgentPr,
  changedFiles,
  linkedIssues,
}: {
  isAgentPr: boolean;
  changedFiles: readonly ChangedFile[];
  linkedIssues: readonly LinkedIssueApprovalRecord[];
}): AgentPolicyResult => {
  if (!isAgentPr) {
    return { exempt: "Pull request is not labeled agent:pr." };
  }

  const errors: string[] = [];
  for (const file of changedFiles) {
    const normalized = normalizePath(file.path);
    if (
      (file.status === "modified" || file.status === "deleted") &&
      matchesGlob(normalized, APPLIED_MIGRATION_PATTERN)
    ) {
      errors.push(
        `${normalized}: autonomous PRs may never modify or delete an applied SQL migration.`,
      );
    }
  }

  const protectedFiles = findProtectedPaths(changedFiles.map((file) => file.path));
  for (const filePath of protectedFiles) {
    if (!isApprovedByIssue(filePath, linkedIssues)) {
      errors.push(
        `${filePath}: protected path requires an OPEN linked issue labeled "${ALLOW_PROTECTED_LABEL}" (not "agent:proposed" or "wontfix") whose proposal paths cover this file.`,
      );
    }
  }

  return { exempt: null, errors };
};

const readPrDiff = (repoRoot: string, baseSha: string, headSha: string): ChangedFile[] => {
  const raw = execFileSync(
    "git",
    ["diff", "--name-status", "--find-renames", `${baseSha}...${headSha}`],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return parseNameStatus(raw);
};

const parseLabelNames = (rawLabels: unknown): string[] => {
  if (!Array.isArray(rawLabels)) {
    return [];
  }
  const entries: readonly unknown[] = rawLabels;
  return entries.flatMap((entry): string[] => {
    if (typeof entry === "string") {
      return [entry];
    }
    if (entry && typeof entry === "object" && "name" in entry && typeof entry.name === "string") {
      return [entry.name];
    }
    return [];
  });
};

const fetchLivePrContext = (
  repoRoot: string,
  prNumber: string,
): { labels: string[]; body: string } | null => {
  try {
    const raw = execFileSync("gh", ["pr", "view", prNumber, "--json", "labels,body"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const labels = "labels" in parsed ? parseLabelNames(parsed.labels) : [];
    const body = "body" in parsed && typeof parsed.body === "string" ? parsed.body : "";
    return { labels, body };
  } catch {
    return null;
  }
};

const fetchLinkedIssue = (
  repoRoot: string,
  issueNumber: number,
): LinkedIssueApprovalRecord | null => {
  try {
    const raw = execFileSync(
      "gh",
      ["issue", "view", String(issueNumber), "--json", "number,state,labels,body"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const state = "state" in parsed && typeof parsed.state === "string" ? parsed.state : "";
    const body = "body" in parsed && typeof parsed.body === "string" ? parsed.body : "";
    const labels = "labels" in parsed ? parseLabelNames(parsed.labels) : [];
    return { number: issueNumber, state, labels, body };
  } catch {
    console.warn(`agent-policy: skipping unresolvable linked issue #${issueNumber}`);
    return null;
  }
};

const readFallbackLabels = (): string[] => {
  const jsonRaw = process.env.PR_LABELS_JSON;
  if (jsonRaw) {
    try {
      return parseLabelNames(JSON.parse(jsonRaw));
    } catch {
      return [];
    }
  }
  return (process.env.PR_LABELS ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
};

const writeStepSummary = (lines: readonly string[]) => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, `${lines.join("\n")}\n`);
  }
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const prNumber = process.env.PR_NUMBER?.trim() || "";
  const livePr = prNumber ? fetchLivePrContext(repoRoot, prNumber) : null;
  const labels = livePr ? livePr.labels : readFallbackLabels();
  const prBody = livePr ? livePr.body : (process.env.PR_BODY ?? "");
  const isAgentPr = labels.includes(AGENT_PR_LABEL);

  if (!isAgentPr) {
    console.log("agent-policy: exempt (not labeled agent:pr)");
    return;
  }

  const baseSha = process.env.PR_BASE_SHA || "origin/main";
  const headSha = process.env.PR_HEAD_SHA || "HEAD";
  const changedFiles = readPrDiff(repoRoot, baseSha, headSha);
  const protectedFiles = findProtectedPaths(changedFiles.map((file) => file.path));

  const linkedIssues =
    protectedFiles.length > 0
      ? extractLinkedIssueNumbers(prBody)
          .map((num) => fetchLinkedIssue(repoRoot, num))
          .filter((entry): entry is LinkedIssueApprovalRecord => entry !== null)
      : [];

  const result = checkAgentPolicy({ isAgentPr, changedFiles, linkedIssues });
  if (result.exempt !== null) {
    console.log(`agent-policy: exempt (${result.exempt})`);
    return;
  }
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`::error::${error}`);
    }
    writeStepSummary([
      "### Autonomous agent policy failed",
      "",
      ...result.errors.map((error) => `- ${error}`),
    ]);
    process.exitCode = 1;
    return;
  }
  console.log(`agent-policy ok (${changedFiles.length} changed file(s))`);
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
