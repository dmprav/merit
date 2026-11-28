import { AGENT_LABELS } from "../../verification/agent-policy.ts";
import { buildScoutContext, type ScoutContext, type ScoutRun, type ScoutScan } from "./context.ts";
import { type DueRun, computeDueRuns, historyQueryFor } from "./due.ts";
import { assertCheckoutAt, type CommitSummary, type GitPort, SCAN_REF } from "./git.ts";
import type { IssuePort, ScoutPorts } from "./ports.ts";
import { collectUnreadVerifications } from "./repo-paths.ts";
import {
  isPathInTarget,
  listAreas,
  measuresEntryWeights,
  resolveRunTarget,
  SCOUT_RUN_POLICY,
  type ScoutRunTarget,
} from "./runs.ts";
import { RECORDS_RUN_ID } from "./state-marker.ts";
import {
  advanceScoutStateBody,
  nextRunCursor,
  parseScoutState,
  type RunCursor,
  SCOUT_STATE_ISSUE_NUMBER,
  SCOUT_STATE_ISSUE_TITLE,
  scoutStateForReading,
  startScoutStateBody,
} from "./state.ts";
import { collectStructuralTelemetry } from "./telemetry.ts";
import {
  buildTrackedPathsIndex,
  summarizeOpenIssue,
  summarizeWontfixIssue,
} from "./tracked-issues.ts";

const fetchScoutStateIssue = (issues: Pick<IssuePort, "viewIssue">) => {
  const issue = issues.viewIssue(SCOUT_STATE_ISSUE_NUMBER);
  if (issue.state !== "OPEN" || issue.title !== SCOUT_STATE_ISSUE_TITLE) {
    throw new Error(
      `Pinned scout state issue #${SCOUT_STATE_ISSUE_NUMBER} must be OPEN and titled "${SCOUT_STATE_ISSUE_TITLE}" (got ${issue.state}: "${issue.title}").`,
    );
  }
  return issue;
};

const readScoutState = (ports: Pick<ScoutPorts, "issues" | "warn">) => {
  const stateIssue = fetchScoutStateIssue(ports.issues);
  return scoutStateForReading(parseScoutState(stateIssue.body), stateIssue.number, ports.warn);
};

export type DueReport =
  | { status: "due"; scanTipSha: string; runs: DueRun[]; deferred?: number }
  | { status: "idle"; scanTipSha: string };

/**
 * Lists the audits whose merged activity since their cursors reached a threshold, most overdue
 * first, up to the per-check cap. Runs past the cap are counted as `deferred`; runs whose started
 * session is still in flight are neither listed nor counted.
 */
export const buildDue = (ports: ScoutPorts): DueReport => {
  const state = readScoutState(ports);
  const scanTipSha = ports.git.revParse(SCAN_REF);
  const due = computeDueRuns({ git: ports.git, state, scanTipSha, now: ports.now() });
  const runs = due.slice(0, SCOUT_RUN_POLICY.check.maxRunsPerCheck);
  if (runs.length === 0) {
    return { status: "idle", scanTipSha };
  }
  const deferred = due.length - runs.length;
  return { status: "due", scanTipSha, runs, ...(deferred > 0 ? { deferred } : {}) };
};

const filtersPaths = ({ kind }: ScoutRunTarget): boolean => kind === "area" || kind === "mechanism";

const collectChangedFiles = (
  git: GitPort,
  commits: readonly CommitSummary[],
  target: ScoutRunTarget,
): { commits: CommitSummary[]; changedFiles: string[] } => {
  const kept: CommitSummary[] = [];
  const files = new Set<string>();
  for (const commit of commits) {
    const inTarget = git.filesChangedIn(commit.sha).filter((file) => isPathInTarget(target, file));
    if (inTarget.length > 0 || !filtersPaths(target)) {
      kept.push(commit);
      inTarget.forEach((file) => files.add(file));
    }
  }
  return { commits: kept, changedFiles: [...files].sort() };
};

/** Whether telemetry is collected for the target, and which of its optional parts. */
const telemetryPlan = (target: ScoutRunTarget) =>
  target.kind === "area" || target.kind === "mechanism"
    ? {
        capabilitySymmetry: target.kind === "mechanism",
        entryWeights: measuresEntryWeights(target),
      }
    : null;

/** Reads what the run inspects: history since its cursor, its telemetry, and the issues it must not repeat. */
const scanForRun = (
  ports: ScoutPorts,
  { target, cursor, scanTipSha }: ScoutRun,
  trackedFiles: readonly string[],
): ScoutScan => {
  const openIssues = ports.issues.listIssues({ state: "open" });
  const wontfixIssues = ports.issues.listIssues({
    state: "closed",
    label: AGENT_LABELS.wontfix,
    withComments: true,
  });
  const commitsSince = ports.git.listCommitsSince(historyQueryFor(cursor, scanTipSha, ports.now()));
  const { commits, changedFiles } = collectChangedFiles(ports.git, commitsSince, target);
  const plan = telemetryPlan(target);

  return {
    commits,
    changedFiles,
    telemetry: plan
      ? collectStructuralTelemetry(ports, {
          inScope: (filePath) => isPathInTarget(target, filePath),
          ...plan,
          trackedFiles,
          trackedPathsByIssue: buildTrackedPathsIndex([...openIssues, ...wontfixIssues]),
        })
      : null,
    unreadVerifications:
      target.kind === "records"
        ? collectUnreadVerifications(trackedFiles, cursor?.lastPrNumber)
        : null,
    openIssues: openIssues.map(summarizeOpenIssue),
    wontfixIssues: wontfixIssues.map(summarizeWontfixIssue),
  };
};

/** Refuses an area run whose area holds no tracked files at the scan tip. */
const requireKnownArea = (
  target: ScoutRunTarget,
  runId: string,
  trackedFiles: readonly string[],
): void => {
  if (target.kind === "area" && !listAreas(trackedFiles).includes(target.area)) {
    throw new Error(
      `Unknown area run "${runId}". Valid areas: ${listAreas(trackedFiles).sort().join(", ")}.`,
    );
  }
};

/**
 * Builds the context a scout session reads before auditing one run. Refuses an unknown run id before
 * reading anything, and a run whose checkout is not a clean copy of the scan tip.
 */
export const buildContext = (ports: ScoutPorts, runId: string): ScoutContext => {
  const target = resolveRunTarget(runId);
  const state = readScoutState(ports);
  const scanTipSha = ports.git.revParse(SCAN_REF);
  const trackedFiles = ports.git.trackedFiles(scanTipSha);
  requireKnownArea(target, runId, trackedFiles);
  assertCheckoutAt(ports.git, scanTipSha);
  const run: ScoutRun = { id: runId, target, cursor: state[runId], scanTipSha };
  return buildScoutContext(run, scanForRun(ports, run, trackedFiles));
};

export type AdvanceOptions = {
  runId: string;
  commitSha: string;
  prNumber?: number;
};

/** Records a finished run's scan tip, and for `records` its pull request, on the state issue. */
export const advanceRun = (
  ports: Pick<ScoutPorts, "git" | "issues" | "now">,
  { runId, commitSha, prNumber }: AdvanceOptions,
): { status: "advanced"; run: string; cursor: RunCursor } => {
  const target = resolveRunTarget(runId);
  if (prNumber !== undefined && runId !== RECORDS_RUN_ID) {
    throw new Error(`--pr applies only to the "${RECORDS_RUN_ID}" run (got "${runId}").`);
  }
  requireKnownArea(target, runId, ports.git.trackedFiles(ports.git.revParse(SCAN_REF)));
  const stateIssue = fetchScoutStateIssue(ports.issues);
  const { body, cursor } = advanceScoutStateBody({
    issueNumber: stateIssue.number,
    issueBody: stateIssue.body,
    runId,
    nextCursor: (previous) => {
      const resolvedSha = ports.git.verifyCommit(commitSha);
      return nextRunCursor({
        previous,
        commitSha: resolvedSha,
        commitDate: ports.git.commitDate(resolvedSha),
        prNumber,
        runAt: ports.now(),
      });
    },
  });
  ports.issues.editIssueBody(stateIssue.number, body);
  return { status: "advanced", run: runId, cursor };
};

/**
 * Records that sessions were started for `runIds` on the state issue in one edit, so the next check
 * does not list them again until they advance or time out. Validates every run id before writing.
 */
export const startRuns = (
  ports: Pick<ScoutPorts, "git" | "issues" | "now">,
  { runIds }: { runIds: readonly string[] },
): { status: "started"; runs: string[]; startedAt: string } => {
  const unique = [...new Set(runIds)];
  const targets = unique.map((runId) => resolveRunTarget(runId));
  const trackedFiles = ports.git.trackedFiles(ports.git.revParse(SCAN_REF));
  targets.forEach((target, index) => requireKnownArea(target, unique[index] ?? "", trackedFiles));
  const stateIssue = fetchScoutStateIssue(ports.issues);
  const startedAt = ports.now();
  const { body } = startScoutStateBody({
    issueNumber: stateIssue.number,
    issueBody: stateIssue.body,
    runIds: unique,
    startedAt,
  });
  ports.issues.editIssueBody(stateIssue.number, body);
  return { status: "started", runs: unique, startedAt: startedAt.toISOString() };
};
