import type { Database } from "@merit/db";
import { assignmentScope, readScoped } from "@merit/organizations/transactions";

import type { ReviewerMessage } from "../../api/reviewer";
import { finishReviewerMessage } from "../persistence/commands/reviewer";
import { latestReviewerMessage, readReviewerRecord } from "../persistence/reviewer-records";

export type ReviewerDelivery = {
  assignmentId: string;
  kind: ReviewerMessage["kind"];
  messageId: string;
};

export type ReviewerDeliveryDependencies = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  send: (message: ReviewerMessage) => Promise<void>;
  reviewerUrl: (slug: string, id: string) => string;
  managerUrl: (slug: string, applicationId: string) => string;
  /** A caller committing other state with the grant saves this ticket before sending. */
  deferDelivery?: (delivery: ReviewerDelivery) => void;
};

export const deliverReviewerMessage = async (
  dependencies: ReviewerDeliveryDependencies,
  userId: string,
  id: string,
  kind: ReviewerMessage["kind"],
  {
    workspaceSlug,
    submissionCommandId,
    expectedMessageId,
  }: {
    workspaceSlug?: string;
    submissionCommandId?: string;
    expectedMessageId?: string;
  } = {},
): Promise<"sent" | "failed" | "unavailable" | "pending"> => {
  const scope = assignmentScope(userId, id, workspaceSlug);
  const data = await dependencies.database((db) =>
    readScoped(db, scope, async (tx) => ({
      record: await readReviewerRecord(tx, id),
      message: await latestReviewerMessage(tx, id, kind),
    })),
  );
  const { record, message } = data;
  if (!record || !message || (expectedMessageId && message.id !== expectedMessageId)) {
    return "unavailable";
  }
  if (message.status === "sent") {
    return "sent";
  }
  if (
    submissionCommandId &&
    (message.id !== submissionCommandId.toLowerCase() || message.status !== "pending")
  ) {
    return "unavailable";
  }
  if (
    kind === "invitation" &&
    (record.assignment.status !== "invited" || record.assignment.expiresAt <= new Date())
  ) {
    return "unavailable";
  }
  if (dependencies.deferDelivery) {
    dependencies.deferDelivery({ assignmentId: id, kind, messageId: message.id });
    return "pending";
  }
  let status: "sent" | "failed";
  try {
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
          ? dependencies.reviewerUrl(record.slug, id)
          : dependencies.managerUrl(record.slug, record.assignment.caseId),
    });
    status = "sent";
  } catch {
    status = "failed";
  }
  await dependencies.database((db) =>
    finishReviewerMessage(db, message.id, message.deliveryToken, status),
  );
  return status;
};

/** Deliver only the exact committed message. A newer invitation needs its own approval. */
export const sendCommittedReviewerMessage = async (
  dependencies: Omit<ReviewerDeliveryDependencies, "deferDelivery">,
  userId: string,
  delivery: ReviewerDelivery,
) => {
  const status = await deliverReviewerMessage(
    dependencies,
    userId,
    delivery.assignmentId,
    delivery.kind,
    { expectedMessageId: delivery.messageId },
  );
  return status === "pending" ? "unavailable" : status;
};
