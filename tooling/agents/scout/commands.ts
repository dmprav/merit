import { AGENT_LABELS } from "../../verification/agent-policy.ts";
import { isProposalCapReached, type ScoutLens } from "../proposal.ts";
import {
  buildScoutContext,
  capReachedContext,
  idleContext,
  type ScoutContext,
  type ScoutRun,
  type ScoutScan,
} from "./context.ts";
import { type CommitSummary, type GitPort, SCAN_REF } from "./git.ts";
import { LENS_POLICIES, MS_PER_DAY, resolveRotationTarget, selectAutoLens } from "./lenses.ts";
import type { IssuePort, ScoutPorts } from "./ports.ts";
import { collectUnreadVerifications } from "./repo-paths.ts";
import {
  advanceScoutStateBody,
  type LensCursor,
  nextLensCursor,
  parseScoutState,
  SCOUT_STATE_ISSUE_NUMBER,
  SCOUT_STATE_ISSUE_TITLE,
  type ScoutState,
  scoutStateForReading,
} from "./state.ts";
import { collectStructuralTelemetry } from "./telemetry.ts";
import {
  buildTrackedPathsIndex,
  summarizeOpenIssue,
  summarizeWontfixIssue,
} from "./tracked-issues.ts";

/** How far back a lens without a usable cursor reads history. */
const FIRST_SCAN_LOOKBACK_DAYS = 7;

const fetchScoutStateIssue = (issues: Pick<IssuePort, "viewIssue">) => {
  const issue = issues.viewIssue(SCOUT_STATE_ISSUE_NUMBER);
  if (issue.state !== "OPEN" || issue.title !== SCOUT_STATE_ISSUE_TITLE) {
    throw new Error(
      `Pinned scout state issue #${SCOUT_STATE_ISSUE_NUMBER} must be OPEN and titled "${SCOUT_STATE_ISSUE_TITLE}" (got ${issue.state}: "${issue.title}").`,
    );
  }
  return issue;
};

/** Resolves `--lens auto` to the most overdue lens, or to an idle context when none is due. */
const chooseLens = (
  requestedLens: ScoutLens | "auto",
  state: ScoutState,
  nowMs: number,
): ScoutLens | ReturnType<typeof idleContext> => {
  if (requestedLens !== "auto") {
    return requestedLens;
  }
  const selection = selectAutoLens({ state, nowMs });
  return selection.due ? selection.lens : idleContext(selection);
};

const collectChangedFiles = (git: GitPort, commits: readonly CommitSummary[]): string[] =>
  [...new Set(commits.flatMap((commit) => git.filesChangedIn(commit.sha)))].sort();

/** Reads what the lens inspects: history since its cursor, its rotation target, and its telemetry. */
const scanForLens = (
  ports: ScoutPorts,
  { lens, cursor, scanTipSha }: ScoutRun,
  now: Date,
): ScoutScan => {
  const policy = LENS_POLICIES[lens];
  const openIssues = ports.issues.listIssues({ state: "open" });
  const wontfixIssues = ports.issues.listIssues({
    state: "closed",
    label: AGENT_LABELS.wontfix,
    withComments: true,
  });
  const fallbackSinceIso = new Date(
    now.getTime() - FIRST_SCAN_LOOKBACK_DAYS * MS_PER_DAY,
  ).toISOString();
  const commits = ports.git.listCommitsSince({ cursor, tipSha: scanTipSha, fallbackSinceIso });
  const changedFiles = collectChangedFiles(ports.git, commits);
  const trackedFiles = ports.git.trackedFiles(scanTipSha);
  const rotation = resolveRotationTarget(lens, trackedFiles, cursor?.lastRotationTarget);

  return {
    commits,
    changedFiles,
    rotation,
    telemetry: policy.telemetry
      ? collectStructuralTelemetry(ports, {
          capabilitySymmetry: policy.telemetry.capabilitySymmetry,
          axis: rotation.axis,
          trackedFiles,
          trackedPathsByIssue: buildTrackedPathsIndex([...openIssues, ...wontfixIssues]),
        })
      : null,
    unreadVerifications: policy.readsVerifications
      ? collectUnreadVerifications(trackedFiles, cursor?.lastPrNumber)
      : [],
    openIssues: openIssues.map(summarizeOpenIssue),
    wontfixIssues: wontfixIssues.map(summarizeWontfixIssue),
  };
};

/**
 * Builds the context a scout reads before inspecting a lens. Stops before any history or telemetry
 * work when `--lens auto` finds nothing due or the open proposal cap is reached.
 */
export const buildContext = (
  ports: ScoutPorts,
  requestedLens: ScoutLens | "auto",
): ScoutContext => {
  const stateIssue = fetchScoutStateIssue(ports.issues);
  const state = scoutStateForReading(
    parseScoutState(stateIssue.body),
    stateIssue.number,
    ports.warn,
  );
  const now = ports.now();
  const lens = chooseLens(requestedLens, state, now.getTime());
  if (typeof lens !== "string") {
    return lens;
  }

  const run: ScoutRun = {
    lens,
    cursor: state[lens],
    scanTipSha: ports.git.revParse(SCAN_REF),
    openProposedCount: ports.issues.listIssues({ state: "open", label: AGENT_LABELS.proposed })
      .length,
  };
  if (isProposalCapReached(run.openProposedCount)) {
    return capReachedContext(run);
  }
  return buildScoutContext(run, scanForLens(ports, run, now));
};

export type AdvanceOptions = {
  lens: ScoutLens;
  commitSha: string;
  target?: string;
  prNumber?: number;
};

/** Records a finished run's scan tip, rotation target, and pull request on the state issue. */
export const advanceLens = (
  ports: Pick<ScoutPorts, "git" | "issues" | "now">,
  { lens, commitSha, target, prNumber }: AdvanceOptions,
): { status: "advanced"; lens: ScoutLens; cursor: LensCursor } => {
  const stateIssue = fetchScoutStateIssue(ports.issues);
  const { body, cursor } = advanceScoutStateBody({
    issueNumber: stateIssue.number,
    issueBody: stateIssue.body,
    lens,
    nextCursor: (previous) => {
      const resolvedSha = ports.git.verifyCommit(commitSha);
      return nextLensCursor({
        previous,
        commitSha: resolvedSha,
        commitDate: ports.git.commitDate(resolvedSha),
        target,
        prNumber,
        runAt: ports.now(),
      });
    },
  });
  ports.issues.editIssueBody(stateIssue.number, body);
  return { status: "advanced", lens, cursor };
};
