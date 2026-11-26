import { readFileSync } from "node:fs";

import { z } from "zod";

import { normalizeRepoPath, parseCliArgs } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import {
  AGENT_LABELS,
  findProtectedPaths,
  parseProposalMarker,
} from "../verification/agent-policy.ts";
import {
  classifyChangedPaths,
  type MechanismClassification,
} from "../verification/architecture/mechanisms.ts";
import { createGitHubIssueClient, type GitHubIssueClient } from "./github.ts";

export const SCOUT_LENSES = [
  "docs",
  "tests",
  "verification-flakes",
  "architecture",
  "simplification",
  "security",
  "mcp-db",
] as const;

export type ScoutLens = (typeof SCOUT_LENSES)[number];

export const MAX_OPEN_PROPOSALS = 5;

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

const baseProposalFields = {
  lens: z.enum(SCOUT_LENSES),
  title: singleLine(100),
  why: singleLine(220),
  evidence: singleLine(200),
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
  z.discriminatedUnion("kind", [prProposalSchema, designProposalSchema]),
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

export const isProposalCapReached = (openProposedCount: number): boolean =>
  openProposedCount >= MAX_OPEN_PROPOSALS;

/** Tier 1 proposals are ready for the queue; Tier 2 proposals wait for a maintainer. */
export const targetLabelForTier = (tier: ProposalTier) =>
  tier === 1 ? AGENT_LABELS.ready : AGENT_LABELS.proposed;

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

export const applyTier2OnlyOverride = (
  classification: ProposalTierClassification,
  tier2Only: boolean,
): ProposalTierClassification => {
  if (!tier2Only || classification.tier === 2) {
    return classification;
  }
  return {
    ...classification,
    tier: 2,
    reasons: [...classification.reasons, "calibration mode (--tier2-only)"],
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
  lens?: ScoutLens;
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
  const sameLens = !proposal.lens || !markerMeta?.lens || markerMeta.lens === proposal.lens;
  if (sameLens && pathOverlap >= DUPLICATE_PATH_OVERLAP && similarity >= RELATED_TITLE_SIMILARITY) {
    return `high path overlap (${Math.round(pathOverlap * 100)}%) and related title (${similarity.toFixed(2)}) with #${issue.number}`;
  }
  return null;
};

export const findDuplicateProposal = (
  proposal: Pick<ProposalInput, "title" | "paths"> & { lens?: ScoutLens },
  existingIssues: readonly ExistingIssueSummary[],
): DuplicateCheckResult => {
  const fingerprint: ProposalFingerprint = {
    normalizedTitle: proposal.title.trim().toLowerCase(),
    titleTokens: tokenize(proposal.title),
    paths: new Set(proposal.paths.map(normalizeRepoPath)),
    ...(proposal.lens ? { lens: proposal.lens } : {}),
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

/** Summarizes the proposal's tier, kind, lens, size, slices, mechanisms, and protected paths on one line. */
const renderBlastRadius = (
  proposal: ProposalInput,
  classification: ProposalTierClassification,
  fileCount: number,
): string => {
  const mechanismSummary =
    classification.mechanisms.matched.length > 0
      ? classification.mechanisms.matched.map((entry) => entry.mechanism.id).join(", ")
      : "none";
  const protectedNote =
    classification.protectedPaths.length > 0
      ? ` · protected (needs \`${AGENT_LABELS.allowProtected}\`): ${classification.protectedPaths.join(", ")}`
      : "";
  const kindBadge = proposal.kind === "design" ? " · design" : "";
  return `tier:${classification.tier}${kindBadge} · lens:${proposal.lens} · ~${fileCount} file(s) · slices: ${classification.slices.join(", ")} · mechanisms: ${mechanismSummary}${protectedNote}`;
};

export const renderProposalMarkdown = (
  proposal: ProposalInput,
  classification: ProposalTierClassification,
): string => {
  const normalizedPaths = [...new Set(proposal.paths.map(normalizeRepoPath))];
  const metadata = JSON.stringify({
    kind: proposal.kind,
    lens: proposal.lens,
    tier: classification.tier,
    paths: normalizedPaths,
  });

  return [
    `**${proposal.title}**`,
    `\`${renderBlastRadius(proposal, classification, normalizedPaths.length)}\``,
    "",
    `**Why:** ${proposal.why}`,
    `**Evidence:** ${proposal.evidence}`,
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

const countOpenProposedIssues = (client: Pick<GitHubIssueClient, "listIssues">): number =>
  client.listIssues({ state: "open", label: AGENT_LABELS.proposed }).length;

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

export type ProposalCliOptions = { file?: string; dryRun: boolean; tier2Only: boolean };

/** Rejects unknown flags before any GitHub call, so a misspelt `--dry-run` never files an issue. */
export const parseProposalArgs = (args: readonly string[]): ProposalCliOptions => {
  const { values } = parseCliArgs(args, {
    options: {
      file: { type: "string" },
      "dry-run": { type: "boolean" },
      "tier2-only": { type: "boolean" },
    },
    usage:
      "Usage: proposal.ts [--file <proposal.json>] [--dry-run] [--tier2-only] (reads stdin without --file)",
  });
  // Only an absent --file reads stdin; an empty one would silently read a different proposal.
  if (values.file === "") {
    throw new Error("--file requires a value.");
  }
  return {
    ...(values.file !== undefined ? { file: values.file } : {}),
    dryRun: values["dry-run"] ?? false,
    tier2Only: values["tier2-only"] ?? false,
  };
};

/** Labels a filed proposal: its tier's workflow label, then design, maintenance, and the scout's extras. */
export const selectProposalLabels = (
  proposal: Pick<ProposalInput, "kind" | "extraLabels">,
  classification: Pick<ProposalTierClassification, "tier">,
): string[] => [
  ...new Set([
    targetLabelForTier(classification.tier),
    ...(proposal.kind === "design" ? [AGENT_LABELS.design] : []),
    AGENT_LABELS.maintenance,
    ...proposal.extraLabels,
  ]),
];

export type ProposalOutcome =
  | {
      status: "dry_run";
      kind: ProposalKind;
      tier: ProposalTier;
      targetLabel: string;
      labels: string[];
      reasons: string[];
      markdown: string;
    }
  | { status: "cap_reached"; openProposedCount: number; maxOpenProposals: number }
  | { status: "duplicate"; matchedIssue: number; reason: string }
  | {
      status: "created";
      url: string;
      kind: ProposalKind;
      tier: ProposalTier;
      targetLabel: string;
      labels: string[];
    };

/**
 * Classifies and renders a proposal, then files it as an issue unless this is a dry run, a Tier 2
 * proposal would exceed the open-proposal cap, or an existing issue already covers it.
 */
export const fileProposal = (
  client: Pick<GitHubIssueClient, "listIssues" | "createIssue">,
  proposal: ProposalInput,
  { dryRun, tier2Only }: { dryRun: boolean; tier2Only: boolean },
): ProposalOutcome => {
  const classification = applyTier2OnlyOverride(
    classifyProposalTier({
      paths: proposal.paths,
      ambiguous: proposal.ambiguous,
      kind: proposal.kind,
    }),
    tier2Only,
  );
  const { tier, reasons } = classification;
  const targetLabel = targetLabelForTier(tier);
  const markdown = renderProposalMarkdown(proposal, classification);
  const labels = selectProposalLabels(proposal, classification);

  if (dryRun) {
    return { status: "dry_run", kind: proposal.kind, tier, targetLabel, labels, reasons, markdown };
  }

  if (targetLabel === AGENT_LABELS.proposed) {
    const openProposedCount = countOpenProposedIssues(client);
    if (isProposalCapReached(openProposedCount)) {
      return { status: "cap_reached", openProposedCount, maxOpenProposals: MAX_OPEN_PROPOSALS };
    }
  }

  const dup = findDuplicateProposal(proposal, listExistingIssues(client));
  if (dup.duplicate) {
    return { status: "duplicate", matchedIssue: dup.matchedIssue.number, reason: dup.reason };
  }

  const url = client.createIssue({ title: proposal.title, body: markdown, labels });
  return { status: "created", url, kind: proposal.kind, tier, targetLabel, labels };
};

const runCli = () => {
  const { file: filePath, dryRun, tier2Only } = parseProposalArgs(process.argv.slice(2));

  const rawInput = filePath ? readFileSync(filePath, "utf8") : readFileSync(0, "utf8");
  const proposal = proposalInputSchema.parse(JSON.parse(rawInput));

  const client = createGitHubIssueClient({ repoRoot: REPO_ROOT });
  const outcome = fileProposal(client, proposal, { dryRun, tier2Only });
  console.log(
    outcome.status === "dry_run" ? JSON.stringify(outcome, null, 2) : JSON.stringify(outcome),
  );
};

if (import.meta.main) {
  runCli();
}
