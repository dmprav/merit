import { isCancellation, proxyActivities } from "@temporalio/workflow";

import type {
  ReviewerMessageActivities,
  ReviewerMessageInput,
  ReviewerMessageTiming,
} from "./commands/reviewer-delivery.ts";

const defaultTiming: ReviewerMessageTiming = {
  attemptTimeoutMs: 10_000,
  windowMs: 15 * 60_000,
  initialIntervalMs: 5000,
  maximumIntervalMs: 120_000,
};

/**
 * Deliver one reviewer invitation or submission email. The message stays `pending` while the
 * send activity retries with backoff for about 15 minutes; after the final failure the
 * outcome is recorded as `failed`. Every attempt rechecks the message, its assignment and the
 * member's access, so the workflow ends quietly once the message is no longer current.
 * The input holds identifiers and timings only.
 */
export const reviewerMessage = async ({ timing, ...work }: ReviewerMessageInput) => {
  const wanted = { ...defaultTiming, ...timing };
  const { sendReviewerMessage } = proxyActivities<ReviewerMessageActivities>({
    startToCloseTimeout: wanted.attemptTimeoutMs,
    scheduleToCloseTimeout: wanted.windowMs,
    retry: {
      initialInterval: wanted.initialIntervalMs,
      backoffCoefficient: 2,
      maximumInterval: wanted.maximumIntervalMs,
    },
  });
  const { failReviewerMessage } = proxyActivities<ReviewerMessageActivities>({
    startToCloseTimeout: "10 seconds",
    retry: { initialInterval: "1 second", maximumInterval: "30 seconds", maximumAttempts: 8 },
  });
  try {
    return await sendReviewerMessage(work);
  } catch (error) {
    if (isCancellation(error)) {
      throw error;
    }
  }
  return failReviewerMessage(work);
};
