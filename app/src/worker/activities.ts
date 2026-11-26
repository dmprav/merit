import type { Database } from "@merit/db";
import {
  createReviewerMessageActivities,
  listPendingReviewerMessageWork,
  type ReviewerMessageActivityDependencies,
  type ReviewerMessageWork,
} from "@merit/reviews/server";
import type { StartOutcome } from "@merit/workflows";

/** Activities run in the worker process with full Node.js access, outside the workflow sandbox. */

export const confirmWorkerHealth = async (probeId: string) => {
  void probeId;
  return "ok" as const;
};

export type WorkerActivityDependencies = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  reviewerMessages: ReviewerMessageActivityDependencies;
  /** Starts a reviewer message's workflow unless one ran or runs; the outcome says which. */
  reconcileReviewerMessage: (work: ReviewerMessageWork) => Promise<StartOutcome>;
};

const reconcilePage = 100;

/**
 * Walk committed unfinished reviewer messages and start the workflow of each that has none.
 * It returns counts only; the workflows read everything else from Postgres under current access.
 */
const reconcileReviewerMessages = async ({
  database,
  reconcileReviewerMessage,
}: Pick<WorkerActivityDependencies, "database" | "reconcileReviewerMessage">) => {
  let after: string | undefined;
  let listed = 0;
  let started = 0;
  for (;;) {
    const page = await listPendingReviewerMessageWork(database, reconcilePage, after);
    for (const work of page) {
      listed += 1;
      if ((await reconcileReviewerMessage(work)) === "started") {
        started += 1;
      }
    }
    const last = page.at(-1);
    if (!last || page.length < reconcilePage) {
      return { listed, started };
    }
    after = last.messageId;
  }
};

export const createActivities = (dependencies: WorkerActivityDependencies) => ({
  confirmWorkerHealth,
  ...createReviewerMessageActivities(dependencies.reviewerMessages),
  reconcileReviewerMessages: () => reconcileReviewerMessages(dependencies),
});

export type Activities = ReturnType<typeof createActivities>;

/** The reconcilers the reconcile workflow runs; Merit AI turns join them later. */
export type ReconcileActivities = Pick<Activities, "reconcileReviewerMessages">;
