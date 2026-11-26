import type { WorkspaceChangeObserver } from "@merit/organizations/domain";

import {
  createReviewerMessageActivities,
  type ReviewerMessageActivityDependencies,
  type ReviewerMessageWork,
} from "./commands/reviewer-delivery";
import { createReviewerService } from "./service";

/**
 * A stand-in for the delivery workflow in business tests, which exercise delivery rules
 * without a Temporal server: it runs one attempt in the caller and records `failed` when
 * the send throws, as the workflow does once its retries end. Production never uses it.
 */
export const inlineReviewerDelivery = (dependencies: ReviewerMessageActivityDependencies) => {
  const activities = createReviewerMessageActivities(dependencies);
  return async (work: ReviewerMessageWork) => {
    try {
      await activities.sendReviewerMessage(work);
    } catch {
      await activities.failReviewerMessage(work);
    }
    return true;
  };
};

/** The reviewer service with delivery attempted in the caller, so tests read the outcome at once. */
export const createInlineReviewerService = (
  dependencies: ReviewerMessageActivityDependencies & { onSubmitted?: WorkspaceChangeObserver },
) =>
  createReviewerService({
    database: dependencies.database,
    start: inlineReviewerDelivery(dependencies),
    wait: { timeoutMs: 0, intervalMs: 0 },
    ...(dependencies.onSubmitted ? { onSubmitted: dependencies.onSubmitted } : {}),
  });
