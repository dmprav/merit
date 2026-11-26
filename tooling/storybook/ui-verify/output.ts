import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { acquireFileLock, FileLockBusyError } from "../../agents/file-lock.ts";
import { writeProofArtifacts } from "./report.ts";
import {
  summarizeResults,
  type RunMode,
  type TargetCheckResult,
  type UiVerifyResults,
} from "./results.ts";
import { screenshotFileFor, type AppMode, type ViewportName } from "./targets.ts";

const OUTPUT_LOCK_FILE = ".ui-verify.lock";

/** Where a run publishes and how its report describes it, which planning cannot fail to decide. */
export type RunReport = {
  mode: RunMode;
  outDir: string;
  updated: boolean;
};

/** What a run found, including the targets it checked before any failure stopped it. */
export type RunOutcome = {
  targets: TargetCheckResult[];
  appMode?: AppMode;
  containerExitCode?: number;
  error?: string;
};

/**
 * Gives this run exclusive use of `outDir` until the returned release runs, so concurrent runs
 * cannot delete or replace each other's screenshots before their reports are published. A run
 * fails at once while another live run holds the lock, since waiting for a run gains nothing; a
 * lock whose run has exited, or that names no owner, is reclaimed.
 */
export const acquireOutputLock = async (outDir: string): Promise<() => void> => {
  try {
    return await acquireFileLock(join(outDir, OUTPUT_LOCK_FILE), {
      label: "ui:verify output",
      timeoutMs: 0,
    });
  } catch (error) {
    if (!(error instanceof FileLockBusyError)) {
      throw error;
    }
    const holder = error.holderPid === undefined ? "" : ` (pid ${error.holderPid})`;
    throw new Error(
      `Another ui:verify run${holder} is writing to "${outDir}". Wait for it to finish or pass a different --out directory.`,
      { cause: error },
    );
  }
};

/**
 * Creates the screenshots directory. With `--update`, first deletes the screenshots of only this
 * run's targets and viewports, so an aborted run leaves none of their old screenshots behind
 * while other targets' evidence stays.
 */
export const prepareScreenshotsDir = (
  screenshotsDir: string,
  {
    update,
    stems,
    viewports,
  }: { update: boolean; stems: readonly string[]; viewports: readonly ViewportName[] },
): void => {
  if (update) {
    for (const stem of stems) {
      for (const viewport of viewports) {
        rmSync(screenshotFileFor(screenshotsDir, stem, viewport), { force: true });
      }
    }
  }
  mkdirSync(screenshotsDir, { recursive: true });
};

/** Summarizes the run and writes its `results.json` and `report.md`. */
export const publishResults = (report: RunReport, outcome: RunOutcome): UiVerifyResults => {
  const results = summarizeResults({ ...report, ...outcome });
  writeProofArtifacts(report.outDir, results);
  return results;
};
