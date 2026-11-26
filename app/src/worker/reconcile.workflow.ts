/** The Schedule that starts reconciliation, and the workflow it runs. */
export const reconcileScheduleId = "merit-reconcile";

/**
 * Start or signal the workflow of every committed piece of unfinished work that has none.
 * Postgres lists the work and each start is idempotent, so a run that overlaps another, repeats,
 * or finds nothing to do changes nothing.
 *
 * Add a reconciler by adding its activity to the activities module and registering it here under
 * a name. Each runs independently: one failing does not keep the others from running.
 */
export const reconcile = async () => {
  const reconcilers: Record<string, () => Promise<unknown>> = {};
  const results: Record<string, "ok" | "failed"> = {};
  for (const [name, run] of Object.entries(reconcilers)) {
    results[name] = await run().then(
      () => "ok" as const,
      () => "failed" as const,
    );
  }
  return results;
};
