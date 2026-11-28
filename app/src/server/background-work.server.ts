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

import { assistantTurnTaskQueue, taskQueue as applicationTaskQueue } from "../worker/task-queue";
import {
  assistantConversationWorkflowId,
  assistantCancelSignal,
  assistantWakeSignal,
  type AssistantConversationInput,
  type AssistantWork,
} from "./assistant/conversation-work";

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
  /** The queue of Merit AI turn activities. Tests use a queue of their own. */
  turnTaskQueue?: string;
  /** Shorter Merit AI pacing than production; tests inject it. */
  assistantTiming?: AssistantConversationInput["timing"];
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
  turnTaskQueue = assistantTurnTaskQueue,
  assistantTiming,
}: BackgroundWorkOptions) => {
  const starter = createWorkflowStarter({ client, taskQueue, report: reportFailedStart });

  /**
   * `restart` lets a closed run start anew: each run rechecks the message and sends nothing for
   * one already sent, so a pending message is never left behind by a run that completed.
   */
  const startReviewerMessageWorkflow = (work: ReviewerMessageWork) =>
    starter.start({
      workflowType: "reviewerMessage",
      workflowId: reviewerMessageWorkflowId(work.messageId),
      args: [reviewerMessageTiming ? { ...work, timing: reviewerMessageTiming } : work],
      operation: "reviewerMessage.start",
      closed: "restart",
    });

  return {
    /** Requests and reconciliation hand the same invitation to its delivery workflow. */
    startOrganizationInvitation: async (work: InvitationWork): Promise<boolean> =>
      (await starter.start({
        workflowType: "organizationInvitation",
        workflowId: organizationInvitationWorkflowId(work.invitationId),
        args: [invitationTiming ? { ...work, timing: invitationTiming } : work],
        operation: "organizationInvitation.start",
      })) !== "failed",
    /**
     * A request or the assistant delivers a committed message. A message retried by hand runs
     * again under its ID.
     */
    startReviewerMessage: async (work: ReviewerMessageWork): Promise<boolean> =>
      (await startReviewerMessageWorkflow(work)) !== "failed",
    /**
     * Tells a Merit AI conversation's workflow to look at its conversation again, starting the
     * workflow when it has none (signal-with-start, so a start never races a finishing run).
     * Requests and reconciliation both use it; the answer is false only when Temporal failed.
     */
    wakeAssistantConversation: async (work: AssistantWork): Promise<boolean> =>
      (await starter.start({
        workflowType: "assistantConversation",
        workflowId: assistantConversationWorkflowId(work.conversationId),
        args: [
          {
            ...work,
            turnTaskQueue,
            ...(assistantTiming ? { timing: assistantTiming } : {}),
          } satisfies AssistantConversationInput,
        ],
        operation: "assistantConversation.wake",
        closed: "restart",
        signal: { name: assistantWakeSignal },
      })) !== "failed",
    /**
     * Cancels the step a conversation's workflow runs, so a stopped or deleted conversation or
     * withdrawn consent aborts the model request the worker holds. A plain signal: it never
     * starts a workflow, and a conversation without a running one has nothing to cancel.
     */
    cancelAssistantTurn: async (conversationId: string): Promise<void> => {
      await starter.signal({
        workflowId: assistantConversationWorkflowId(conversationId),
        signal: assistantCancelSignal,
        operation: "assistantConversation.cancel",
      });
    },
    /** Reconciliation starts a run for every pending message that has none open. */
    reconcileReviewerMessage: (work: ReviewerMessageWork): Promise<StartOutcome> =>
      startReviewerMessageWorkflow(work),
  };
};
