import type { Database } from "@merit/db";
import {
  createInvitationActivities,
  reconcileOrganizationInvitations,
  type InvitationActivityDependencies,
} from "@merit/organizations/server";
import {
  createReviewerMessageActivities,
  listPendingReviewerMessageWork,
  type ReviewerMessageActivityDependencies,
  type ReviewerMessageWork,
} from "@merit/reviews/server";
import type { StartOutcome } from "@merit/workflows";

import type { AssistantWork } from "../server/assistant/conversation-work";
import { reported } from "./reported";

/** Activities run in the worker process with full Node.js access, outside the workflow sandbox. */

export const confirmWorkerHealth = async (probeId: string) => {
  void probeId;
  return "ok" as const;
};

export type WorkerActivityDependencies = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  reviewerMessages: ReviewerMessageActivityDependencies;
  invitations: InvitationActivityDependencies;
  /** Starts a reviewer message's workflow unless one ran or runs; the outcome says which. */
  reconcileReviewerMessage: (work: ReviewerMessageWork) => Promise<StartOutcome>;
  invitationDispatch: Pick<
    Parameters<typeof reconcileOrganizationInvitations>[0],
    "invitationKey" | "start"
  >;
  assistant: {
    /** False when no model is configured: nothing is started. */
    configured: boolean;
    /** The privileged read of running conversations across workspaces, in pages by conversation ID. */
    running: (
      limit: number,
      after?: string,
    ) => Promise<Array<{ userId: string; workspaceSlug: string; id: string }>>;
    /** Wakes a conversation's workflow, starting it when it has none; false when that failed. */
    wake: (work: AssistantWork) => Promise<boolean>;
  };
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

/**
 * Wake the workflow of every running conversation: signal the one that runs, start the one a
 * crash or an outage left without. It returns counts only; the workflow reads the rest from
 * Postgres under the owner's current access.
 */
const reconcileConversations = async ({
  assistant,
}: Pick<WorkerActivityDependencies, "assistant">) => {
  if (!assistant.configured) {
    return { listed: 0, started: 0 };
  }
  let after: string | undefined;
  let listed = 0;
  let started = 0;
  for (;;) {
    const page = await assistant.running(reconcilePage, after);
    for (const { userId, workspaceSlug, id } of page) {
      listed += 1;
      if (await assistant.wake({ userId, workspaceSlug, conversationId: id })) {
        started += 1;
      }
    }
    const last = page.at(-1);
    if (!last || page.length < reconcilePage) {
      return { listed, started };
    }
    after = last.id;
  }
};

export const createActivities = (dependencies: WorkerActivityDependencies) => {
  const reviewerMessages = createReviewerMessageActivities(dependencies.reviewerMessages);
  const invitations = createInvitationActivities(dependencies.invitations);
  return {
    confirmWorkerHealth,
    // A send failure is reported by the email sender and retried; recording an outcome is not.
    ...reviewerMessages,
    failReviewerMessage: reported("reviewerMessage.fail", reviewerMessages.failReviewerMessage),
    reviewerMessageRetried: reported(
      "reviewerMessage.retried",
      reviewerMessages.reviewerMessageRetried,
    ),
    ...invitations,
    failOrganizationInvitation: reported(
      "organizationInvitation.fail",
      invitations.failOrganizationInvitation,
    ),
    reconcileOrganizationInvitations: reported("reconcile.organizationInvitations", () =>
      reconcileOrganizationInvitations({
        database: dependencies.database,
        ...dependencies.invitationDispatch,
      }),
    ),
    reconcileReviewerMessages: reported("reconcile.reviewerMessages", () =>
      reconcileReviewerMessages(dependencies),
    ),
    reconcileConversations: reported("reconcile.conversations", () =>
      reconcileConversations(dependencies),
    ),
  };
};

export type Activities = ReturnType<typeof createActivities>;

/** The reconcilers the reconcile workflow runs. */
export type ReconcileActivities = Pick<
  Activities,
  "reconcileReviewerMessages" | "reconcileConversations" | "reconcileOrganizationInvitations"
>;
