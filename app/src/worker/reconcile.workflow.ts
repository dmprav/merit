import { proxyActivities } from "@temporalio/workflow";

import type { ReconcileActivities } from "./activities.ts";

/**
 * Start or signal the workflow of every committed piece of unfinished work that has none.
 * Postgres lists the work and each start is idempotent, so a run that overlaps another, repeats,
 * or finds nothing to do changes nothing.
 *
 * Add a reconciler by adding its activity to {@link ReconcileActivities} and its name here.
 * Each runs independently: one failing does not keep the others from running.
 */
export const reconcile = async () => {
  const activities = proxyActivities<ReconcileActivities>({
    startToCloseTimeout: "2 minutes",
    retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
  });
  const reconcilers = {
    reviewerMessages: activities.reconcileReviewerMessages,
    conversations: activities.reconcileConversations,
  };
  const results: Record<string, "ok" | "failed"> = {};
  for (const [name, run] of Object.entries(reconcilers)) {
    results[name] = await run().then(
      () => "ok" as const,
      () => "failed" as const,
    );
  }
  return results;
};
