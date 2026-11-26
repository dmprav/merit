import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { errorMessage, normalizeRepoPath } from "../../cli.ts";
import type { ScoutLens } from "../proposal.ts";
import type { RotationAxis } from "./axes.ts";
import {
  type CloneGroupEntry,
  type EntryWeightEntry,
  type FileScoreEntry,
  type HotspotEntry,
  summarizeEntryWeights,
  summarizeFallowDupes,
  summarizeFallowHealth,
  type ThresholdOverrideEntry,
} from "./fallow-reports.ts";
import { isProductionSourcePath } from "./repo-paths.ts";

const FALLOW_TIMEOUT_MS = 25_000;

export type SuppressionLedger = {
  total: number;
  byKind: Record<string, number>;
  topFiles?: Array<{ path: string; count: number }>;
};

export type CapabilitySymmetryEntry = {
  capability: string;
  domain: number;
  server: number;
  web: number;
  ai: number;
};

export type StructuralTelemetry = {
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

export const collectStructuralTelemetry = ({
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
