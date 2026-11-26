import { isCancellation, proxyActivities } from "@temporalio/workflow";

import type {
  InvitationActivities,
  InvitationDeliveryInput,
  InvitationDeliveryTiming,
} from "./commands/delivery.ts";

const defaultTiming: InvitationDeliveryTiming = {
  attemptTimeoutMs: 10_000,
  windowMs: 15 * 60_000,
  initialIntervalMs: 5000,
  maximumIntervalMs: 120_000,
};

/**
 * Deliver one organization invitation email. The invitation stays `pending` while the send
 * activity retries with backoff for about 15 minutes; after the final failure the outcome is
 * recorded as `failed`. Every attempt rereads the invitation, so the workflow ends quietly once
 * it is revoked, accepted, expired or replaced. The input holds identifiers, timings and the raw
 * invitation token, which the payload codec encrypts; nothing else carries it.
 */
export const organizationInvitation = async ({ timing, ...work }: InvitationDeliveryInput) => {
  const wanted = { ...defaultTiming, ...timing };
  const { sendOrganizationInvitation } = proxyActivities<InvitationActivities>({
    startToCloseTimeout: wanted.attemptTimeoutMs,
    scheduleToCloseTimeout: wanted.windowMs,
    retry: {
      initialInterval: wanted.initialIntervalMs,
      backoffCoefficient: 2,
      maximumInterval: wanted.maximumIntervalMs,
    },
  });
  const { failOrganizationInvitation } = proxyActivities<InvitationActivities>({
    startToCloseTimeout: "10 seconds",
    retry: { initialInterval: "1 second", maximumInterval: "30 seconds", maximumAttempts: 8 },
  });
  try {
    return await sendOrganizationInvitation(work);
  } catch (error) {
    if (isCancellation(error)) {
      throw error;
    }
  }
  return failOrganizationInvitation(work);
};
