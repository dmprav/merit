import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  codeFenceCloser,
  readChangedFiles,
  type ChangedFile,
  type CheckResult,
} from "./verification-record.ts";

/** Every label the autonomous maintenance workflow reads or writes on issues and pull requests. */
export const AGENT_LABELS = {
  /** An approved proposal the queue may implement. */
  ready: "agent:ready",
  /** A Tier 2 proposal awaiting maintainer approval. */
  proposed: "agent:proposed",
  /** An architecture design or multi-PR proposal that is never implemented automatically. */
  design: "agent:design",
  /** A pull request opened by the autonomous workflow. */
  pr: "agent:pr",
  /** Work the autonomous workflow has handed to a maintainer. */
  needsHuman: "agent:needs-human",
  /** A maintainer's permission for an agent PR to change protected paths. */
  allowProtected: "agent:allow-protected",
  maintenance: "type:maintenance",
  wontfix: "wontfix",
  duplicate: "duplicate",
} as const;

export type AgentLabel = (typeof AGENT_LABELS)[keyof typeof AGENT_LABELS];

export const TRUSTED_AUTHOR_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export const PROTECTED_DIR_PREFIXES = [
  ".github/",
  ".agents/hooks/",
  ".claude/",
  "tooling/agents/",
  "tooling/verification/",
  "foundation/db/database/migrations/",
  "capabilities/access/src/",
] as const;

export const PROTECTED_EXACT_FILES = new Set([".fallowrc.jsonc", "vite.config.ts"]);

const MIGRATION_DIR_PREFIX = "foundation/db/database/migrations/";
const LINKED_ISSUE_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;
const PROPOSAL_MARKER_GLOBAL = /<!--\s*merit-proposal:\s*(\{[\s\S]*?\})\s*-->/g;
const APPROVE_PROTECTED_MARKER_GLOBAL = /<!--\s*merit-approve-protected:\s*(\{[\s\S]*?\})\s*-->/g;
const CATCH_ALL_PATTERN = /^\*+(?:\/\*+)*$/;

/** What a filed proposal's marker records about where it came from and how it was proven. */
export type ProposalMarkerData = {
  paths: string[];
  kind?: string;
  /** The scout run that found it, for a depth 0 finding. */
  run?: string;
  /** The issue or pull request whose work filed it, for a follow-up. */
  parent?: { type: "issue" | "pr"; number: number };
  /** Steps from a scout finding: 0 for the finding itself, one more per follow-up. */
  depth?: number;
  evidence?: { type: string; branch?: string; commit?: string };
};

export type IssueCommentRecord = {
  authorAssociation: string;
  body: string;
};

export type LinkedIssueApprovalRecord = {
  number: number;
  state: string;
  labels: string[];
  comments: IssueCommentRecord[];
};

// CI runs this file from a trusted copy beside verification-record.ts alone, so it keeps its own
// copy of tooling/cli.ts's normalizeRepoPath.
const normalizePath = (value: string) => value.replaceAll("\\", "/").replace(/^\.\//, "");

/** Uses directory-prefix and exact checks so dotfiles under protected trees are never skipped. */
export const isProtectedPath = (filePath: string): boolean => {
  const normalized = normalizePath(filePath);
  if (PROTECTED_EXACT_FILES.has(normalized)) {
    return true;
  }
  return PROTECTED_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export const findProtectedPaths = (paths: readonly string[]): string[] =>
  [...new Set(paths.map(normalizePath).filter(isProtectedPath))].sort();

const isAppliedMigrationSql = (filePath: string): boolean => {
  const normalized = normalizePath(filePath);
  if (!normalized.startsWith(MIGRATION_DIR_PREFIX) || !normalized.endsWith(".sql")) {
    return false;
  }
  const remainder = normalized.slice(MIGRATION_DIR_PREFIX.length);
  return remainder.length > 0 && !remainder.includes("/");
};

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
    fence = codeFenceCloser(line);
    if (fence) {
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
  const firstSegment = normalized.split("/")[0] ?? "";
  return firstSegment.length > 0 && !/[*?{}[\]]/.test(firstSegment);
};

/** Reads a marker's JSON payload, or null when it is not valid JSON or not a plain object. */
const parseMarkerObject = (raw: string): object | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const readParent = (value: unknown): ProposalMarkerData["parent"] =>
  isRecord(value) &&
  (value.type === "issue" || value.type === "pr") &&
  typeof value.number === "number" &&
  Number.isSafeInteger(value.number) &&
  value.number > 0
    ? { type: value.type, number: value.number }
    : undefined;

const readEvidence = (value: unknown): ProposalMarkerData["evidence"] => {
  const type = isRecord(value) ? stringField(value, "type") : undefined;
  if (!isRecord(value) || !type) {
    return undefined;
  }
  const branch = stringField(value, "branch");
  const commit = stringField(value, "commit");
  return { type, ...(branch ? { branch } : {}), ...(commit ? { commit } : {}) };
};

/** Keeps a marker's non-blank string paths, normalized, and the provenance fields that are well formed. */
const toPathsMarkerData = (marker: object): ProposalMarkerData => {
  const fields: Record<string, unknown> = { ...marker };
  const rawPaths: unknown[] = Array.isArray(fields.paths) ? fields.paths : [];
  const paths = rawPaths
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map(normalizePath);
  const kind = stringField(fields, "kind");
  const run = stringField(fields, "run");
  const parent = readParent(fields.parent);
  const depth =
    typeof fields.depth === "number" && Number.isSafeInteger(fields.depth) && fields.depth >= 0
      ? fields.depth
      : undefined;
  const evidence = readEvidence(fields.evidence);
  return {
    paths,
    ...(kind ? { kind } : {}),
    ...(run ? { run } : {}),
    ...(parent ? { parent } : {}),
    ...(depth !== undefined ? { depth } : {}),
    ...(evidence ? { evidence } : {}),
  };
};

const parseLastPathsMarker = (markdown: string, pattern: RegExp): ProposalMarkerData | null => {
  const markers = [...stripFencedCodeBlocks(markdown).matchAll(pattern)].flatMap((match) => {
    const marker = match[1] ? parseMarkerObject(match[1]) : null;
    return marker ? [toPathsMarkerData(marker)] : [];
  });
  return markers.at(-1) ?? null;
};

/** Parses the last `<!-- merit-proposal: {...} -->` marker outside fenced code blocks. */
export const parseProposalMarker = (issueBody: string): ProposalMarkerData | null =>
  parseLastPathsMarker(issueBody, PROPOSAL_MARKER_GLOBAL);

/**
 * Parses the latest maintainer-authored `<!-- merit-approve-protected: {"paths":[...]} -->`
 * comment on an issue so the approved scope cannot be widened by editing the issue body.
 */
export const parseMaintainerProtectedApproval = (
  comments: readonly IssueCommentRecord[],
): ProposalMarkerData | null => {
  let latest: ProposalMarkerData | null = null;
  for (const comment of comments) {
    if (!TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation)) {
      continue;
    }
    const marker = parseLastPathsMarker(comment.body, APPROVE_PROTECTED_MARKER_GLOBAL);
    if (marker) {
      latest = marker;
    }
  }
  return latest;
};

const isMaintainerAuthorizedIssue = (issue: LinkedIssueApprovalRecord): boolean =>
  issue.state === "OPEN" &&
  issue.labels.includes(AGENT_LABELS.allowProtected) &&
  !issue.labels.includes(AGENT_LABELS.wontfix) &&
  !issue.labels.includes(AGENT_LABELS.proposed);

const matchesApprovedPattern = (filePath: string, pattern: string): boolean => {
  if (pattern === filePath) {
    return true;
  }
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -2);
    if (!/[*?{}[\]]/.test(prefix)) {
      return filePath.startsWith(prefix);
    }
  }
  return matchesGlob(filePath, pattern);
};

const isApprovedByIssue = (
  filePath: string,
  issues: readonly LinkedIssueApprovalRecord[],
): boolean => {
  for (const issue of issues) {
    if (!isMaintainerAuthorizedIssue(issue)) {
      continue;
    }
    const approval = parseMaintainerProtectedApproval(issue.comments);
    if (!approval) {
      continue;
    }
    const matched = approval.paths
      .filter(isNarrowApprovedPattern)
      .some((pattern) => matchesApprovedPattern(filePath, pattern));
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
}): CheckResult => {
  if (!isAgentPr) {
    return { exempt: `Pull request is not labeled ${AGENT_LABELS.pr}.` };
  }

  const errors: string[] = [];
  for (const file of changedFiles) {
    const normalized = normalizePath(file.path);
    if (
      (file.status === "modified" || file.status === "deleted") &&
      isAppliedMigrationSql(normalized)
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
        `${filePath}: protected path requires an OPEN linked issue labeled "${AGENT_LABELS.allowProtected}" with a maintainer-authored <!-- merit-approve-protected: {"paths":[...]} --> comment covering this file.`,
      );
    }
  }

  return { exempt: null, errors };
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

const parseComments = (rawComments: unknown): IssueCommentRecord[] => {
  if (!Array.isArray(rawComments)) {
    return [];
  }
  const entries: readonly unknown[] = rawComments;
  return entries.flatMap((entry): IssueCommentRecord[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const body = "body" in entry && typeof entry.body === "string" ? entry.body : "";
    const authorAssociation =
      "authorAssociation" in entry && typeof entry.authorAssociation === "string"
        ? entry.authorAssociation
        : "";
    return [{ body, authorAssociation }];
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
      ["issue", "view", String(issueNumber), "--json", "number,state,labels,comments"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const state = "state" in parsed && typeof parsed.state === "string" ? parsed.state : "";
    const labels = "labels" in parsed ? parseLabelNames(parsed.labels) : [];
    const comments = "comments" in parsed ? parseComments(parsed.comments) : [];
    return { number: issueNumber, state, labels, comments };
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
  const repoRoot = process.env.MERIT_REPO_ROOT
    ? resolve(process.env.MERIT_REPO_ROOT)
    : resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const prNumber = process.env.PR_NUMBER?.trim() || "";
  const livePr = prNumber ? fetchLivePrContext(repoRoot, prNumber) : null;
  const labels = livePr ? livePr.labels : readFallbackLabels();
  const prBody = livePr ? livePr.body : (process.env.PR_BODY ?? "");
  const isAgentPr = labels.includes(AGENT_LABELS.pr);

  if (!isAgentPr) {
    console.log(`agent-policy: exempt (not labeled ${AGENT_LABELS.pr})`);
    return;
  }

  const baseSha = process.env.PR_BASE_SHA || "origin/main";
  const headSha = process.env.PR_HEAD_SHA || "HEAD";
  const changedFiles = readChangedFiles(repoRoot, `${baseSha}...${headSha}`);
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

if (import.meta.main) {
  runCli();
}
