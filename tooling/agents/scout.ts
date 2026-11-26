import { execFileSync } from "node:child_process";

import { parseCliArgs, parseWholeNumber } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import { AGENT_LABELS } from "../verification/agent-policy.ts";
import { createGitHubIssueCliClient, type GitHubIssueCliClient } from "./github.ts";
import { MAX_OPEN_PROPOSALS, SCOUT_LENSES, type ScoutLens } from "./proposal.ts";
import { buildScoutContext } from "./scout/context.ts";
import { buildCommitQueryArgs, parseCommitLog } from "./scout/git.ts";
import { MS_PER_DAY, resolveRotationTarget, selectAutoLens } from "./scout/lenses.ts";
import { collectUnreadVerifications } from "./scout/repo-paths.ts";
import {
  advanceScoutStateBody,
  lensCursorSchema,
  lensNameSchema,
  parseScoutState,
  SCOUT_STATE_ISSUE_NUMBER,
  SCOUT_STATE_ISSUE_TITLE,
  scoutStateForReading,
} from "./scout/state.ts";
import { collectStructuralTelemetry } from "./scout/telemetry.ts";
import {
  buildTrackedPathsIndex,
  extractLatestTrustedRejectionReason,
} from "./scout/tracked-issues.ts";

const fetchScoutStateIssue = (client: GitHubIssueCliClient) => {
  const issue = client.viewIssue(SCOUT_STATE_ISSUE_NUMBER);
  if (issue.state !== "OPEN" || issue.title !== SCOUT_STATE_ISSUE_TITLE) {
    throw new Error(
      `Pinned scout state issue #${SCOUT_STATE_ISSUE_NUMBER} must be OPEN and titled "${SCOUT_STATE_ISSUE_TITLE}" (got ${issue.state}: "${issue.title}").`,
    );
  }
  return issue;
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

const CONTEXT_USAGE = `Usage: scout.ts context --lens <auto|${SCOUT_LENSES.join("|")}>`;
const ADVANCE_USAGE = `Usage: scout.ts advance --lens <${SCOUT_LENSES.join("|")}> --commit <scanTipSha> [--target <rotationTarget>] [--pr <n>]`;

const requireLens = (lens: string | undefined, usage: string): string => {
  if (lens === undefined) {
    throw new Error(`Missing required --lens flag.\n${usage}`);
  }
  return lens;
};

/** Reads `context` arguments; `--lens auto` lets the command pick the next lens. */
export const parseContextArgs = (args: readonly string[]): ScoutLens | "auto" => {
  const { values } = parseCliArgs(args, {
    options: { lens: { type: "string" } },
    usage: CONTEXT_USAGE,
  });
  const lens = requireLens(values.lens, CONTEXT_USAGE);
  return lens === "auto" ? "auto" : lensNameSchema.parse(lens);
};

const runContextCommand = (
  repoRoot: string,
  client: GitHubIssueCliClient,
  requestedLens: ScoutLens | "auto",
) => {
  const stateIssue = fetchScoutStateIssue(client);
  const state = scoutStateForReading(
    parseScoutState(stateIssue.body),
    stateIssue.number,
    console.error,
  );
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

  const openProposedCount = client.listIssues({
    state: "open",
    label: AGENT_LABELS.proposed,
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

  const rawOpenIssues = client.listIssues({ state: "open" });
  const openIssues = rawOpenIssues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    labels: issue.labels,
  }));

  const rawWontfixIssues = client.listIssues({
    state: "closed",
    label: AGENT_LABELS.wontfix,
    withComments: true,
  });
  const wontfixIssues = rawWontfixIssues.map((issue) => {
    const reason = extractLatestTrustedRejectionReason(issue.comments);
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

  const trackedPathsByIssue = buildTrackedPathsIndex([...rawOpenIssues, ...rawWontfixIssues]);
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

export type AdvanceOptions = {
  lens: ScoutLens;
  commitSha: string;
  target?: string;
  prNumber?: number;
};

/** Validates `advance` arguments before the state issue is read or rewritten. */
export const parseAdvanceArgs = (args: readonly string[]): AdvanceOptions => {
  const { values } = parseCliArgs(args, {
    options: {
      lens: { type: "string" },
      commit: { type: "string" },
      target: { type: "string" },
      pr: { type: "string" },
    },
    usage: ADVANCE_USAGE,
  });
  const lens = requireLens(values.lens, ADVANCE_USAGE);
  if (lens === "auto") {
    throw new Error(
      'Cannot pass "--lens auto" to advance. Pass the explicit lens emitted by "scout.ts context".',
    );
  }
  if (!values.commit) {
    throw new Error(
      'Missing required --commit <scanTipSha> flag. Pass the scanTipSha emitted by "scout.ts context".',
    );
  }
  const target = values.target?.trim();
  return {
    lens: lensNameSchema.parse(lens),
    commitSha: values.commit,
    ...(target ? { target } : {}),
    ...(values.pr !== undefined ? { prNumber: parseWholeNumber(values.pr, "--pr") } : {}),
  };
};

const runAdvanceCommand = (
  repoRoot: string,
  client: GitHubIssueCliClient,
  { lens, commitSha, target, prNumber }: AdvanceOptions,
) => {
  const stateIssue = fetchScoutStateIssue(client);
  const { body, cursor } = advanceScoutStateBody({
    issueNumber: stateIssue.number,
    issueBody: stateIssue.body,
    lens,
    nextCursor: (previous) => {
      const resolvedSha = execFileSync("git", ["rev-parse", "--verify", `${commitSha}^{commit}`], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();
      const commitDate = execFileSync("git", ["show", "-s", "--format=%cI", resolvedSha], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();
      const lastPrNumber = prNumber ?? previous?.lastPrNumber;
      const lastRotationTarget = target ?? previous?.lastRotationTarget;
      return lensCursorSchema.parse({
        lastCommitSha: resolvedSha,
        lastCommitDate: commitDate,
        ...(lastPrNumber !== undefined ? { lastPrNumber } : {}),
        ...(lastRotationTarget ? { lastRotationTarget } : {}),
        lastRunAt: new Date().toISOString(),
      });
    },
  });

  client.editIssueBody(stateIssue.number, body);
  console.log(JSON.stringify({ status: "advanced", lens, cursor }));
};

const runCli = () => {
  const [command, ...rest] = process.argv.slice(2);
  const client = createGitHubIssueCliClient({ repoRoot: REPO_ROOT });

  if (command === "context") {
    runContextCommand(REPO_ROOT, client, parseContextArgs(rest));
    return;
  }
  if (command === "advance") {
    runAdvanceCommand(REPO_ROOT, client, parseAdvanceArgs(rest));
    return;
  }
  throw new Error(`Unknown scout command "${command ?? ""}". Expected "context" or "advance".`);
};

if (import.meta.main) {
  runCli();
}
