import { normalizeRepoPath } from "../../cli.ts";
import { type Mechanism, MECHANISMS } from "../../verification/architecture/mechanisms.config.ts";
import { classifyChangedPaths } from "../../verification/architecture/mechanisms.ts";
import { RECORDS_RUN_ID } from "./state-marker.ts";

export const MS_PER_HOUR = 60 * 60 * 1000;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** How far back a run that was never audited reads history. */
export const FIRST_SCAN_LOOKBACK_DAYS = 7;

/** When each kind of audit is due; tune the pilot here. */
export const SCOUT_RUN_POLICY = {
  /** First-parent commits merged to `origin/main` since the `change-batch` cursor. */
  changeBatch: { minCommits: 10 },
  /** Added plus deleted lines in one area since its cursor, excluding generated and record files. */
  area: { minChangedLines: 3000 },
  /** Commits since the cursor that touched a mechanism's contract or adapter paths. */
  mechanism: { minCommits: 5 },
  /** `verifications/<n>.md` files newer than the `records` cursor's pull request. */
  records: { minRecords: 8 },
  /** How one scheduled check starts sessions. */
  check: {
    /** The most runs in flight at once: `due` lists up to this many minus those already started. */
    maxRunsInFlight: 3,
    /** How long a started run stays in flight before a crashed session's run is due again. */
    startedRunTimeoutHours: 6,
  },
} as const;

export type ScoutRunKind = "change-batch" | "area" | "mechanism" | "records";

/** What a run audits: the merged history, one area's code, one mechanism's paths, or new records. */
export type ScoutRunTarget =
  | { kind: "change-batch" }
  | { kind: "area"; area: string }
  | { kind: "mechanism"; mechanism: Mechanism }
  | { kind: "records" };

export const CHANGE_BATCH_RUN_ID = "change-batch";
const AREA_PREFIX = "area:";
const MECHANISM_PREFIX = "mechanism:";

export const areaRunId = (area: string) => `${AREA_PREFIX}${area}`;

export const mechanismRunId = (mechanismId: string) => `${MECHANISM_PREFIX}${mechanismId}`;

/** The id forms a run id may take, for error messages. */
const RUN_ID_FORMS = `"${CHANGE_BATCH_RUN_ID}", "area:<area>", "mechanism:<mechanism id>", or "${RECORDS_RUN_ID}"`;

/** Whether `key` has the shape of a run id, without checking that its area or mechanism exists. */
export const hasRunIdForm = (key: string): boolean =>
  key === CHANGE_BATCH_RUN_ID ||
  key === RECORDS_RUN_ID ||
  (key.startsWith(AREA_PREFIX) && key.length > AREA_PREFIX.length) ||
  (key.startsWith(MECHANISM_PREFIX) && key.length > MECHANISM_PREFIX.length);

/** Names a run's kind and target for the context and the due list. */
export const describeRunTarget = (target: ScoutRunTarget): string => {
  switch (target.kind) {
    case "change-batch":
      return "merged commits on origin/main";
    case "area":
      return target.area;
    case "mechanism":
      return target.mechanism.id;
    case "records":
      return "verification records";
  }
};

/** Resolves a run id to its target, failing with every valid id form when it matches none. */
export const resolveRunTarget = (
  runId: string,
  mechanisms: readonly Mechanism[] = MECHANISMS,
): ScoutRunTarget => {
  if (runId === CHANGE_BATCH_RUN_ID) {
    return { kind: "change-batch" };
  }
  if (runId === RECORDS_RUN_ID) {
    return { kind: "records" };
  }
  if (runId.startsWith(AREA_PREFIX) && hasRunIdForm(runId)) {
    return { kind: "area", area: runId.slice(AREA_PREFIX.length) };
  }
  const mechanism = mechanisms.find((entry) => mechanismRunId(entry.id) === runId);
  if (mechanism) {
    return { kind: "mechanism", mechanism };
  }
  const mechanismIds = mechanisms.map((entry) => entry.id).join(", ");
  throw new Error(
    `Unknown run id "${runId}". Expected ${RUN_ID_FORMS}. Mechanism ids: ${mechanismIds}.`,
  );
};

const TWO_SEGMENT_ROOTS = new Set(["capabilities", "foundation", "interfaces", "tooling"]);

/**
 * The area a path belongs to: its first two segments under `capabilities/`, `foundation/`,
 * `interfaces/`, and `tooling/`, else its first segment. A file directly inside one of those four
 * roots belongs to the root itself.
 */
export const areaForPath = (filePath: string): string => {
  const parts = normalizeRepoPath(filePath).split("/");
  const [first = "."] = parts;
  const second = parts[1];
  return TWO_SEGMENT_ROOTS.has(first) && second !== undefined && parts.length > 2
    ? `${first}/${second}`
    : first;
};

const IMAGE_FILE_PATTERN = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|svg)$/i;
const MIGRATION_META_PATTERN = /(?:^|\/)migrations\/meta\//;

/** Paths whose line counts say nothing about how much an area changed. */
export const isChurnExcludedPath = (filePath: string): boolean => {
  const normalized = normalizeRepoPath(filePath);
  const name = normalized.slice(normalized.lastIndexOf("/") + 1);
  return (
    normalized.startsWith("verifications/") ||
    name === "pnpm-lock.yaml" ||
    name.endsWith(".lock") ||
    name.endsWith(".snap") ||
    IMAGE_FILE_PATTERN.test(name) ||
    MIGRATION_META_PATTERN.test(normalized)
  );
};

/** The areas that hold tracked files whose churn counts. */
export const listAreas = (trackedFiles: readonly string[]): string[] => [
  ...new Set(trackedFiles.filter((file) => !isChurnExcludedPath(file)).map(areaForPath)),
];

/** Whether `filePath` belongs to the run's target. Runs over everything or records have no path filter. */
export const isPathInTarget = (target: ScoutRunTarget, filePath: string): boolean => {
  switch (target.kind) {
    case "area":
      return areaForPath(filePath) === target.area;
    case "mechanism":
      return (
        classifyChangedPaths({ paths: [filePath], mechanisms: [target.mechanism] }).matched.length >
        0
      );
    case "change-batch":
    case "records":
      return true;
  }
};

export type ScoutConcern =
  | "bugs-security"
  | "architecture"
  | "tests"
  | "simplification"
  | "mcp-db"
  | "docs"
  | "verification";

/** The concerns every run of a kind applies; the order is their weight, heaviest first. */
export const CONCERNS_BY_KIND: Record<ScoutRunKind, readonly ScoutConcern[]> = {
  "change-batch": ["bugs-security", "tests", "docs", "architecture", "simplification", "mcp-db"],
  mechanism: ["architecture", "simplification", "bugs-security", "tests", "mcp-db", "docs"],
  area: ["bugs-security", "architecture", "tests", "simplification", "mcp-db", "docs"],
  records: ["verification"],
};

/** Areas under `interfaces/` and `app` ship route bundles, so their runs measure entry weights. */
export const measuresEntryWeights = (target: ScoutRunTarget): boolean =>
  target.kind === "area" && (target.area === "app" || target.area.startsWith("interfaces/"));
