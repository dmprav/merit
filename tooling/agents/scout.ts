import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { errorMessage, normalizeRepoPath, readFlagValue, readIntegerFlag } from "../cli.ts";
import { parseProposalMarker, TRUSTED_AUTHOR_ASSOCIATIONS } from "../verification/agent-policy.ts";
import { classifyChangedPaths } from "../verification/architecture/mechanisms.ts";
import {
  fetchRestIssueComments,
  getRepoIdentity,
  ghApiJson,
  listRestIssues,
  restIssueItemSchema,
  type RepoIdentity,
} from "./github-rest.ts";
import { MAX_OPEN_PROPOSALS, resolveScoutGhEnv, SCOUT_LENSES, type ScoutLens } from "./proposal.ts";

export const SCOUT_STATE_ISSUE_NUMBER = 219;
export const SCOUT_STATE_ISSUE_TITLE = "chore: agent scout state";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STATE_MARKER_PATTERN = /<!--\s*merit-scout-state:\s*(\{[\s\S]*?\})\s*-->/;
const FALLOW_TIMEOUT_MS = 25_000;

export const lensCursorSchema = z.object({
  lastCommitSha: z.string().min(7).optional(),
  lastCommitDate: z.string().min(10).optional(),
  lastPrNumber: z.number().int().positive().optional(),
  lastRotationTarget: z.string().min(1).optional(),
  lastRunAt: z.string().min(10),
});

export type LensCursor = z.infer<typeof lensCursorSchema>;

export type ScoutState = Partial<Record<ScoutLens, LensCursor>>;

export type CommitSummary = {
  sha: string;
  date: string;
  subject: string;
};

export type VerificationFileEntry = {
  prNumber: number;
  path: string;
};

const lensNameSchema = z.enum(SCOUT_LENSES);

export const AUTO_LENS_PRIORITY: readonly ScoutLens[] = [
  "architecture",
  "simplification",
  "security",
  "mcp-db",
  "tests",
  "docs",
  "verification-flakes",
];

export const LENS_TARGET_INTERVAL_DAYS: Record<ScoutLens, number> = {
  architecture: 2,
  simplification: 2,
  security: 3,
  "mcp-db": 3,
  tests: 3,
  docs: 4,
  "verification-flakes": 5,
};

export type AutoLensSelection =
  | {
      due: true;
      lens: ScoutLens;
      targetIntervalDays: number;
      lastRunAt: string | null;
    }
  | {
      due: false;
      nextLens: ScoutLens;
      nextDueInHours: number;
    };

/** Picks the most overdue lens relative to its target cadence, or reports the next due lens when all are fresh. */
export const selectAutoLens = ({
  state,
  nowMs,
}: {
  state: ScoutState;
  nowMs: number;
}): AutoLensSelection => {
  let mostOverdue: {
    lens: ScoutLens;
    overdueRatio: number;
    targetIntervalDays: number;
    lastRunAt: string | null;
  } | null = null;
  let soonestUpcoming: { lens: ScoutLens; remainingMs: number } | null = null;

  for (const lens of AUTO_LENS_PRIORITY) {
    const targetIntervalDays = LENS_TARGET_INTERVAL_DAYS[lens];
    const targetMs = targetIntervalDays * MS_PER_DAY;
    const cursor = state[lens];
    const lastRunMs = cursor ? Date.parse(cursor.lastRunAt) : Number.NaN;

    if (!cursor || Number.isNaN(lastRunMs)) {
      return {
        due: true,
        lens,
        targetIntervalDays,
        lastRunAt: null,
      };
    }

    const ageMs = Math.max(0, nowMs - lastRunMs);
    const overdueRatio = ageMs / targetMs;
    if (overdueRatio >= 1 && (!mostOverdue || overdueRatio > mostOverdue.overdueRatio)) {
      mostOverdue = {
        lens,
        overdueRatio,
        targetIntervalDays,
        lastRunAt: cursor.lastRunAt,
      };
    }

    const remainingMs = Math.max(0, lastRunMs + targetMs - nowMs);
    if (!soonestUpcoming || remainingMs < soonestUpcoming.remainingMs) {
      soonestUpcoming = { lens, remainingMs };
    }
  }

  if (mostOverdue) {
    return {
      due: true,
      lens: mostOverdue.lens,
      targetIntervalDays: mostOverdue.targetIntervalDays,
      lastRunAt: mostOverdue.lastRunAt,
    };
  }

  const nextLens = soonestUpcoming?.lens ?? AUTO_LENS_PRIORITY[0] ?? SCOUT_LENSES[0];
  const nextDueInHours = Math.ceil((soonestUpcoming?.remainingMs ?? 0) / (60 * 60 * 1000));
  return {
    due: false,
    nextLens,
    nextDueInHours,
  };
};

/** Parses each lens cursor independently so one corrupt entry cannot wipe sibling lenses. */
export const parseScoutState = (issueBody: string): ScoutState => {
  const match = STATE_MARKER_PATTERN.exec(issueBody);
  if (!match?.[1]) {
    return {};
  }
  try {
    const raw: unknown = JSON.parse(match[1]);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const state: ScoutState = {};
    for (const [key, value] of Object.entries(raw)) {
      const lensResult = lensNameSchema.safeParse(key);
      const cursorResult = lensCursorSchema.safeParse(value);
      if (lensResult.success && cursorResult.success) {
        state[lensResult.data] = cursorResult.data;
      }
    }
    return state;
  } catch {
    return {};
  }
};

export const formatScoutStateBody = (existingBody: string, state: ScoutState): string => {
  const marker = `<!-- merit-scout-state: ${JSON.stringify(state)} -->`;
  if (STATE_MARKER_PATTERN.test(existingBody)) {
    return existingBody.replace(STATE_MARKER_PATTERN, marker);
  }
  const trimmed = existingBody.trimEnd();
  return `${trimmed}\n\n${marker}\n`;
};

export type RotationAxis = {
  id: string;
  summary: string;
  anchorDocs: readonly string[];
  pathPatterns: readonly string[];
  focus: string;
};

export const ARCHITECTURE_AXES: readonly RotationAxis[] = [
  {
    id: "capability-ownership-and-boundaries",
    summary: "Grant-work capability boundaries, cross-capability wiring, and server composition.",
    anchorDocs: [
      "docs/foundations/architecture.md",
      "tooling/verification/architecture/config.ts",
      "app/src/server/services.server.ts",
    ],
    pathPatterns: [
      "capabilities/*/business/src/server/**",
      "app/src/server/services.server.ts",
      "tooling/verification/architecture/config.ts",
    ],
    focus:
      "Ownership leaks across rounds/applications/reviews/recommendations + grantmaking composition, serverImports exception creep, shared-persistence leaks, and orchestration accumulating in services.server.ts.",
  },
  {
    id: "web-layering-and-draft-recovery",
    summary: "Web view/controller layering, save-vs-refresh separation, and draft recovery.",
    anchorDocs: [
      "docs/foundations/architecture.md",
      "docs/guides/web-features.md",
      "tooling/verification/architecture/mechanisms.config.ts",
    ],
    pathPatterns: [
      "foundation/drafts/src/**",
      "foundation/query/src/**",
      "foundation/ui/src/patterns/editing/**",
      "capabilities/*/web/src/**",
      "interfaces/product/src/features/**/data/**",
    ],
    focus:
      "Views absorbing controller/domain state, save-vs-refresh separation drift, and inconsistent IndexedDB draft or revision-baseline recovery across capabilities.",
  },
  {
    id: "interface-transport-and-routing",
    summary: "App router/bundle boundaries, server function adapters, and route loaders.",
    anchorDocs: [
      "docs/foundations/architecture.md",
      "app/src/router.tsx",
      "interfaces/product/src/features/grantmaking/page-routing.ts",
    ],
    pathPatterns: [
      "app/src/**",
      "interfaces/*/src/routes/**",
      "interfaces/*/src/features/**/data/server/**",
      "interfaces/product/src/features/grantmaking/page-routing.ts",
      "interfaces/emails/src/**",
    ],
    focus:
      "Eager router/bundle weight, repeated server-function adapter boilerplate across product and admin, and route loader/redirect/error-translation drift.",
  },
  {
    id: "shared-ui-and-design-system-contracts",
    summary: "Shared UI primitives, form/table adapters, and exact money/date contracts.",
    anchorDocs: [
      "docs/foundations/architecture.md",
      "tooling/verification/architecture/mechanisms.config.ts",
      "docs/decisions/0008-money.md",
    ],
    pathPatterns: [
      "foundation/ui/src/**",
      "foundation/forms/src/**",
      "foundation/tables/src/**",
      "foundation/money/src/**",
      "foundation/dates/src/**",
      "capabilities/*/web/src/views/**",
      "interfaces/*/src/**",
    ],
    focus:
      "Feature views bypassing @merit/ui, @merit/forms, or @merit/tables, duplicated UI patterns across >=2 capabilities, React Aria focus/dismissal drift, and money/date boundary inconsistencies.",
  },
  {
    id: "audit-demo-and-observability-mechanisms",
    summary: "Audit trail, demo lifecycle seeding, and telemetry/analytics consistency.",
    anchorDocs: [
      "tooling/verification/architecture/mechanisms.config.ts",
      "app/src/server/services.server.ts",
      "capabilities/audit/business/README.md",
    ],
    pathPatterns: [
      "capabilities/audit/business/src/**",
      "capabilities/*/business/src/server/demo.ts",
      "app/src/server/demo*",
      "foundation/telemetry/src/**",
      "foundation/analytics/src/**",
      "app/src/server/services.server.ts",
    ],
    focus:
      "Write-owning capabilities drifting on audit-event recording or snapshot fidelity, demo seeders diverging from capability example builders, and inconsistent instrumentService/reportError/analytics wiring.",
  },
  {
    id: "enforcement-ladder-and-verification-gaps",
    summary:
      "Escalating recurring prose/review rules into static checks and shrinking suppressions.",
    anchorDocs: [
      "docs/foundations/principles.md",
      "docs/guides/verification-tooling.md",
      ".agents/skills/build-feature/review.md",
      "AGENTS.md",
    ],
    pathPatterns: [
      "tooling/verification/**",
      ".fallowrc.jsonc",
      "docs/guides/verification-tooling.md",
      ".agents/skills/build-feature/review.md",
      "AGENTS.md",
    ],
    focus:
      "Recurring prose or review-rubric rules that should move up into lint, TypeScript boundaries, fallow, mechanisms.config.ts, or architecture tests, plus oxlint-disable and fallow override creep.",
  },
];

export const SIMPLIFICATION_LAYERS: readonly RotationAxis[] = [
  {
    id: "business-server",
    summary: "Capability business domain, server services, and persistence queries/commands.",
    anchorDocs: ["docs/guides/coding-conventions.md", "docs/foundations/principles.md"],
    pathPatterns: ["capabilities/*/business/src/**", "app/src/server/**"],
    focus:
      "Duplicated query/command helpers, repeated persistence mapping across capabilities, and dead indirection in server modules without changing capability boundaries.",
  },
  {
    id: "web-views-and-controllers",
    summary: "Capability web controllers, data hooks, and views.",
    anchorDocs: ["docs/guides/coding-conventions.md", "docs/guides/web-features.md"],
    pathPatterns: ["capabilities/*/web/src/**"],
    focus:
      "Repeated controller/view boilerplate, unused wrappers, and copy-pasted form/table/state wiring that can reuse existing shared abstractions.",
  },
  {
    id: "interfaces-and-routes",
    summary: "Product, admin, site, email, and MCP interface layers and routes.",
    anchorDocs: ["docs/guides/coding-conventions.md", "docs/foundations/architecture.md"],
    pathPatterns: ["interfaces/*/src/**", "app/src/**"],
    focus:
      "Repeated route shells, duplicated server-function glue, and copy-pasted loader/adapter helpers across interfaces.",
  },
  {
    id: "foundation-and-tooling",
    summary: "Shared foundation packages and repository tooling.",
    anchorDocs: ["docs/guides/coding-conventions.md", "docs/foundations/principles.md"],
    pathPatterns: ["foundation/*/src/**", "tooling/**"],
    focus:
      "Duplicated UI/table/form/utility code across foundation packages and dead or overlapping helpers in repository tooling.",
  },
];

const SECURITY_FOUNDATION_SLICES = new Set([
  "foundation/ai",
  "foundation/auth",
  "foundation/db",
  "foundation/storage",
]);

/** Advances strictly round-robin from the last persisted target so cadence never aliases or skips items. */
export const pickNextRotationItem = (
  items: readonly string[],
  lastTarget: string | undefined,
): string | null => {
  const unique = [...new Set(items)];
  if (unique.length === 0) {
    return null;
  }
  if (!lastTarget) {
    return unique[0] ?? null;
  }
  const index = unique.indexOf(lastTarget);
  if (index === -1) {
    return unique[0] ?? null;
  }
  return unique[(index + 1) % unique.length] ?? null;
};

export const listDocAreas = (trackedFiles: readonly string[]): string[] => {
  const areas = new Set<string>();
  for (const filePath of trackedFiles) {
    if (!/\.(?:md|mdx)$/.test(filePath)) {
      continue;
    }
    if (
      filePath.startsWith(".github/") ||
      filePath.startsWith(".agents/") ||
      filePath.startsWith("verifications/")
    ) {
      continue;
    }
    const parts = filePath.split("/");
    areas.add(parts.length <= 2 ? "." : `${parts[0]}/${parts[1]}`);
  }
  return [...areas].sort();
};

export const listPackageSlices = (trackedFiles: readonly string[]): string[] => {
  const slices = new Set<string>();
  for (const filePath of trackedFiles) {
    const parts = filePath.split("/");
    if (
      (parts[0] === "capabilities" || parts[0] === "foundation" || parts[0] === "interfaces") &&
      parts[1]
    ) {
      slices.add(`${parts[0]}/${parts[1]}`);
    } else if (filePath.startsWith("app/src/")) {
      slices.add("app");
    } else if (filePath.startsWith("tooling/testing/")) {
      slices.add("tooling/testing");
    }
  }
  return [...slices].sort();
};

const listSecuritySlices = (trackedFiles: readonly string[]): string[] => {
  const slices = new Set<string>();
  for (const filePath of trackedFiles) {
    if (filePath.startsWith("app/src/")) {
      slices.add("app");
      continue;
    }
    const parts = filePath.split("/");
    const slice = parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : null;
    if (!slice) {
      continue;
    }
    if (
      parts[0] === "capabilities" ||
      parts[0] === "interfaces" ||
      (parts[0] === "foundation" &&
        (SECURITY_FOUNDATION_SLICES.has(slice) || filePath.includes("/server/")))
    ) {
      slices.add(slice);
    }
  }
  return [...slices].sort();
};

const listMcpDbSlices = (trackedFiles: readonly string[]): string[] => {
  const slices = new Set<string>();
  for (const filePath of trackedFiles) {
    const parts = filePath.split("/");
    const slice = parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : null;
    if (!slice) {
      continue;
    }
    if (
      (parts[0] === "capabilities" && (parts[2] === "ai" || filePath.includes("/src/server/"))) ||
      slice === "foundation/db" ||
      slice === "foundation/ai" ||
      slice === "interfaces/mcp"
    ) {
      slices.add(slice);
    }
  }
  return [...slices].sort();
};

/** Selects the next deterministic rotation target for a lens using its persisted cursor. */
export const resolveRotationTarget = (
  lens: ScoutLens,
  trackedFiles: readonly string[],
  lastTarget: string | undefined,
): { target: string | null; axis: RotationAxis | null } => {
  if (lens === "verification-flakes") {
    return { target: null, axis: null };
  }
  if (lens === "architecture") {
    const target = pickNextRotationItem(
      ARCHITECTURE_AXES.map((axis) => axis.id),
      lastTarget,
    );
    const axis = ARCHITECTURE_AXES.find((entry) => entry.id === target) ?? null;
    return { target, axis };
  }
  if (lens === "simplification") {
    const target = pickNextRotationItem(
      SIMPLIFICATION_LAYERS.map((layer) => layer.id),
      lastTarget,
    );
    const axis = SIMPLIFICATION_LAYERS.find((entry) => entry.id === target) ?? null;
    return { target, axis };
  }
  if (lens === "docs") {
    return { target: pickNextRotationItem(listDocAreas(trackedFiles), lastTarget), axis: null };
  }
  if (lens === "security") {
    return {
      target: pickNextRotationItem(listSecuritySlices(trackedFiles), lastTarget),
      axis: null,
    };
  }
  if (lens === "mcp-db") {
    return { target: pickNextRotationItem(listMcpDbSlices(trackedFiles), lastTarget), axis: null };
  }
  return { target: pickNextRotationItem(listPackageSlices(trackedFiles), lastTarget), axis: null };
};

const NON_PRODUCTION_PATH_PATTERN =
  /(?:^|\/)(?:testing|__tests__|fixtures)\/|\.(?:test|spec|integration|stories|story-fixtures)\.tsx?$|(?:^|\/)vite\.config\.ts$/;

const isProductionSourcePath = (filePath: string): boolean =>
  !NON_PRODUCTION_PATH_PATTERN.test(normalizeRepoPath(filePath));

const matchesAnyPattern = (filePath: string, patterns: readonly string[]): boolean => {
  const normalized = normalizeRepoPath(filePath);
  return patterns.some((pattern) => matchesGlob(normalized, pattern));
};

/** Indexes tracked issue numbers per normalized path from open and wontfix `<!-- merit-proposal -->` markers. */
export const buildTrackedPathsIndex = (
  issues: ReadonlyArray<{ number: number; body?: string }>,
): Map<string, number[]> => {
  const byPath = new Map<string, Set<number>>();
  for (const issue of issues) {
    if (!issue.body) {
      continue;
    }
    const marker = parseProposalMarker(issue.body);
    if (!marker) {
      continue;
    }
    for (const rawPath of marker.paths) {
      const normalized = normalizeRepoPath(rawPath);
      const bucket = byPath.get(normalized) ?? new Set<number>();
      bucket.add(issue.number);
      byPath.set(normalized, bucket);
    }
  }
  const result = new Map<string, number[]>();
  for (const [filePath, numbers] of byPath) {
    result.set(
      filePath,
      [...numbers].sort((a, b) => a - b),
    );
  }
  return result;
};

/** Extracts the latest trusted maintainer comment on a closed `wontfix` issue as a compact single-line reason. */
export const extractLatestTrustedRejectionReason = (
  comments: ReadonlyArray<{ authorAssociation?: string; body?: string }> | undefined,
): string | undefined => {
  if (!comments || comments.length === 0) {
    return undefined;
  }
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    if (!comment?.body || !TRUSTED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation ?? "")) {
      continue;
    }
    const stripped = comment.body
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!stripped) {
      continue;
    }
    return stripped.length > 200 ? `${stripped.slice(0, 197)}...` : stripped;
  }
  return undefined;
};

const fallowHealthSchema = z.object({
  file_scores: z
    .array(
      z.object({
        path: z.string(),
        fan_in: z.number(),
        fan_out: z.number(),
        lines: z.number(),
        function_count: z.number(),
        total_cyclomatic: z.number(),
        total_cognitive: z.number(),
      }),
    )
    .default([]),
  hotspots: z
    .array(
      z.object({
        path: z.string(),
        score: z.number(),
        commits: z.number(),
        trend: z.string(),
      }),
    )
    .default([]),
  threshold_overrides: z
    .array(
      z.object({
        status: z.string(),
        path: z.string(),
        function: z.string().optional(),
        line: z.number().optional(),
        metrics: z
          .object({
            cognitive: z.number().optional(),
            line_count: z.number().optional(),
          })
          .optional(),
        reason: z.string().optional(),
      }),
    )
    .default([]),
});

const fallowDupesSchema = z.object({
  clone_groups: z
    .array(
      z.object({
        line_count: z.number(),
        suggested_name: z.string().optional(),
        instances: z.array(
          z.object({
            file: z.string(),
            start_line: z.number(),
            end_line: z.number(),
          }),
        ),
      }),
    )
    .default([]),
});

const fallowEntryWeightSchema = z.object({
  entry_weight: z.object({
    entries: z.array(
      z.object({
        path: z.string(),
        source: z.string(),
        eager_modules: z.number(),
        eager_bytes: z.number(),
        deferred_modules: z.number(),
      }),
    ),
  }),
});

type FileScoreEntry = {
  path: string;
  lines: number;
  fanIn: number;
  fanOut: number;
  functions: number;
  cyclomatic: number;
  inAxis: boolean;
  trackedBy: number[];
};

type HotspotEntry = {
  path: string;
  score: number;
  commits: number;
  trend: string;
  trackedBy: number[];
};

type ThresholdOverrideEntry = {
  path: string;
  function?: string;
  line?: number;
  lines?: number;
  cognitive?: number;
  reason?: string;
};

type CloneGroupEntry = {
  lines: number;
  suggestedName?: string;
  instances: string[];
  inAxis: boolean;
  trackedBy: number[];
};

type EntryWeightEntry = {
  path: string;
  source: string;
  eagerModules: number;
  eagerKb: number;
  deferredModules: number;
  trackedBy: number[];
};

type SuppressionLedger = {
  total: number;
  byKind: Record<string, number>;
  topFiles?: Array<{ path: string; count: number }>;
};

type CapabilitySymmetryEntry = {
  capability: string;
  domain: number;
  server: number;
  web: number;
  ai: number;
};

type StructuralTelemetry = {
  shallowClone: boolean;
  topFiles: FileScoreEntry[];
  hotspots: HotspotEntry[];
  thresholdOverrides: ThresholdOverrideEntry[];
  cloneGroups: CloneGroupEntry[];
  entryWeights?: EntryWeightEntry[];
  suppressions: SuppressionLedger;
  capabilitySymmetry?: CapabilitySymmetryEntry[];
  fallowErrors?: string[];
};

const matchesTrackedMarkerPath = (filePath: string, markerPath: string): boolean => {
  if (filePath === markerPath) {
    return true;
  }
  if (/[*?{}[\]]/.test(markerPath)) {
    return matchesGlob(filePath, markerPath);
  }
  const dirPrefix = markerPath.endsWith("/") ? markerPath : `${markerPath}/`;
  return filePath.startsWith(dirPrefix);
};

const trackedByForPaths = (
  paths: readonly string[],
  trackedPathsByIssue: ReadonlyMap<string, number[]>,
): number[] => {
  const issues = new Set<number>();
  for (const rawPath of paths) {
    const normalized = normalizeRepoPath(rawPath);
    for (const issueNumber of trackedPathsByIssue.get(normalized) ?? []) {
      issues.add(issueNumber);
    }
    for (const [markerPath, issueNumbers] of trackedPathsByIssue) {
      if (markerPath === normalized) {
        continue;
      }
      if (matchesTrackedMarkerPath(normalized, markerPath)) {
        for (const issueNumber of issueNumbers) {
          issues.add(issueNumber);
        }
      }
    }
  }
  return [...issues].sort((a, b) => a - b);
};

export const summarizeFallowHealth = ({
  rawHealth,
  pathPatterns,
  trackedPathsByIssue,
}: {
  rawHealth: unknown;
  pathPatterns: readonly string[];
  trackedPathsByIssue: ReadonlyMap<string, number[]>;
}): {
  topFiles: FileScoreEntry[];
  hotspots: HotspotEntry[];
  thresholdOverrides: ThresholdOverrideEntry[];
} => {
  const parsed = fallowHealthSchema.parse(rawHealth);
  const scored = parsed.file_scores
    .filter((entry) => isProductionSourcePath(entry.path))
    .map((entry) => {
      const normalized = normalizeRepoPath(entry.path);
      return {
        path: normalized,
        lines: entry.lines,
        fanIn: entry.fan_in,
        fanOut: entry.fan_out,
        functions: entry.function_count,
        cyclomatic: entry.total_cyclomatic,
        inAxis: pathPatterns.length > 0 && matchesAnyPattern(normalized, pathPatterns),
        trackedBy: trackedByForPaths([normalized], trackedPathsByIssue),
      };
    });

  const rankScore = (entry: FileScoreEntry) => entry.fanOut * 10 + entry.lines;

  const axisFiles = scored
    .filter((entry) => entry.inAxis)
    .sort((a, b) => rankScore(b) - rankScore(a));
  const otherFiles = scored
    .filter((entry) => !entry.inAxis)
    .sort((a, b) => rankScore(b) - rankScore(a));
  const topFiles = [...axisFiles.slice(0, 6), ...otherFiles].slice(0, 8);

  const hotspots = parsed.hotspots
    .filter((entry) => isProductionSourcePath(entry.path))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((entry) => {
      const normalized = normalizeRepoPath(entry.path);
      return {
        path: normalized,
        score: Math.round(entry.score * 10) / 10,
        commits: entry.commits,
        trend: entry.trend,
        trackedBy: trackedByForPaths([normalized], trackedPathsByIssue),
      };
    });

  const thresholdOverrides = parsed.threshold_overrides
    .filter((entry) => entry.status === "active")
    .map((entry) => ({
      path: normalizeRepoPath(entry.path),
      ...(entry.function ? { function: entry.function } : {}),
      ...(entry.line !== undefined ? { line: entry.line } : {}),
      ...(entry.metrics?.line_count !== undefined ? { lines: entry.metrics.line_count } : {}),
      ...(entry.metrics?.cognitive !== undefined ? { cognitive: entry.metrics.cognitive } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
    }));

  return { topFiles, hotspots, thresholdOverrides };
};

export const summarizeFallowDupes = ({
  rawDupes,
  pathPatterns,
  trackedPathsByIssue,
}: {
  rawDupes: unknown;
  pathPatterns: readonly string[];
  trackedPathsByIssue: ReadonlyMap<string, number[]>;
}): CloneGroupEntry[] => {
  const parsed = fallowDupesSchema.parse(rawDupes);
  const groups = parsed.clone_groups
    .map((group) => {
      const prodInstances = group.instances.filter((inst) => isProductionSourcePath(inst.file));
      if (prodInstances.length < 2) {
        return null;
      }
      const files = prodInstances.map((inst) => normalizeRepoPath(inst.file));
      const inAxis =
        pathPatterns.length > 0 && files.some((file) => matchesAnyPattern(file, pathPatterns));
      return {
        lines: group.line_count,
        ...(group.suggested_name ? { suggestedName: group.suggested_name } : {}),
        instances: prodInstances.map(
          (inst) => `${normalizeRepoPath(inst.file)}:${inst.start_line}-${inst.end_line}`,
        ),
        inAxis,
        trackedBy: trackedByForPaths(files, trackedPathsByIssue),
      };
    })
    .filter((entry): entry is CloneGroupEntry => entry !== null);

  const axisGroups = groups.filter((entry) => entry.inAxis);
  const otherGroups = groups.filter((entry) => !entry.inAxis);
  return [...axisGroups, ...otherGroups].slice(0, 8);
};

export const summarizeEntryWeights = ({
  rawEntryWeight,
  trackedPathsByIssue,
}: {
  rawEntryWeight: unknown;
  trackedPathsByIssue: ReadonlyMap<string, number[]>;
}): EntryWeightEntry[] => {
  const parsed = fallowEntryWeightSchema.parse(rawEntryWeight);
  return [...parsed.entry_weight.entries]
    .sort((a, b) => b.eager_bytes - a.eager_bytes)
    .slice(0, 5)
    .map((entry) => {
      const normalized = normalizeRepoPath(entry.path);
      return {
        path: normalized,
        source: entry.source,
        eagerModules: entry.eager_modules,
        eagerKb: Math.round(entry.eager_bytes / 1024),
        deferredModules: entry.deferred_modules,
        trackedBy: trackedByForPaths([normalized], trackedPathsByIssue),
      };
    });
};

export const buildCapabilitySymmetry = (
  trackedFiles: readonly string[],
): CapabilitySymmetryEntry[] => {
  const counts = new Map<string, CapabilitySymmetryEntry>();
  for (const rawPath of trackedFiles) {
    const filePath = normalizeRepoPath(rawPath);
    if (!/\.(?:ts|tsx)$/.test(filePath) || !isProductionSourcePath(filePath)) {
      continue;
    }
    const parts = filePath.split("/");
    if (parts[0] !== "capabilities" || !parts[1]) {
      continue;
    }
    const capability = parts[1];
    const row = counts.get(capability) ?? { capability, domain: 0, server: 0, web: 0, ai: 0 };
    if (parts[2] === "business" && parts[3] === "src") {
      if (parts[4] === "domain") {
        row.domain += 1;
      } else if (parts[4] === "server") {
        row.server += 1;
      }
    } else if (parts[2] === "web" && parts[3] === "src") {
      row.web += 1;
    } else if (parts[2] === "ai" && parts[3] === "src") {
      row.ai += 1;
    }
    counts.set(capability, row);
  }
  return [...counts.values()].sort((a, b) => a.capability.localeCompare(b.capability));
};

const SUPPRESSION_PATTERNS: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: "oxlint-disable", pattern: /\boxlint-disable(?:-next-line|-line)?\b/g },
  { kind: "eslint-disable", pattern: /\beslint-disable(?:-next-line|-line)?\b/g },
  { kind: "fallow-ignore", pattern: /\bfallow-ignore(?:-next-line)?\b/g },
  { kind: "ts-expect-error", pattern: /@ts-expect-error\b/g },
];

const collectSuppressionLedger = (
  repoRoot: string,
  trackedFiles: readonly string[],
  includeTopFiles: boolean,
): SuppressionLedger => {
  const byKind: Record<string, number> = {
    "oxlint-disable": 0,
    "eslint-disable": 0,
    "fallow-ignore": 0,
    "ts-expect-error": 0,
  };
  const perFile: Array<{ path: string; count: number }> = [];
  let total = 0;

  for (const rawPath of trackedFiles) {
    const filePath = normalizeRepoPath(rawPath);
    if (
      !/^(?:app|capabilities|foundation|interfaces)\//.test(filePath) ||
      !/\.(?:ts|tsx)$/.test(filePath) ||
      !isProductionSourcePath(filePath)
    ) {
      continue;
    }
    let content: string;
    try {
      content = readFileSync(resolve(repoRoot, filePath), "utf8");
    } catch {
      continue;
    }
    let fileCount = 0;
    for (const { kind, pattern } of SUPPRESSION_PATTERNS) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        byKind[kind] = (byKind[kind] ?? 0) + matches.length;
        fileCount += matches.length;
      }
    }
    if (fileCount > 0) {
      total += fileCount;
      perFile.push({ path: filePath, count: fileCount });
    }
  }

  perFile.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  return {
    total,
    byKind,
    ...(includeTopFiles ? { topFiles: perFile.slice(0, 6) } : {}),
  };
};

const runFallowJson = (repoRoot: string, args: readonly string[]): unknown => {
  const fallowBin = resolve(repoRoot, "node_modules/.bin/fallow");
  let raw: string;
  try {
    raw = execFileSync(fallowBin, args, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: FALLOW_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    // Exit code 1 indicates an enforced fallow gate finding; valid JSON is still emitted on stdout.
    const status = error instanceof Error && "status" in error ? error.status : undefined;
    const stdout = error instanceof Error && "stdout" in error ? error.stdout : undefined;
    if (status !== 1 || typeof stdout !== "string" || !stdout.trim()) {
      throw error;
    }
    raw = stdout;
  }
  return JSON.parse(raw);
};

const isShallowRepo = (repoRoot: string): boolean => {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim() === "true"
    );
  } catch {
    return false;
  }
};

const collectStructuralTelemetry = ({
  repoRoot,
  lens,
  axis,
  trackedFiles,
  trackedPathsByIssue,
}: {
  repoRoot: string;
  lens: ScoutLens;
  axis: RotationAxis | null;
  trackedFiles: readonly string[];
  trackedPathsByIssue: ReadonlyMap<string, number[]>;
}): StructuralTelemetry => {
  const pathPatterns = axis?.pathPatterns ?? [];
  const fallowErrors: string[] = [];
  let topFiles: FileScoreEntry[] = [];
  let hotspots: HotspotEntry[] = [];
  let thresholdOverrides: ThresholdOverrideEntry[] = [];
  let cloneGroups: CloneGroupEntry[] = [];
  let entryWeights: EntryWeightEntry[] | undefined;

  try {
    const rawHealth = runFallowJson(repoRoot, [
      "health",
      "--file-scores",
      "--hotspots",
      "--production",
      "--no-cache",
      "--quiet",
      "--format",
      "json",
    ]);
    const health = summarizeFallowHealth({ rawHealth, pathPatterns, trackedPathsByIssue });
    topFiles = health.topFiles;
    hotspots = health.hotspots;
    thresholdOverrides = health.thresholdOverrides;
  } catch (error) {
    fallowErrors.push(`health: ${errorMessage(error)}`);
  }

  try {
    const rawDupes = runFallowJson(repoRoot, [
      "dupes",
      "--production",
      "--skip-local",
      "--no-fragments",
      "--no-cache",
      "--quiet",
      "--format",
      "json",
    ]);
    cloneGroups = summarizeFallowDupes({ rawDupes, pathPatterns, trackedPathsByIssue });
  } catch (error) {
    fallowErrors.push(`dupes: ${errorMessage(error)}`);
  }

  if (axis?.id === "interface-transport-and-routing") {
    try {
      const rawEntryWeight = runFallowJson(repoRoot, [
        "list",
        "--entry-weight",
        "--format",
        "json",
        "--quiet",
      ]);
      entryWeights = summarizeEntryWeights({ rawEntryWeight, trackedPathsByIssue });
    } catch (error) {
      fallowErrors.push(`entry-weight: ${errorMessage(error)}`);
    }
  }

  const suppressions = collectSuppressionLedger(
    repoRoot,
    trackedFiles,
    axis?.id === "enforcement-ladder-and-verification-gaps",
  );

  return {
    shallowClone: isShallowRepo(repoRoot),
    topFiles,
    hotspots,
    thresholdOverrides,
    cloneGroups,
    ...(entryWeights ? { entryWeights } : {}),
    suppressions,
    ...(lens === "architecture"
      ? { capabilitySymmetry: buildCapabilitySymmetry(trackedFiles) }
      : {}),
    ...(fallowErrors.length > 0 ? { fallowErrors } : {}),
  };
};

export const collectUnreadVerifications = (
  trackedFiles: readonly string[],
  lastPrNumber: number | undefined,
): VerificationFileEntry[] => {
  const minPr = lastPrNumber ?? 0;
  const entries: VerificationFileEntry[] = [];
  for (const filePath of trackedFiles) {
    const match = /^verifications\/(\d+)\.md$/.exec(filePath);
    if (!match?.[1]) {
      continue;
    }
    const prNumber = Number.parseInt(match[1], 10);
    if (prNumber > minPr) {
      entries.push({ prNumber, path: filePath });
    }
  }
  return entries.sort((a, b) => a.prNumber - b.prNumber);
};

export const buildCommitQueryArgs = ({
  cursor,
  isAncestor,
  fallbackSinceIso,
  ref = "origin/main",
}: {
  cursor: LensCursor | undefined;
  isAncestor: (sha: string) => boolean;
  fallbackSinceIso: string;
  ref?: string;
}): string[] => {
  if (cursor?.lastCommitSha && isAncestor(cursor.lastCommitSha)) {
    return [
      "log",
      "--reverse",
      "--first-parent",
      "--format=%H\t%cI\t%s",
      `${cursor.lastCommitSha}..${ref}`,
    ];
  }
  const since = cursor?.lastCommitDate ?? fallbackSinceIso;
  return ["log", "--reverse", "--first-parent", `--since=${since}`, "--format=%H\t%cI\t%s", ref];
};

export const parseCommitLog = (raw: string): CommitSummary[] =>
  raw
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line): CommitSummary[] => {
      const [sha, date, ...rest] = line.split("\t");
      const subject = rest.join("\t");
      return sha && date ? [{ sha, date, subject }] : [];
    });

export const buildScoutContext = ({
  lens,
  cursor,
  scanTipSha,
  openProposedCount,
  commits,
  changedFiles,
  rotationTarget,
  rotationAxis = null,
  telemetry = null,
  unreadVerifications,
  openIssues,
  wontfixIssues,
}: {
  lens: ScoutLens;
  cursor: LensCursor | undefined;
  scanTipSha: string;
  openProposedCount: number;
  commits: readonly CommitSummary[];
  changedFiles: readonly string[];
  rotationTarget: string | null;
  rotationAxis?: RotationAxis | null;
  telemetry?: StructuralTelemetry | null;
  unreadVerifications: readonly VerificationFileEntry[];
  openIssues: ReadonlyArray<{ number: number; title: string; labels: string[] }>;
  wontfixIssues: ReadonlyArray<{ number: number; title: string; reason?: string }>;
}) => {
  if (openProposedCount >= MAX_OPEN_PROPOSALS) {
    return {
      status: "cap_reached" as const,
      lens,
      scanTipSha,
      openProposedCount,
      maxOpenProposals: MAX_OPEN_PROPOSALS,
    };
  }

  return {
    status: "ready" as const,
    lens,
    scanTipSha,
    cursor: cursor ?? null,
    openProposedCount,
    maxOpenProposals: MAX_OPEN_PROPOSALS,
    commits,
    changedFiles,
    matchedMechanisms: classifyChangedPaths({ paths: changedFiles }),
    rotationTarget,
    ...(rotationAxis ? { rotationAxis } : {}),
    ...(telemetry ? { telemetry } : {}),
    unreadVerifications,
    openIssues,
    wontfixIssues,
  };
};

const fetchScoutStateIssue = (repoRoot: string, repo: RepoIdentity) => {
  const issue = restIssueItemSchema.parse(
    ghApiJson(
      repoRoot,
      [`repos/${repo.owner}/${repo.name}/issues/${SCOUT_STATE_ISSUE_NUMBER}`],
      resolveScoutGhEnv(),
    ),
  );
  if (issue.state.toUpperCase() !== "OPEN" || issue.title !== SCOUT_STATE_ISSUE_TITLE) {
    throw new Error(
      `Pinned scout state issue #${SCOUT_STATE_ISSUE_NUMBER} must be OPEN and titled "${SCOUT_STATE_ISSUE_TITLE}" (got ${issue.state.toUpperCase()}: "${issue.title}").`,
    );
  }
  return {
    number: issue.number,
    state: issue.state.toUpperCase(),
    title: issue.title,
    body: issue.body ?? "",
  };
};

const isCommitAncestor = (repoRoot: string, sha: string, ref: string): boolean => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, ref], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

export const parseContextLensFlag = (args: readonly string[]): ScoutLens | "auto" => {
  const raw = readFlagValue(args, "--lens");
  if (raw === "auto") {
    return "auto";
  }
  return lensNameSchema.parse(raw);
};

export const parseAdvanceLensFlag = (args: readonly string[]): ScoutLens => {
  const raw = readFlagValue(args, "--lens");
  if (raw === "auto") {
    throw new Error(
      'Cannot pass "--lens auto" to advance. Pass the explicit lens emitted by "scout.ts context".',
    );
  }
  return lensNameSchema.parse(raw);
};

const runContextCommand = (repoRoot: string, requestedLens: ScoutLens | "auto") => {
  const repo = getRepoIdentity(repoRoot);
  const scoutEnv = resolveScoutGhEnv();
  const stateIssue = fetchScoutStateIssue(repoRoot, repo);
  const state = parseScoutState(stateIssue.body);
  const now = new Date();
  let lens: ScoutLens;
  if (requestedLens === "auto") {
    const selection = selectAutoLens({ state, nowMs: now.getTime() });
    if (!selection.due) {
      console.log(
        JSON.stringify(
          {
            status: "idle",
            reason: "all_lenses_fresh",
            nextLens: selection.nextLens,
            nextDueInHours: selection.nextDueInHours,
          },
          null,
          2,
        ),
      );
      return;
    }
    lens = selection.lens;
  } else {
    lens = requestedLens;
  }
  const cursor = state[lens];

  const scanTipSha = execFileSync("git", ["rev-parse", "origin/main"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const openProposedCount = listRestIssues({
    repoRoot,
    repo,
    state: "open",
    labels: ["agent:proposed"],
    env: scoutEnv,
  }).length;

  if (openProposedCount >= MAX_OPEN_PROPOSALS) {
    console.log(
      JSON.stringify(
        buildScoutContext({
          lens,
          cursor,
          scanTipSha,
          openProposedCount,
          commits: [],
          changedFiles: [],
          rotationTarget: null,
          unreadVerifications: [],
          openIssues: [],
          wontfixIssues: [],
        }),
        null,
        2,
      ),
    );
    return;
  }

  const rawOpenIssues = listRestIssues({ repoRoot, repo, state: "open", env: scoutEnv });
  const openIssues = rawOpenIssues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    labels: issue.labels.map((label) => label.name),
  }));

  const rawWontfixIssues = listRestIssues({
    repoRoot,
    repo,
    state: "closed",
    labels: ["wontfix"],
    env: scoutEnv,
  });
  const wontfixIssues = rawWontfixIssues.map((issue) => {
    const comments =
      issue.comments > 0 ? fetchRestIssueComments(repoRoot, repo, issue.number, scoutEnv) : [];
    const reason = extractLatestTrustedRejectionReason(comments);
    return {
      number: issue.number,
      title: issue.title,
      ...(reason ? { reason } : {}),
    };
  });

  const fallbackSinceIso = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
  const logArgs = buildCommitQueryArgs({
    cursor,
    isAncestor: (sha) => isCommitAncestor(repoRoot, sha, scanTipSha),
    fallbackSinceIso,
    ref: scanTipSha,
  });
  const commits = parseCommitLog(execFileSync("git", logArgs, { cwd: repoRoot, encoding: "utf8" }));

  const changedFilesSet = new Set<string>();
  for (const commit of commits) {
    const filesRaw = execFileSync(
      "git",
      [
        "diff-tree",
        "-m",
        "--first-parent",
        "--root",
        "--no-commit-id",
        "--name-only",
        "-r",
        commit.sha,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    for (const filePath of filesRaw.split(/\r?\n/).filter(Boolean)) {
      changedFilesSet.add(filePath);
    }
  }

  const trackedFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", scanTipSha], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const { target: rotationTarget, axis: rotationAxis } = resolveRotationTarget(
    lens,
    trackedFiles,
    cursor?.lastRotationTarget,
  );
  const unreadVerifications =
    lens === "verification-flakes"
      ? collectUnreadVerifications(trackedFiles, cursor?.lastPrNumber)
      : [];

  const trackedPathsByIssue = buildTrackedPathsIndex(
    [...rawOpenIssues, ...rawWontfixIssues].map((issue) => ({
      number: issue.number,
      body: issue.body ?? "",
    })),
  );
  const telemetry =
    lens === "architecture" || lens === "simplification"
      ? collectStructuralTelemetry({
          repoRoot,
          lens,
          axis: rotationAxis,
          trackedFiles,
          trackedPathsByIssue,
        })
      : null;

  const context = buildScoutContext({
    lens,
    cursor,
    scanTipSha,
    openProposedCount,
    commits,
    changedFiles: [...changedFilesSet].sort(),
    rotationTarget,
    rotationAxis,
    telemetry,
    unreadVerifications,
    openIssues,
    wontfixIssues,
  });
  console.log(JSON.stringify(context, null, 2));
};

export type AdvanceOptions = { commitSha: string; target?: string; prNumber?: number };

/** Validates `advance` arguments before the state issue is read or rewritten. */
export const parseAdvanceArgs = (args: readonly string[]): AdvanceOptions => {
  const commitSha = readFlagValue(args, "--commit");
  if (!commitSha) {
    throw new Error(
      'Missing required --commit <scanTipSha> flag. Pass the scanTipSha emitted by "scout.ts context".',
    );
  }
  const target = readFlagValue(args, "--target")?.trim();
  const prNumber = readIntegerFlag(args, "--pr", 1);
  return {
    commitSha,
    ...(target ? { target } : {}),
    ...(prNumber !== null ? { prNumber } : {}),
  };
};

const runAdvanceCommand = (repoRoot: string, lens: ScoutLens, args: readonly string[]) => {
  const { commitSha, target, prNumber } = parseAdvanceArgs(args);
  const repo = getRepoIdentity(repoRoot);
  const stateIssue = fetchScoutStateIssue(repoRoot, repo);
  const state = parseScoutState(stateIssue.body);
  const resolvedSha = execFileSync("git", ["rev-parse", "--verify", `${commitSha}^{commit}`], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const commitDate = execFileSync("git", ["show", "-s", "--format=%cI", resolvedSha], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const lastPrNumber = prNumber ?? state[lens]?.lastPrNumber;
  const lastRotationTarget = target ?? state[lens]?.lastRotationTarget;

  const nextCursor = lensCursorSchema.parse({
    lastCommitSha: resolvedSha,
    lastCommitDate: commitDate,
    ...(lastPrNumber !== undefined ? { lastPrNumber } : {}),
    ...(lastRotationTarget ? { lastRotationTarget } : {}),
    lastRunAt: new Date().toISOString(),
  });
  const nextState: ScoutState = { ...state, [lens]: nextCursor };
  const nextBody = formatScoutStateBody(stateIssue.body, nextState);

  ghApiJson(
    repoRoot,
    [
      `repos/${repo.owner}/${repo.name}/issues/${stateIssue.number}`,
      "-X",
      "PATCH",
      "-f",
      `body=${nextBody}`,
    ],
    resolveScoutGhEnv(),
  );
  console.log(JSON.stringify({ status: "advanced", lens, cursor: nextCursor }));
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const [command, ...rest] = process.argv.slice(2);

  if (command === "context") {
    runContextCommand(repoRoot, parseContextLensFlag(rest));
    return;
  }
  if (command === "advance") {
    runAdvanceCommand(repoRoot, parseAdvanceLensFlag(rest), rest);
    return;
  }
  throw new Error(`Unknown scout command "${command ?? ""}". Expected "context" or "advance".`);
};

if (import.meta.main) {
  runCli();
}
