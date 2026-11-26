import type { Database } from "@merit/db";
import { assignmentScope, readScoped } from "@merit/organizations/transactions";
import { waitForOutcome, type OutcomeWait } from "@merit/workflows/outcome";

import type { ReviewerMessage } from "../../api/reviewer";
import {
  finishReviewerMessage,
  resetFailedReviewerMessage,
} from "../persistence/commands/reviewer";
import {
  latestReviewerMessage,
  listPendingReviewerMessages,
  readReviewerRecord,
} from "../persistence/reviewer-records";

/** The committed message a ticket names; the assistant saves one before it sends. */
export type ReviewerDelivery = {
  assignmentId: string;
  kind: ReviewerMessage["kind"];
  messageId: string;
};

/**
 * What the delivery workflow receives: identifiers only. `userId` is the member whose access
 * the activities act under; they recheck it, and everything else, on every attempt.
 */
export type ReviewerMessageWork = ReviewerDelivery & { userId: string };

/** Durations in milliseconds. Tests inject short ones through the workflow input. */
export type ReviewerMessageTiming = {
  /** Each send attempt. */
  attemptTimeoutMs: number;
  /** Automatic attempts stop this long after the first. */
  windowMs: number;
  initialIntervalMs: number;
  maximumIntervalMs: number;
};

/** What the workflow starts with: identifiers and timings only. */
export type ReviewerMessageInput = ReviewerMessageWork & {
  timing?: Partial<ReviewerMessageTiming>;
};

/** The workflow ID of a reviewer message: starting the same message twice cannot duplicate it. */
export const reviewerMessageWorkflowId = (messageId: string) => `reviewer-message:${messageId}`;

type Status = "pending" | "sent" | "failed";

/** What one delivery attempt needs to send and record the message. */
export type ReviewerMessageActivityDependencies = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  send: (message: ReviewerMessage) => Promise<void>;
  reviewerUrl: (slug: string, id: string) => string;
  managerUrl: (slug: string, applicationId: string) => string;
};

export type ReviewerDeliveryDependencies = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  /**
   * Start the delivery workflow for a committed message, again if its last run closed: a manual
   * retry of a failed message runs under the same ID. Starting what already runs is a no-op, and
   * a failure to start is reported by the implementation and never thrown: the commit stands and
   * reconciliation starts the work later. It answers whether the work runs or ran, so a request
   * does not wait for a workflow that never started.
   */
  start: (work: ReviewerMessageWork) => Promise<boolean>;
  /** How long a request waits for the first outcome. Tests inject short durations. */
  wait?: OutcomeWait;
  /** A caller committing other state with the grant saves this ticket before delivering. */
  deferDelivery?: (delivery: ReviewerDelivery) => void;
  /** Reports a failed outcome read after the commit; the request still answers. */
  onOutcomeError?: () => void;
};

/** The records a delivery decision reads, under the acting member's current access. */
const readDelivery = (
  database: ReviewerDeliveryDependencies["database"],
  userId: string,
  assignmentId: string,
  kind: ReviewerMessage["kind"],
  workspaceSlug?: string,
) =>
  database((db) =>
    readScoped(db, assignmentScope(userId, assignmentId, workspaceSlug), async (tx) => ({
      record: await readReviewerRecord(tx, assignmentId),
      message: await latestReviewerMessage(tx, assignmentId, kind),
    })),
  );

type Delivery = Awaited<ReturnType<typeof readDelivery>>;

/** Whether this message can still be delivered, and what that decision rests on. */
const deliverable = ({ record, message }: Delivery, kind: ReviewerMessage["kind"]) => {
  if (!record || !message) {
    return undefined;
  }
  if (
    kind === "invitation" &&
    message.status !== "sent" &&
    (record.assignment.status !== "invited" || record.assignment.expiresAt <= new Date())
  ) {
    return undefined;
  }
  return { record, message };
};

/**
 * Deliver the latest message of a kind after its record committed: start the workflow that
 * sends it, then wait briefly for the first outcome. The result is what the request can say
 * now; `pending` means the workflow is still retrying or Temporal has not yet started it.
 */
export const deliverReviewerMessage = async (
  dependencies: ReviewerDeliveryDependencies,
  userId: string,
  id: string,
  kind: ReviewerMessage["kind"],
  {
    workspaceSlug,
    submissionCommandId,
  }: {
    workspaceSlug?: string;
    submissionCommandId?: string;
  } = {},
): Promise<"sent" | "failed" | "unavailable" | "pending"> => {
  const current = await readDelivery(dependencies.database, userId, id, kind, workspaceSlug);
  const found = deliverable(current, kind);
  if (!found) {
    return "unavailable";
  }
  const { message } = found;
  if (message.status === "sent") {
    return "sent";
  }
  if (
    submissionCommandId &&
    (message.id !== submissionCommandId.toLowerCase() || message.status !== "pending")
  ) {
    return "unavailable";
  }
  if (dependencies.deferDelivery) {
    dependencies.deferDelivery({ assignmentId: id, kind, messageId: message.id });
    return "pending";
  }
  const started = await dependencies.start({
    assignmentId: id,
    kind,
    messageId: message.id,
    userId,
  });
  if (!started) {
    return message.status === "failed" ? "failed" : "pending";
  }

  // A failed message is retried in place, so only a send counts as the new outcome.
  const settled = (status: Status) =>
    message.status === "failed" ? status === "sent" : status !== "pending";

  // The message is committed and the workflow delivers it: a failing read must not fail the request.
  const outcome = await waitForOutcome(async () => {
    const latest = await readDelivery(dependencies.database, userId, id, kind, workspaceSlug);
    if (!deliverable(latest, kind) || latest.message?.id !== message.id) {
      return "unavailable" as const;
    }
    return settled(latest.message.status) ? latest.message.status : undefined;
  }, dependencies.wait).catch(() => {
    dependencies.onOutcomeError?.();
  });
  return outcome ?? (message.status === "failed" ? "failed" : "pending");
};

/**
 * Where the exact committed message the assistant saved stands now, without waiting: the
 * assistant keeps its action `delivering` and asks again on a later step until the message is
 * `sent` or `failed`. A message still pending gets its workflow started, again if its last run
 * closed; one already recorded as `sent` or `failed` is never started, so a crash cannot send it
 * twice or retry it behind the assistant's own retry action. A newer message needs its own
 * approval.
 */
export const deliverCommittedReviewerMessage = async (
  dependencies: Pick<ReviewerDeliveryDependencies, "database" | "start">,
  userId: string,
  delivery: ReviewerDelivery,
): Promise<"sent" | "failed" | "unavailable" | "pending"> => {
  const current = await readDelivery(
    dependencies.database,
    userId,
    delivery.assignmentId,
    delivery.kind,
  );
  const found = deliverable(current, delivery.kind);
  if (!found || found.message.id !== delivery.messageId) {
    return "unavailable";
  }
  if (found.message.status !== "pending") {
    return found.message.status;
  }
  await dependencies.start({ ...delivery, userId });
  return "pending";
};

/**
 * One delivery attempt, run by the workflow's send activity. Everything is read again under the
 * member's current access, so a revoked invitation, a newer message, a lost membership or an
 * earlier success stops the work. A send failure throws, so the activity retries with backoff.
 */
const sendReviewerMessage = async (
  dependencies: ReviewerMessageActivityDependencies,
  work: ReviewerMessageWork,
): Promise<"sent" | "stopped"> => {
  const current = await readDelivery(
    dependencies.database,
    work.userId,
    work.assignmentId,
    work.kind,
  );
  const found = deliverable(current, work.kind);
  if (!found || found.message.id !== work.messageId) {
    return "stopped";
  }
  const { record, message } = found;
  if (message.status !== "pending") {
    // A failed message is retried by resetting it to pending first, so a run that finds it failed
    // or sent has nothing to send; a late or restarted run can never resend it behind a retry.
    return message.status === "sent" ? "sent" : "stopped";
  }
  await dependencies.send({
    id: message.id,
    to: message.recipient,
    kind: message.kind,
    organization: record.organization,
    title: record.title,
    applicant: record.applicant,
    reviewer: record.reviewer,
    manager: record.assignment.managerName,
    managerEmail: record.assignment.managerEmail,
    dueDate: record.assignment.dueDate,
    url:
      message.kind === "invitation"
        ? dependencies.reviewerUrl(record.slug, work.assignmentId)
        : dependencies.managerUrl(record.slug, record.assignment.caseId),
  });
  await dependencies.database((db) =>
    finishReviewerMessage(db, message.id, message.deliveryToken, "sent"),
  );
  return "sent";
};

/** Record the final failure after the retry window, unless the message was sent or replaced. */
const failReviewerMessage = async (
  dependencies: Pick<ReviewerMessageActivityDependencies, "database">,
  work: ReviewerMessageWork,
): Promise<"failed" | "sent" | "stopped"> => {
  const current = await readDelivery(
    dependencies.database,
    work.userId,
    work.assignmentId,
    work.kind,
  );
  const message = current.message;
  if (!current.record || !message || message.id !== work.messageId) {
    return "stopped";
  }
  if (message.status === "sent") {
    return "sent";
  }
  await dependencies.database((db) =>
    finishReviewerMessage(db, message.id, message.deliveryToken, "failed"),
  );
  return "failed";
};

/**
 * The assistant's retry of a failed message it saved, in the retry's own transaction: the message
 * goes back to `pending` with a fresh delivery token, under the same ID, so its workflow delivers
 * it again. Nothing else makes a failed message deliverable.
 */
export const retryReviewerDelivery = async (db: Database, delivery: ReviewerDelivery) =>
  resetFailedReviewerMessage(db, delivery.messageId);

/** Whether a manager retried the message after its failure was recorded: it is pending again. */
const reviewerMessageRetried = async (
  dependencies: Pick<ReviewerMessageActivityDependencies, "database">,
  work: ReviewerMessageWork,
): Promise<boolean> => {
  const current = await readDelivery(
    dependencies.database,
    work.userId,
    work.assignmentId,
    work.kind,
  );
  const found = deliverable(current, work.kind);
  return found?.message.id === work.messageId && found.message.status === "pending";
};

/** The activities the delivery workflow calls, bound to a database and an email sender. */
export const createReviewerMessageActivities = (
  dependencies: ReviewerMessageActivityDependencies,
) => ({
  sendReviewerMessage: (work: ReviewerMessageWork) => sendReviewerMessage(dependencies, work),
  failReviewerMessage: (work: ReviewerMessageWork) => failReviewerMessage(dependencies, work),
  reviewerMessageRetried: (work: ReviewerMessageWork) => reviewerMessageRetried(dependencies, work),
});

export type ReviewerMessageActivities = ReturnType<typeof createReviewerMessageActivities>;

/**
 * Committed messages that still await delivery, across workspaces, as workflow input. Reconciliation
 * restarts a workflow for each page, so a message whose earlier run completed is delivered again
 * (each run rechecks the message and sends nothing for one already sent); one that runs is left alone.
 */
export const listPendingReviewerMessageWork = async (
  database: ReviewerDeliveryDependencies["database"],
  limit: number,
  after?: string,
): Promise<ReviewerMessageWork[]> =>
  (await database((db) => listPendingReviewerMessages(db, limit, after))).map(
    ({ messageId, assignmentId, kind, userId }) => ({ messageId, assignmentId, kind, userId }),
  );
