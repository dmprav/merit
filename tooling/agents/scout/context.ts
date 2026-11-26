import { classifyChangedPaths } from "../../verification/architecture/mechanisms.ts";
import { MAX_OPEN_PROPOSALS, type ScoutLens } from "../proposal.ts";
import { describeRotationAxis } from "./axes.ts";
import type { CommitSummary } from "./git.ts";
import type { RotationTarget } from "./lenses.ts";
import type { VerificationFileEntry } from "./repo-paths.ts";
import type { LensCursor } from "./state.ts";
import type { StructuralTelemetry } from "./telemetry.ts";
import type { OpenIssueSummary, WontfixIssueSummary } from "./tracked-issues.ts";

/** The lens a run inspects and the facts that decide whether it may propose anything. */
export type ScoutRun = {
  lens: ScoutLens;
  cursor: LensCursor | undefined;
  scanTipSha: string;
  openProposedCount: number;
};

/** What a ready run found for its lens since the cursor. */
export type ScoutScan = {
  commits: readonly CommitSummary[];
  changedFiles: readonly string[];
  rotation: RotationTarget;
  telemetry: StructuralTelemetry | null;
  unreadVerifications: readonly VerificationFileEntry[];
  openIssues: readonly OpenIssueSummary[];
  wontfixIssues: readonly WontfixIssueSummary[];
};

/** `--lens auto` found every lens inside its target interval. */
export const idleContext = ({
  nextLens,
  nextDueInHours,
}: {
  nextLens: ScoutLens;
  nextDueInHours: number;
}) => ({
  status: "idle" as const,
  reason: "all_lenses_fresh" as const,
  nextLens,
  nextDueInHours,
});

/** Enough proposals await a maintainer that the run must stop before inspecting anything. */
export const capReachedContext = ({
  lens,
  scanTipSha,
  openProposedCount,
}: Pick<ScoutRun, "lens" | "scanTipSha" | "openProposedCount">) => ({
  status: "cap_reached" as const,
  lens,
  scanTipSha,
  openProposedCount,
  maxOpenProposals: MAX_OPEN_PROPOSALS,
});

export const buildScoutContext = (
  { lens, cursor, scanTipSha, openProposedCount }: ScoutRun,
  {
    commits,
    changedFiles,
    rotation,
    telemetry,
    unreadVerifications,
    openIssues,
    wontfixIssues,
  }: ScoutScan,
) => ({
  status: "ready" as const,
  lens,
  scanTipSha,
  cursor: cursor ?? null,
  openProposedCount,
  maxOpenProposals: MAX_OPEN_PROPOSALS,
  commits,
  changedFiles,
  matchedMechanisms: classifyChangedPaths({ paths: changedFiles }),
  rotationTarget: rotation.target,
  ...(rotation.axis ? { rotationAxis: describeRotationAxis(rotation.axis) } : {}),
  ...(telemetry ? { telemetry } : {}),
  unreadVerifications,
  openIssues,
  wontfixIssues,
});

export type ScoutContext =
  | ReturnType<typeof idleContext>
  | ReturnType<typeof capReachedContext>
  | ReturnType<typeof buildScoutContext>;
