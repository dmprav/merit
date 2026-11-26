import {
  createInvitationActivities,
  type InvitationActivityDependencies,
} from "./commands/delivery";
import type { Dependencies, InvitationWork } from "./dependencies";
import { createOrganizationService } from "./service";

/**
 * A stand-in for the delivery workflow in business tests, which exercise invitation rules
 * without a Temporal server: it runs one attempt in the caller and records `failed` when
 * the send throws, as the workflow does once its retries end, and leaves the invitation pending
 * when recording fails. Production never uses it.
 */
export const inlineInvitationDelivery = (dependencies: InvitationActivityDependencies) => {
  const activities = createInvitationActivities(dependencies);
  return async (work: InvitationWork) => {
    try {
      await activities.sendOrganizationInvitation(work);
    } catch {
      // The workflow fails when even the failure cannot be recorded; the invitation stays pending.
      await activities.failOrganizationInvitation(work).catch(() => undefined);
    }
    return true;
  };
};

/** The organization service with delivery attempted in the caller, so tests read the outcome at once. */
export const createInlineOrganizationService = (
  dependencies: Omit<Dependencies, "start" | "wait" | "invitationKey"> &
    InvitationActivityDependencies,
) =>
  createOrganizationService({
    ...dependencies,
    invitationKey: () => new Uint8Array(32),
    start: inlineInvitationDelivery(dependencies),
    wait: { timeoutMs: 0, intervalMs: 0 },
  });
