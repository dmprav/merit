import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { z } from "zod";

import { normalizeRepoPath, parseCliArgs } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import {
  AGENT_LABELS,
  extractLinkedIssueNumbers,
  findProtectedPaths,
  parseProposalMarker,
} from "../verification/agent-policy.ts";
import {
  classifyChangedPaths,
  type MechanismClassification,
} from "../verification/architecture/mechanisms.ts";
import { createGitHubIssueClient, type GitHubIssueClient } from "./github.ts";
import { hasRunIdForm } from "./scout/runs.ts";

/** A pull request proposal at most this many steps from a scout finding is ready for a work session. */
export const MAX_READY_DEPTH = 2;

const EVIDENCE_OUTPUT_MAX_LENGTH = 1500;

const TEST_FILE_PATTERN = /\.(?:test|spec|integration)\.tsx?$/;
const TIER1_DOC_PATTERN =
  /^(?:docs\/.+\.(?:md|mdx)$|(?:capabilities|foundation|interfaces|app|tooling)\/.+\/README\.md$)/;
const GLOB_CHAR_PATTERN = /[*?{}[\]]/;

const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !value.includes("\n"), "must be a single line");

const nonAgentLabelSchema = singleLine(40)
  .refine(
    (label) => !/[,`"']/.test(label),
    "extraLabels must be a single label without commas or quotes",
  )
  .refine(
    (label) => !label.toLowerCase().startsWith("agent:"),
    "extraLabels cannot contain workflow-controlled agent:* labels",
  );

const evidenceSchema = z
  .object({
    type: z.enum(["failing-test", "surviving-mutation", "command"]),
    /** What was run, so a builder can run it again. */
    command: singleLine(300),
    /** The relevant excerpt of what the command printed. */
    output: z.string().trim().min(1).max(EVIDENCE_OUTPUT_MAX_LENGTH),
    citations: z
      .array(singleLine(200).regex(/^[^\s:]+:\d+(?:-\d+)?$/, "must be file:line"))
      .min(1)
      .max(8),
    branch: z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "must be a plain branch name")
      .refine((branch) => !branch.includes(".."), "must be a plain branch name")
      .optional(),
    commit: z
      .string()
      .regex(/^[0-9a-f]{7,40}$/, "must be a lowercase commit hash")
      .optional(),
  })
  .superRefine((evidence, context) => {
    if (evidence.type === "failing-test" && (!evidence.branch || !evidence.commit)) {
      context.addIssue({
        code: "custom",
        message: "a failing-test needs the evidence branch and the commit holding the test",
      });
    }
  });

export type ProposalEvidence = z.output<typeof evidenceSchema>;

const parentSchema = z.object({
  type: z.enum(["issue", "pr"]),
  number: z.number().int().positive(),
});

const baseProposalFields = {
  /** The scout run that found it (depth 0); a follow-up names `parent` instead. */
  run: z
    .string()
    .refine(hasRunIdForm, "must be a run id such as change-batch or area:<area>")
    .optional(),
  parent: parentSchema.optional(),
  title: singleLine(100),
  why: singleLine(220),
  evidence: evidenceSchema,
  change: z.array(singleLine(140)).min(1).max(5),
  decision: singleLine(200),
  whyNot: singleLine(200),
  paths: z.array(singleLine(200)).min(1),
  ambiguous: z.boolean().default(false),
  extraLabels: z.array(nonAgentLabelSchema).default([]),
};

const prProposalSchema = z.object({
  ...baseProposalFields,
  kind: z.literal("pr"),
  brief: z.object({
    behavior: z.array(singleLine(200)).min(1),
    outOfScope: z.array(singleLine(200)).default([]),
    precedents: z.array(singleLine(200)).default([]),
    plan: z.array(singleLine(200)).min(1),
    verification: z.array(singleLine(200)).min(1),
  }),
});

const designProposalSchema = z.object({
  ...baseProposalFields,
  kind: z.literal("design"),
  design: z.object({
    options: z.array(singleLine(200)).min(2).max(3),
    recommendation: singleLine(200),
    prSequence: z.array(singleLine(200)).min(2).max(4),
    openQuestions: z.array(singleLine(200)).min(1).max(4),
  }),
});

export const proposalInputSchema = z.preprocess(
  (raw) =>
    raw && typeof raw === "object" && !Array.isArray(raw) && !("kind" in raw)
      ? { ...raw, kind: "pr" }
      : raw,
  z
    .discriminatedUnion("kind", [prProposalSchema, designProposalSchema])
    .refine(
      (proposal) => (proposal.run === undefined) !== (proposal.parent === undefined),
      "name exactly one source: `run` for a scout finding or `parent` for a follow-up",
    ),
);

export type ProposalInput = z.output<typeof proposalInputSchema>;

export type ProposalKind = ProposalInput["kind"];

export type ProposalTier = 1 | 2;

export type ProposalTierClassification = {
  tier: ProposalTier;
  reasons: string[];
  protectedPaths: string[];
  mechanisms: MechanismClassification;
  slices: string[];
};

export type ExistingIssueSummary = {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  labels: string[];
  body?: string;
};

export type DuplicateCheckResult =
  | { duplicate: true; matchedIssue: ExistingIssueSummary; reason: string }
  | { duplicate: false };

export const sliceForPath = (filePath: string): string => {
  const normalized = normalizeRepoPath(filePath);
  const parts = normalized.split("/");
  if (
    (parts[0] === "capabilities" || parts[0] === "foundation" || parts[0] === "interfaces") &&
    parts[1]
  ) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? ".";
};

export const isTier1DocPath = (filePath: string): boolean => {
  const normalized = normalizeRepoPath(filePath);
  return !GLOB_CHAR_PATTERN.test(normalized) && TIER1_DOC_PATTERN.test(normalized);
};

/**
 * A pull request proposal near its scout finding, with nothing left to decide, is ready for a work
 * session; designs, ambiguous proposals, and follow-ups deeper than `MAX_READY_DEPTH` wait for the
 * maintainer.
 */
export const targetLabelFor = (
  proposal: Pick<ProposalInput, "kind" | "ambiguous">,
  depth: number,
) =>
  proposal.kind === "pr" && depth <= MAX_READY_DEPTH && !proposal.ambiguous
    ? AGENT_LABELS.ready
    : AGENT_LABELS.proposed;

export const classifyProposalTier = ({
  paths,
  ambiguous,
  kind = "pr",
}: {
  paths: readonly string[];
  ambiguous: boolean;
  kind?: ProposalKind;
}): ProposalTierClassification => {
  const normalizedPaths = [...new Set(paths.map(normalizeRepoPath))];
  const protectedPaths = findProtectedPaths(normalizedPaths);
  const mechanisms = classifyChangedPaths({ paths: normalizedPaths });
  const slices = [...new Set(normalizedPaths.map(sliceForPath))].sort();
  const hasGlobs = normalizedPaths.some((filePath) => GLOB_CHAR_PATTERN.test(filePath));
  const allTier1Docs = !hasGlobs && normalizedPaths.every(isTier1DocPath);
  const allTestsInOneSlice =
    !hasGlobs &&
    slices.length === 1 &&
    normalizedPaths.every((filePath) => TEST_FILE_PATTERN.test(filePath));

  const reasons: string[] = [];
  if (kind === "design") {
    reasons.push(`architecture design or multi-PR proposal (${AGENT_LABELS.design})`);
  }
  if (ambiguous) {
    reasons.push("proposal marks an unresolved ambiguity or product decision");
  }
  if (protectedPaths.length > 0) {
    reasons.push(`touches protected path(s): ${protectedPaths.join(", ")}`);
  }
  if (hasGlobs) {
    reasons.push("uses wildcard path globs rather than explicit files");
  }
  if (mechanisms.risk === "extends") {
    reasons.push(
      `extends mechanism contract(s): ${mechanisms.matched
        .filter((entry) => entry.impact === "extends")
        .map((entry) => entry.mechanism.id)
        .join(", ")}`,
    );
  }
  if (!allTier1Docs && !allTestsInOneSlice) {
    reasons.push("changes production, config, root/record docs, or multi-slice code");
  }

  return {
    tier: reasons.length === 0 ? 1 : 2,
    reasons,
    protectedPaths,
    mechanisms,
    slices,
  };
};

const tokenize = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );

const jaccard = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

/** Title token similarity at which two proposals touching the same files are duplicates. */
const DUPLICATE_TITLE_SIMILARITY = 0.6;
/** Title token similarity at which heavily overlapping file sets mark a duplicate. */
const RELATED_TITLE_SIMILARITY = 0.25;
/** Share of the smaller file set that two proposals must have in common to overlap heavily. */
const DUPLICATE_PATH_OVERLAP = 0.7;

type ProposalFingerprint = {
  normalizedTitle: string;
  titleTokens: Set<string>;
  paths: Set<string>;
};

/** Open issues, and closed issues rejected as won't-fix or duplicate, block a matching proposal. */
const blocksMatchingProposals = (issue: ExistingIssueSummary) =>
  issue.state === "OPEN" ||
  issue.labels.some((label) => label === AGENT_LABELS.wontfix || label === AGENT_LABELS.duplicate);

/** Explains why `issue` duplicates the proposal, or returns null when it does not. */
const duplicateReason = (
  proposal: ProposalFingerprint,
  issue: ExistingIssueSummary,
): string | null => {
  if (issue.title.trim().toLowerCase() === proposal.normalizedTitle) {
    return `matches existing ${issue.state.toLowerCase()} issue #${issue.number} title`;
  }

  const similarity = jaccard(proposal.titleTokens, tokenize(issue.title));
  const markerMeta = issue.body ? parseProposalMarker(issue.body) : null;
  const existingPaths = (markerMeta?.paths ?? []).map(normalizeRepoPath);
  const sharedPathCount = existingPaths.filter((filePath) => proposal.paths.has(filePath)).length;
  const pathsCompatible = sharedPathCount > 0 || existingPaths.length === 0;
  if (similarity >= DUPLICATE_TITLE_SIMILARITY && pathsCompatible) {
    return `high title similarity (${similarity.toFixed(2)}) with #${issue.number}`;
  }

  const minPathCount = Math.min(proposal.paths.size, existingPaths.length);
  const pathOverlap = minPathCount > 0 ? sharedPathCount / minPathCount : 0;
  if (pathOverlap >= DUPLICATE_PATH_OVERLAP && similarity >= RELATED_TITLE_SIMILARITY) {
    return `high path overlap (${Math.round(pathOverlap * 100)}%) and related title (${similarity.toFixed(2)}) with #${issue.number}`;
  }
  return null;
};

export const findDuplicateProposal = (
  proposal: Pick<ProposalInput, "title" | "paths">,
  existingIssues: readonly ExistingIssueSummary[],
): DuplicateCheckResult => {
  const fingerprint: ProposalFingerprint = {
    normalizedTitle: proposal.title.trim().toLowerCase(),
    titleTokens: tokenize(proposal.title),
    paths: new Set(proposal.paths.map(normalizeRepoPath)),
  };
  for (const issue of existingIssues.filter(blocksMatchingProposals)) {
    const reason = duplicateReason(fingerprint, issue);
    if (reason !== null) {
      return { duplicate: true, matchedIssue: issue, reason };
    }
  }
  return { duplicate: false };
};

const renderBullets = (items: readonly string[]) =>
  items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None.";

const renderDetails = (summary: string, body: readonly string[]) => [
  "<details>",
  `<summary>${summary}</summary>`,
  "",
  ...body,
  "</details>",
];

const renderDesignDetails = (
  design: Extract<ProposalInput, { kind: "design" }>["design"],
): string[] =>
  renderDetails("Architecture design & sequencing (not auto-executed)", [
    "**Options:**",
    renderBullets(design.options),
    "",
    `**Recommendation:** ${design.recommendation}`,
    "",
    "**PR sequence:**",
    ...design.prSequence.map((step, index) => `${index + 1}. ${step}`),
    "",
    "**Open questions:**",
    renderBullets(design.openQuestions),
    "",
  ]);

const renderBriefDetails = (brief: Extract<ProposalInput, { kind: "pr" }>["brief"]): string[] =>
  renderDetails(
    "Implementer brief (for builder & reviewer)",
    (
      [
        ["Behavior", brief.behavior],
        ["Out of scope", brief.outOfScope],
        ["Precedents", brief.precedents],
        ["Plan", brief.plan],
        ["Verification", brief.verification],
      ] as const
    ).flatMap(([heading, items]) => [`**${heading}:**`, renderBullets(items), ""]),
  );

/** Names where the proposal came from: its scout run, or the issue or pull request it follows up. */
const describeSource = (proposal: Pick<ProposalInput, "run" | "parent">): string =>
  proposal.run !== undefined
    ? `run:${proposal.run}`
    : `parent:${proposal.parent?.type === "pr" ? "PR " : ""}#${proposal.parent?.number}`;

/** Summarizes the proposal's tier, kind, source, depth, size, slices, mechanisms, and protected paths on one line. */
const renderBlastRadius = (
  proposal: ProposalInput,
  classification: ProposalTierClassification,
  depth: number,
  fileCount: number,
): string => {
  const mechanismSummary =
    classification.mechanisms.matched.length > 0
      ? classification.mechanisms.matched.map((entry) => entry.mechanism.id).join(", ")
      : "none";
  const protectedNote =
    classification.protectedPaths.length > 0
      ? ` · protected: ${classification.protectedPaths.join(", ")}`
      : "";
  const kindBadge = proposal.kind === "design" ? " · design" : "";
  return `tier:${classification.tier}${kindBadge} · ${describeSource(proposal)} · depth:${depth} · ~${fileCount} file(s) · slices: ${classification.slices.join(", ")} · mechanisms: ${mechanismSummary}${protectedNote}`;
};

/** A backtick fence longer than any backtick run inside `text`, so evidence cannot close it early. */
const fenceFor = (text: string): string =>
  "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((match) => match[0].length + 1)));

/** What a builder needs to confirm the finding: the command, its output, where, and the test to pick up. */
const renderEvidence = (evidence: ProposalEvidence): string[] => {
  const transcript = `$ ${evidence.command}\n${evidence.output}`;
  const fence = fenceFor(transcript);
  const reproduction =
    evidence.branch && evidence.commit
      ? [
          "",
          `Branch \`${evidence.branch}\`, commit \`${evidence.commit}\`. Pick up the ${evidence.type === "failing-test" ? "failing test" : "evidence commit"}:`,
          "",
          `\`git fetch origin ${evidence.branch} && git cherry-pick ${evidence.commit}\``,
        ]
      : [];
  return [
    `**Evidence:** ${evidence.type}`,
    "",
    `${fence}text`,
    transcript,
    fence,
    "",
    ...evidence.citations.map((citation) => `- \`${citation}\``),
    ...reproduction,
    "",
  ];
};

export const renderProposalMarkdown = (
  proposal: ProposalInput,
  classification: ProposalTierClassification,
  depth: number,
): string => {
  const normalizedPaths = [...new Set(proposal.paths.map(normalizeRepoPath))];
  const { type, branch, commit } = proposal.evidence;
  const metadata = JSON.stringify({
    kind: proposal.kind,
    ...(proposal.run !== undefined ? { run: proposal.run } : { parent: proposal.parent }),
    depth,
    tier: classification.tier,
    paths: normalizedPaths,
    evidence: { type, ...(branch ? { branch } : {}), ...(commit ? { commit } : {}) },
  });

  return [
    `**${proposal.title}**`,
    `\`${renderBlastRadius(proposal, classification, depth, normalizedPaths.length)}\``,
    "",
    `**Why:** ${proposal.why}`,
    "",
    ...renderEvidence(proposal.evidence),
    "**Change:**",
    ...proposal.change.map((item) => `- ${item}`),
    `**Decision / catch:** ${proposal.decision}`,
    `**Why NOT:** ${proposal.whyNot}`,
    "",
    ...(proposal.kind === "design"
      ? renderDesignDetails(proposal.design)
      : renderBriefDetails(proposal.brief)),
    "",
    `<!-- merit-proposal: ${metadata} -->`,
    "",
  ].join("\n");
};

const listExistingIssues = (
  client: Pick<GitHubIssueClient, "listIssues">,
): ExistingIssueSummary[] => {
  const byNumber = new Map<number, ExistingIssueSummary>();
  for (const issue of [
    ...client.listIssues({ state: "open" }),
    ...client.listIssues({ state: "closed", label: AGENT_LABELS.wontfix }),
    ...client.listIssues({ state: "closed", label: AGENT_LABELS.duplicate }),
  ]) {
    byNumber.set(issue.number, issue);
  }
  return [...byNumber.values()];
};

/** Steps from a scout finding that a marker records, or 0 for an issue no scout or work session filed. */
const markerDepth = (body: string): number => parseProposalMarker(body)?.depth ?? 0;

/**
 * Computes a proposal's depth: 0 for a scout finding, else one more than its parent issue's, or than
 * the issue a parent pull request closes (depth 1 when it closes none). Reads the parent, so a
 * parent that does not exist refuses the proposal.
 */
export const resolveProposalDepth = (
  client: Pick<GitHubIssueClient, "viewIssue">,
  { parent }: Pick<ProposalInput, "parent">,
): number => {
  if (!parent) {
    return 0;
  }
  const { body } = client.viewIssue(parent.number);
  if (parent.type === "issue") {
    return markerDepth(body) + 1;
  }
  const [closedIssue] = extractLinkedIssueNumbers(body);
  return closedIssue === undefined ? 1 : markerDepth(client.viewIssue(closedIssue).body) + 1;
};

/**
 * Refuses evidence whose commit is not on `origin/<branch>`, fetching the branch first, so a builder
 * can always pick up the test the scout proved the finding with.
 */
export const verifyEvidenceBranch = (
  repoRoot: string,
  { branch, commit }: Pick<ProposalEvidence, "branch" | "commit">,
): void => {
  if (!branch || !commit) {
    return;
  }

  const git = (args: readonly string[]) =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });

  try {
    git(["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
    git(["merge-base", "--is-ancestor", commit, `origin/${branch}`]);
  } catch (error) {
    throw new Error(
      `Evidence commit ${commit} is not reachable from origin/${branch}. Push the evidence branch, then file again.`,
      { cause: error },
    );
  }
};

export type ProposalCliOptions = { file?: string; dryRun: boolean };

/** Rejects unknown flags before any GitHub call, so a misspelt `--dry-run` never files an issue. */
export const parseProposalArgs = (args: readonly string[]): ProposalCliOptions => {
  const { values } = parseCliArgs(args, {
    options: {
      file: { type: "string" },
      "dry-run": { type: "boolean" },
    },
    usage: "Usage: proposal.ts [--file <proposal.json>] [--dry-run] (reads stdin without --file)",
  });
  // Only an absent --file reads stdin; an empty one would silently read a different proposal.
  if (values.file === "") {
    throw new Error("--file requires a value.");
  }
  return {
    ...(values.file !== undefined ? { file: values.file } : {}),
    dryRun: values["dry-run"] ?? false,
  };
};

/** Labels a filed proposal: ready or proposed, then design, maintenance, and the scout's extras. */
export const selectProposalLabels = (
  proposal: Pick<ProposalInput, "kind" | "ambiguous" | "extraLabels">,
  depth: number,
): string[] => [
  ...new Set([
    targetLabelFor(proposal, depth),
    ...(proposal.kind === "design" ? [AGENT_LABELS.design] : []),
    AGENT_LABELS.maintenance,
    ...proposal.extraLabels,
  ]),
];

export type ProposalOutcome =
  | {
      status: "dry_run";
      kind: ProposalKind;
      depth: number;
      tier: ProposalTier;
      targetLabel: string;
      labels: string[];
      reasons: string[];
      markdown: string;
    }
  | { status: "duplicate"; matchedIssue: number; reason: string }
  | {
      status: "created";
      url: string;
      kind: ProposalKind;
      depth: number;
      tier: ProposalTier;
      targetLabel: string;
      labels: string[];
    };

/**
 * Checks a proposal's evidence branch, classifies and renders it, then files it as an issue unless
 * this is a dry run or an existing issue already covers it. Throws, filing nothing, when the
 * evidence commit is not on its branch or the parent cannot be read.
 */
export const fileProposal = (
  client: Pick<GitHubIssueClient, "listIssues" | "createIssue" | "viewIssue">,
  proposal: ProposalInput,
  {
    dryRun,
    verifyEvidence,
  }: { dryRun: boolean; verifyEvidence: (evidence: ProposalEvidence) => void },
): ProposalOutcome => {
  verifyEvidence(proposal.evidence);
  const depth = resolveProposalDepth(client, proposal);
  const classification = classifyProposalTier({
    paths: proposal.paths,
    ambiguous: proposal.ambiguous,
    kind: proposal.kind,
  });
  const { tier, reasons } = classification;
  const targetLabel = targetLabelFor(proposal, depth);
  const markdown = renderProposalMarkdown(proposal, classification, depth);
  const labels = selectProposalLabels(proposal, depth);

  if (dryRun) {
    return {
      status: "dry_run",
      kind: proposal.kind,
      depth,
      tier,
      targetLabel,
      labels,
      reasons,
      markdown,
    };
  }

  const dup = findDuplicateProposal(proposal, listExistingIssues(client));
  if (dup.duplicate) {
    return { status: "duplicate", matchedIssue: dup.matchedIssue.number, reason: dup.reason };
  }

  const url = client.createIssue({ title: proposal.title, body: markdown, labels });
  return { status: "created", url, kind: proposal.kind, depth, tier, targetLabel, labels };
};

const runCli = () => {
  const { file: filePath, dryRun } = parseProposalArgs(process.argv.slice(2));

  const rawInput = filePath ? readFileSync(filePath, "utf8") : readFileSync(0, "utf8");
  const proposal = proposalInputSchema.parse(JSON.parse(rawInput));

  const client = createGitHubIssueClient({ repoRoot: REPO_ROOT });
  const outcome = fileProposal(client, proposal, {
    dryRun,
    verifyEvidence: (evidence) => verifyEvidenceBranch(REPO_ROOT, evidence),
  });
  console.log(
    outcome.status === "dry_run" ? JSON.stringify(outcome, null, 2) : JSON.stringify(outcome),
  );
};

if (import.meta.main) {
  runCli();
}
