import { errorMessage, normalizeRepoPath } from "../../cli.ts";
import type { RotationAxis } from "./axes.ts";
import {
  type CloneGroupEntry,
  type EntryWeightEntry,
  type FallowPort,
  type FileScoreEntry,
  type HotspotEntry,
  summarizeEntryWeights,
  summarizeFallowDupes,
  summarizeFallowHealth,
  type ThresholdOverrideEntry,
} from "./fallow-reports.ts";
import type { GitPort } from "./git.ts";
import { isProductionSourcePath } from "./repo-paths.ts";

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

type CapabilityLayer = "domain" | "server" | "web" | "ai";

const TYPESCRIPT_SOURCE_PATTERN = /\.(?:ts|tsx)$/;

/** The layer of a path below `capabilities/<name>/`, such as `business/src/domain/...`. */
const capabilityLayerOf = ([
  area,
  src,
  subdirectory,
]: readonly string[]): CapabilityLayer | null => {
  if (src !== "src") {
    return null;
  }
  if (area === "business") {
    return subdirectory === "domain" || subdirectory === "server" ? subdirectory : null;
  }
  return area === "web" || area === "ai" ? area : null;
};

/** Counts production TypeScript files per capability layer so lopsided capabilities stand out. */
export const buildCapabilitySymmetry = (
  trackedFiles: readonly string[],
): CapabilitySymmetryEntry[] => {
  const counts = new Map<string, CapabilitySymmetryEntry>();
  for (const filePath of trackedFiles.map(normalizeRepoPath)) {
    const [root, capability, ...rest] = filePath.split("/");
    if (
      root !== "capabilities" ||
      !capability ||
      !TYPESCRIPT_SOURCE_PATTERN.test(filePath) ||
      !isProductionSourcePath(filePath)
    ) {
      continue;
    }
    const row = counts.get(capability) ?? { capability, domain: 0, server: 0, web: 0, ai: 0 };
    const layer = capabilityLayerOf(rest);
    if (layer) {
      row[layer] += 1;
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

const SUPPRESSION_SCAN_ROOT_PATTERN = /^(?:app|capabilities|foundation|interfaces)\//;
const SUPPRESSION_TOP_FILE_COUNT = 6;

const scansForSuppressions = (filePath: string): boolean =>
  SUPPRESSION_SCAN_ROOT_PATTERN.test(filePath) &&
  TYPESCRIPT_SOURCE_PATTERN.test(filePath) &&
  isProductionSourcePath(filePath);

/** Counts each suppression kind in one file's source. */
const countSuppressions = (content: string): Array<{ kind: string; count: number }> =>
  SUPPRESSION_PATTERNS.map(({ kind, pattern }) => ({
    kind,
    count: content.match(pattern)?.length ?? 0,
  }));

const readIfPresent = (readFile: (repoPath: string) => string, repoPath: string): string | null => {
  try {
    return readFile(repoPath);
  } catch {
    return null;
  }
};

/** Counts lint, fallow, and type-check suppressions in production sources, optionally naming the heaviest files. */
export const collectSuppressionLedger = (
  readFile: (repoPath: string) => string,
  trackedFiles: readonly string[],
  includeTopFiles: boolean,
): SuppressionLedger => {
  const byKind: Record<string, number> = Object.fromEntries(
    SUPPRESSION_PATTERNS.map(({ kind }) => [kind, 0]),
  );
  const perFile: Array<{ path: string; count: number }> = [];
  for (const filePath of trackedFiles.map(normalizeRepoPath).filter(scansForSuppressions)) {
    const content = readIfPresent(readFile, filePath);
    if (content === null) {
      continue;
    }
    let fileCount = 0;
    for (const { kind, count } of countSuppressions(content)) {
      byKind[kind] = (byKind[kind] ?? 0) + count;
      fileCount += count;
    }
    if (fileCount > 0) {
      perFile.push({ path: filePath, count: fileCount });
    }
  }

  perFile.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  return {
    total: perFile.reduce((sum, file) => sum + file.count, 0),
    byKind,
    ...(includeTopFiles ? { topFiles: perFile.slice(0, SUPPRESSION_TOP_FILE_COUNT) } : {}),
  };
};

/** Runs one fallow report, recording its failure so the rest of the telemetry still arrives. */
const readFallowReport = <T>(name: string, errors: string[], summarize: () => T): T | undefined => {
  try {
    return summarize();
  } catch (error) {
    errors.push(`${name}: ${errorMessage(error)}`);
    return undefined;
  }
};

export type TelemetryPorts = {
  fallow: FallowPort;
  git: Pick<GitPort, "isShallow">;
  /** Reads a repository-relative file from the working tree. */
  readFile: (repoPath: string) => string;
};

/** Gathers fallow health, duplication, and suppression signals, focused on the rotation axis's paths. */
export const collectStructuralTelemetry = (
  { fallow, git, readFile }: TelemetryPorts,
  {
    capabilitySymmetry,
    axis,
    trackedFiles,
    trackedPathsByIssue,
  }: {
    capabilitySymmetry: boolean;
    axis: RotationAxis | null;
    trackedFiles: readonly string[];
    trackedPathsByIssue: ReadonlyMap<string, number[]>;
  },
): StructuralTelemetry => {
  const pathPatterns = axis?.pathPatterns ?? [];
  const fallowErrors: string[] = [];
  const health = readFallowReport("health", fallowErrors, () =>
    summarizeFallowHealth({ rawHealth: fallow.health(), pathPatterns, trackedPathsByIssue }),
  );
  const cloneGroups = readFallowReport("dupes", fallowErrors, () =>
    summarizeFallowDupes({ rawDupes: fallow.dupes(), pathPatterns, trackedPathsByIssue }),
  );
  const entryWeights = axis?.telemetry?.entryWeights
    ? readFallowReport("entry-weight", fallowErrors, () =>
        summarizeEntryWeights({ rawEntryWeight: fallow.entryWeight(), trackedPathsByIssue }),
      )
    : undefined;
  const suppressions = collectSuppressionLedger(
    readFile,
    trackedFiles,
    axis?.telemetry?.suppressionTopFiles ?? false,
  );

  return {
    shallowClone: git.isShallow(),
    topFiles: health?.topFiles ?? [],
    hotspots: health?.hotspots ?? [],
    thresholdOverrides: health?.thresholdOverrides ?? [],
    cloneGroups: cloneGroups ?? [],
    ...(entryWeights ? { entryWeights } : {}),
    suppressions,
    ...(capabilitySymmetry ? { capabilitySymmetry: buildCapabilitySymmetry(trackedFiles) } : {}),
    ...(fallowErrors.length > 0 ? { fallowErrors } : {}),
  };
};
