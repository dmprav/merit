import { type Mechanism, MECHANISMS } from "../../verification/architecture/mechanisms.config.ts";
import { classifyChangedPaths } from "../../verification/architecture/mechanisms.ts";
import type { CommitSummary, GitPort, HistoryQuery } from "./git.ts";
import { collectUnreadVerifications } from "./repo-paths.ts";
import {
  areaForPath,
  areaRunId,
  CHANGE_BATCH_RUN_ID,
  describeRunTarget,
  FIRST_SCAN_LOOKBACK_DAYS,
  isChurnExcludedPath,
  listAreas,
  MS_PER_DAY,
  mechanismRunId,
  type ScoutRunKind,
  SCOUT_RUN_POLICY,
  resolveRunTarget,
} from "./runs.ts";
import { RECORDS_RUN_ID } from "./state-marker.ts";
import type { RunCursor, ScoutState } from "./state.ts";

/** A run whose measured activity reached its threshold. */
export type DueRun = {
  id: string;
  kind: ScoutRunKind;
  target: string;
  metric: number;
  threshold: number;
};

/** Where a run's history starts: after its cursor, or a week back for a run never audited. */
export const historyQueryFor = (
  cursor: RunCursor | undefined,
  scanTipSha: string,
  now: Date,
): HistoryQuery => ({
  cursor,
  tipSha: scanTipSha,
  fallbackSinceIso: new Date(now.getTime() - FIRST_SCAN_LOOKBACK_DAYS * MS_PER_DAY).toISOString(),
});

const KIND_ORDER: readonly ScoutRunKind[] = ["change-batch", "mechanism", "area", "records"];

const byUrgency = (a: DueRun, b: DueRun): number =>
  b.metric / b.threshold - a.metric / a.threshold ||
  KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
  a.id.localeCompare(b.id);

/** Runs `compute` once per distinct history start, since many runs share a cursor (or none). */
const memoizeByCursor = <T>(compute: (query: HistoryQuery) => T): ((query: HistoryQuery) => T) => {
  const results = new Map<string, { value: T }>();
  return (query) => {
    const key = JSON.stringify([query.cursor?.lastCommitSha, query.cursor?.lastCommitDate]);
    const known = results.get(key) ?? { value: compute(query) };
    results.set(key, known);
    return known.value;
  };
};

const touchesMechanism = (files: readonly string[], mechanism: Mechanism): boolean =>
  classifyChangedPaths({ paths: files, mechanisms: [mechanism] }).matched.length > 0;

/**
 * Measures every audit against the merged activity since its cursor and returns those that reached
 * their threshold, most overdue first. Reads history only through `git`, so it needs no checkout at
 * the scan tip.
 */
export const computeDueRuns = ({
  git,
  state,
  scanTipSha,
  now,
  mechanisms = MECHANISMS,
}: {
  git: Pick<GitPort, "listCommitsSince" | "churnSince" | "filesChangedIn" | "trackedFiles">;
  state: ScoutState;
  scanTipSha: string;
  now: Date;
  mechanisms?: readonly Mechanism[];
}): DueRun[] => {
  const commitsSince = memoizeByCursor((query): CommitSummary[] => git.listCommitsSince(query));
  const filesBySha = new Map<string, string[]>();

  const filesIn = (sha: string): string[] => {
    const known = filesBySha.get(sha) ?? git.filesChangedIn(sha);
    filesBySha.set(sha, known);
    return known;
  };

  const churnByArea = memoizeByCursor((query) => {
    const lines = new Map<string, number>();
    for (const { path, additions, deletions } of git.churnSince(query)) {
      if (!isChurnExcludedPath(path)) {
        const area = areaForPath(path);
        lines.set(area, (lines.get(area) ?? 0) + additions + deletions);
      }
    }
    return lines;
  });

  const queryFor = (runId: string) => historyQueryFor(state[runId], scanTipSha, now);

  const trackedFiles = git.trackedFiles(scanTipSha);

  const measured: Array<Omit<DueRun, "target">> = [];

  const measure = (id: string, kind: ScoutRunKind, metric: number, threshold: number) =>
    measured.push({ id, kind, metric, threshold });

  measure(
    CHANGE_BATCH_RUN_ID,
    "change-batch",
    commitsSince(queryFor(CHANGE_BATCH_RUN_ID)).length,
    SCOUT_RUN_POLICY.changeBatch.minCommits,
  );

  const knownAreas = Object.keys(state)
    .filter((key) => key.startsWith("area:"))
    .map((key) => key.slice("area:".length));
  for (const area of new Set([...listAreas(trackedFiles), ...knownAreas])) {
    const id = areaRunId(area);
    measure(
      id,
      "area",
      churnByArea(queryFor(id)).get(area) ?? 0,
      SCOUT_RUN_POLICY.area.minChangedLines,
    );
  }

  for (const mechanism of mechanisms) {
    const id = mechanismRunId(mechanism.id);
    const touching = commitsSince(queryFor(id)).filter((commit) =>
      touchesMechanism(filesIn(commit.sha), mechanism),
    );
    measure(id, "mechanism", touching.length, SCOUT_RUN_POLICY.mechanism.minCommits);
  }

  measure(
    RECORDS_RUN_ID,
    "records",
    collectUnreadVerifications(trackedFiles, state[RECORDS_RUN_ID]?.lastPrNumber).length,
    SCOUT_RUN_POLICY.records.minRecords,
  );

  return measured
    .filter(({ metric, threshold }) => metric >= threshold)
    .map(({ id, kind, metric, threshold }) => ({
      id,
      kind,
      target: describeRunTarget(resolveRunTarget(id, mechanisms)),
      metric,
      threshold,
    }))
    .sort(byUrgency);
};
