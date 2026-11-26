import { z } from "zod";

import { normalizeRepoPath } from "../../cli.ts";
import { isProductionSourcePath, matchesAnyPattern } from "./repo-paths.ts";
import { trackedByForPaths } from "./tracked-issues.ts";

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

export type FileScoreEntry = {
  path: string;
  lines: number;
  fanIn: number;
  fanOut: number;
  functions: number;
  cyclomatic: number;
  inAxis: boolean;
  trackedBy: number[];
};

export type HotspotEntry = {
  path: string;
  score: number;
  commits: number;
  trend: string;
  trackedBy: number[];
};

export type ThresholdOverrideEntry = {
  path: string;
  function?: string;
  line?: number;
  lines?: number;
  cognitive?: number;
  reason?: string;
};

export type CloneGroupEntry = {
  lines: number;
  suggestedName?: string;
  instances: string[];
  inAxis: boolean;
  trackedBy: number[];
};

export type EntryWeightEntry = {
  path: string;
  source: string;
  eagerModules: number;
  eagerKb: number;
  deferredModules: number;
  trackedBy: number[];
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
