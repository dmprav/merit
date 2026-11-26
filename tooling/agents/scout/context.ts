import { classifyChangedPaths } from "../../verification/architecture/mechanisms.ts";
import { MAX_OPEN_PROPOSALS, type ScoutLens } from "../proposal.ts";
import { describeRotationAxis, type RotationAxis } from "./axes.ts";
import type { CommitSummary } from "./git.ts";
import type { VerificationFileEntry } from "./repo-paths.ts";
import type { LensCursor } from "./state.ts";
import type { StructuralTelemetry } from "./telemetry.ts";

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
    ...(rotationAxis ? { rotationAxis: describeRotationAxis(rotationAxis) } : {}),
    ...(telemetry ? { telemetry } : {}),
    unreadVerifications,
    openIssues,
    wontfixIssues,
  };
};
