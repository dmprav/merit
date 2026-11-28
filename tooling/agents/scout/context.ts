import { classifyChangedPaths } from "../../verification/architecture/mechanisms.ts";
import type { CommitSummary } from "./git.ts";
import type { VerificationFileEntry } from "./repo-paths.ts";
import { CONCERNS_BY_KIND, describeRunTarget, type ScoutRunTarget } from "./runs.ts";
import type { RunCursor } from "./state.ts";
import type { StructuralTelemetry } from "./telemetry.ts";
import type { OpenIssueSummary, WontfixIssueSummary } from "./tracked-issues.ts";

/** The run a scout session audits, with the cursor it resumes from. */
export type ScoutRun = {
  id: string;
  target: ScoutRunTarget;
  cursor: RunCursor | undefined;
  scanTipSha: string;
};

/** What a ready run read for its target since the cursor. */
export type ScoutScan = {
  commits: readonly CommitSummary[];
  changedFiles: readonly string[];
  telemetry: StructuralTelemetry | null;
  /** Present only for the `records` run. */
  unreadVerifications: readonly VerificationFileEntry[] | null;
  openIssues: readonly OpenIssueSummary[];
  wontfixIssues: readonly WontfixIssueSummary[];
};

export const buildScoutContext = (
  { id, target, cursor, scanTipSha }: ScoutRun,
  { commits, changedFiles, telemetry, unreadVerifications, openIssues, wontfixIssues }: ScoutScan,
) => ({
  status: "ready" as const,
  run: { id, kind: target.kind, target: describeRunTarget(target) },
  scanTipSha,
  cursor: cursor ?? null,
  commits,
  changedFiles,
  matchedMechanisms: classifyChangedPaths({ paths: changedFiles }),
  concerns: CONCERNS_BY_KIND[target.kind],
  ...(telemetry ? { telemetry } : {}),
  ...(unreadVerifications ? { unreadVerifications } : {}),
  openIssues,
  wontfixIssues,
});

export type ScoutContext = ReturnType<typeof buildScoutContext>;
