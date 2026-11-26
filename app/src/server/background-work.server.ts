import {
  organizationInvitationWorkflowId,
  type InvitationDeliveryInput,
  type InvitationWork,
} from "@merit/organizations/server";
import {
  reviewerMessageWorkflowId,
  type ReviewerMessageInput,
  type ReviewerMessageWork,
} from "@merit/reviews/server";
import { reportError } from "@merit/telemetry/errors";
import {
  createWorkflowStarter,
  type StartOutcome,
  type WorkflowClient,
} from "@merit/workflows/client";

import { taskQueue as applicationTaskQueue } from "../worker/task-queue";

/** Telemetry sees only the operation name: the cause of a failed start can carry payload details. */
const reportFailedStart = (operation: string) =>
  reportError(new Error("Background work could not be started."), {
    surface: "server",
    operation,
  });

export type BackgroundWorkOptions = {
  /** Read on each start, so missing Temporal settings surface as a reported start failure. */
  client: () => WorkflowClient;
  /** The queue the worker polls. Tests use a queue of their own. */
  taskQueue?: string;
  /** Shorter delivery timings than the 15-minute window; tests inject them. */
  reviewerMessageTiming?: ReviewerMessageInput["timing"];
  /** Shorter invitation delivery timings than the 15-minute window; tests inject them. */
  invitationTiming?: InvitationDeliveryInput["timing"];
};

/**
 * Starts Merit's background work after a business change commits, from the web server and
 * from the worker's reconciliation. Every start has a workflow ID derived from the committed
 * record, is a no-op when that work already exists, and reports a failure instead of throwing,
 * so a committed request never fails because Temporal did.
 */
export const createBackgroundWork = ({
  client,
  taskQueue = applicationTaskQueue,
  reviewerMessageTiming,
  invitationTiming,
}: BackgroundWorkOptions) => {
  const starter = createWorkflowStarter({ client, taskQueue, report: reportFailedStart });

  const startReviewerMessageWorkflow = (work: ReviewerMessageWork, closed: "keep" | "restart") =>
    starter.start({
      workflowType: "reviewerMessage",
      workflowId: reviewerMessageWorkflowId(work.messageId),
      args: [reviewerMessageTiming ? { ...work, timing: reviewerMessageTiming } : work],
      operation: "reviewerMessage.start",
      closed,
    });

  return {
    /**
     * A request delivers a committed organization invitation. Nothing reconciles these: only the
     * token's hash is stored, so a start that failed leaves the invitation pending and the
     * administrator resends it.
     */
    startOrganizationInvitation: async (work: InvitationWork): Promise<boolean> =>
      (await starter.start({
        workflowType: "organizationInvitation",
        workflowId: organizationInvitationWorkflowId(work.invitationId),
        args: [invitationTiming ? { ...work, timing: invitationTiming } : work],
        operation: "organizationInvitation.start",
      })) !== "failed",
    /**
     * A request or the assistant delivers a committed message. A failed message retried by hand
     * runs again under its ID, so `restart` lets a closed run start anew.
     */
    startReviewerMessage: async (work: ReviewerMessageWork): Promise<boolean> =>
      (await startReviewerMessageWorkflow(work, "restart")) !== "failed",
    /** Reconciliation starts only what never ran or failed; completed work stays as it is. */
    reconcileReviewerMessage: (work: ReviewerMessageWork): Promise<StartOutcome> =>
      startReviewerMessageWorkflow(work, "keep"),
  };
};
