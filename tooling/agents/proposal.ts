import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  ALLOW_PROTECTED_LABEL,
  findProtectedPaths,
  parseProposalMarker,
} from "../verification/agent-policy.ts";
import {
  classifyChangedPaths,
  type MechanismClassification,
} from "../verification/architecture/mechanisms.ts";

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

export const proposalInputSchema = z.object({
  lens: z.enum(SCOUT_LENSES),
  title: singleLine(100),
  why: singleLine(220),
  evidence: singleLine(200),
  change: z.array(singleLine(140)).min(1).max(3),
  decision: singleLine(200),
  whyNot: singleLine(200),
  paths: z.array(singleLine(200)).min(1),
  ambiguous: z.boolean().default(false),
  extraLabels: z.array(nonAgentLabelSchema).default([]),
  brief: z.object({
    behavior: z.array(singleLine(200)).min(1),
    outOfScope: z.array(singleLine(200)).default([]),
    precedents: z.array(singleLine(200)).default([]),
    plan: z.array(singleLine(200)).min(1),
    verification: z.array(singleLine(200)).min(1),
  }),
});

export type ProposalInput = z.infer<typeof proposalInputSchema>;

export type ProposalTierClassification = {
  tier: 1 | 2;
  targetLabel: "agent:ready" | "agent:proposed";
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

const normalizePath = (value: string) => value.replaceAll("\\", "/").replace(/^\.\//, "");

export const sliceForPath = (filePath: string): string => {
  const normalized = normalizePath(filePath);
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
  const normalized = normalizePath(filePath);
  return !GLOB_CHAR_PATTERN.test(normalized) && TIER1_DOC_PATTERN.test(normalized);
};

export const isProposalCapReached = (openProposedCount: number): boolean =>
  openProposedCount >= MAX_OPEN_PROPOSALS;

export const classifyProposalTier = ({
  paths,
  ambiguous,
}: {
  paths: readonly string[];
  ambiguous: boolean;
}): ProposalTierClassification => {
  const normalizedPaths = [...new Set(paths.map(normalizePath))];
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

  const tier: 1 | 2 = reasons.length === 0 ? 1 : 2;
  return {
    tier,
    targetLabel: tier === 1 ? "agent:ready" : "agent:proposed",
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
    targetLabel: "agent:proposed",
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

export const findDuplicateProposal = (
  proposal: Pick<ProposalInput, "title" | "paths">,
  existingIssues: readonly ExistingIssueSummary[],
): DuplicateCheckResult => {
  const normalizedTitle = proposal.title.trim().toLowerCase();
  const titleTokens = tokenize(proposal.title);
  const proposalPaths = new Set(proposal.paths.map(normalizePath));

  for (const issue of existingIssues) {
    const isRelevant =
      issue.state === "OPEN" ||
      issue.labels.some((label) => label === "wontfix" || label === "duplicate");
    if (!isRelevant) {
      continue;
    }

    if (issue.title.trim().toLowerCase() === normalizedTitle) {
      return {
        duplicate: true,
        matchedIssue: issue,
        reason: `matches existing ${issue.state.toLowerCase()} issue #${issue.number} title`,
      };
    }

    const similarity = jaccard(titleTokens, tokenize(issue.title));
    const existingPaths = issue.body ? (parseProposalMarker(issue.body)?.paths ?? []) : [];
    const sharesPath = existingPaths.some((filePath) => proposalPaths.has(filePath));
    if (similarity >= 0.6 && (sharesPath || existingPaths.length === 0)) {
      return {
        duplicate: true,
        matchedIssue: issue,
        reason: `high title similarity (${similarity.toFixed(2)}) with #${issue.number}`,
      };
    }
  }

  return { duplicate: false };
};

export const renderProposalMarkdown = (
  proposal: ProposalInput,
  classification: ProposalTierClassification,
): string => {
  const normalizedPaths = [...new Set(proposal.paths.map(normalizePath))];
  const mechanismSummary =
    classification.mechanisms.matched.length > 0
      ? classification.mechanisms.matched.map((entry) => entry.mechanism.id).join(", ")
      : "none";
  const protectedNote =
    classification.protectedPaths.length > 0
      ? ` · protected (needs \`${ALLOW_PROTECTED_LABEL}\`): ${classification.protectedPaths.join(", ")}`
      : "";
  const blastRadius = `tier:${classification.tier} · lens:${proposal.lens} · ~${normalizedPaths.length} file(s) · slices: ${classification.slices.join(", ")} · mechanisms: ${mechanismSummary}${protectedNote}`;

  const metadata = JSON.stringify({
    lens: proposal.lens,
    tier: classification.tier,
    paths: normalizedPaths,
  });

  const renderBullets = (items: readonly string[]) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None.";

  return [
    `**${proposal.title}**`,
    `\`${blastRadius}\``,
    "",
    `**Why:** ${proposal.why}`,
    `**Evidence:** ${proposal.evidence}`,
    "**Change:**",
    ...proposal.change.map((item) => `- ${item}`),
    `**Decision / catch:** ${proposal.decision}`,
    `**Why NOT:** ${proposal.whyNot}`,
    "",
    "<details>",
    "<summary>Implementer brief (for builder & reviewer)</summary>",
    "",
    "**Behavior:**",
    renderBullets(proposal.brief.behavior),
    "",
    "**Out of scope:**",
    renderBullets(proposal.brief.outOfScope),
    "",
    "**Precedents:**",
    renderBullets(proposal.brief.precedents),
    "",
    "**Plan:**",
    renderBullets(proposal.brief.plan),
    "",
    "**Verification:**",
    renderBullets(proposal.brief.verification),
    "",
    "</details>",
    "",
    `<!-- merit-proposal: ${metadata} -->`,
    "",
  ].join("\n");
};

const ghIssuesSchema = z.array(
  z.object({
    number: z.number(),
    title: z.string(),
    state: z.enum(["OPEN", "CLOSED"]),
    body: z.string().optional(),
    labels: z.array(z.object({ name: z.string() })),
  }),
);

const queryIssues = (repoRoot: string, extraArgs: readonly string[]): ExistingIssueSummary[] => {
  const raw = execFileSync(
    "gh",
    ["issue", "list", "--limit", "200", "--json", "number,title,state,labels,body", ...extraArgs],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return ghIssuesSchema.parse(JSON.parse(raw)).map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    body: issue.body,
    labels: issue.labels.map((label) => label.name),
  }));
};

const countOpenProposedIssues = (repoRoot: string): number =>
  queryIssues(repoRoot, ["--state", "open", "--label", "agent:proposed"]).length;

const listExistingIssues = (repoRoot: string): ExistingIssueSummary[] => {
  const byNumber = new Map<number, ExistingIssueSummary>();
  for (const issue of [
    ...queryIssues(repoRoot, ["--state", "open"]),
    ...queryIssues(repoRoot, ["--state", "closed", "--label", "wontfix"]),
    ...queryIssues(repoRoot, ["--state", "closed", "--label", "duplicate"]),
  ]) {
    byNumber.set(issue.number, issue);
  }
  return [...byNumber.values()];
};

const readFlagValue = (args: readonly string[], flag: string): string | null => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const args = process.argv.slice(2);
  const filePath = readFlagValue(args, "--file");
  const dryRun = args.includes("--dry-run");
  const tier2Only = args.includes("--tier2-only");

  const rawInput = filePath ? readFileSync(filePath, "utf8") : readFileSync(0, "utf8");
  const proposal = proposalInputSchema.parse(JSON.parse(rawInput));

  const baseClassification = classifyProposalTier({
    paths: proposal.paths,
    ambiguous: proposal.ambiguous,
  });
  const classification = applyTier2OnlyOverride(baseClassification, tier2Only);
  const markdown = renderProposalMarkdown(proposal, classification);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          status: "dry_run",
          tier: classification.tier,
          targetLabel: classification.targetLabel,
          reasons: classification.reasons,
          markdown,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (classification.targetLabel === "agent:proposed") {
    const openProposedCount = countOpenProposedIssues(repoRoot);
    if (isProposalCapReached(openProposedCount)) {
      console.log(
        JSON.stringify({
          status: "cap_reached",
          openProposedCount,
          maxOpenProposals: MAX_OPEN_PROPOSALS,
        }),
      );
      return;
    }
  }

  const existingIssues = listExistingIssues(repoRoot);
  const dup = findDuplicateProposal(proposal, existingIssues);
  if (dup.duplicate) {
    console.log(
      JSON.stringify({
        status: "duplicate",
        matchedIssue: dup.matchedIssue.number,
        reason: dup.reason,
      }),
    );
    return;
  }

  const labels = [
    ...new Set([classification.targetLabel, "type:maintenance", ...proposal.extraLabels]),
  ];
  const ghArgs = ["issue", "create", "--title", proposal.title, "--body", markdown];
  for (const label of labels) {
    ghArgs.push("--label", label);
  }
  const url = execFileSync("gh", ghArgs, { cwd: repoRoot, encoding: "utf8" }).trim();
  console.log(
    JSON.stringify({
      status: "created",
      url,
      tier: classification.tier,
      targetLabel: classification.targetLabel,
    }),
  );
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
