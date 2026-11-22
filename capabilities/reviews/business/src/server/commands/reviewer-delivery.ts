import type { Database } from "@merit/db";
import { assignmentScope, readScoped } from "@merit/organizations/transactions";

import type { ReviewerMessage } from "../../api/reviewer";
import { latestReviewerMessage, finishReviewerMessage } from "../persistence/commands/reviewer";
import { readReviewerRecord } from "../persistence/reviewer-records";

export const deliverReviewerMessage = async (
  dependencies: {
    database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
    send: (message: ReviewerMessage) => Promise<void>;
    reviewerUrl: (slug: string, id: string) => string;
    managerUrl: (slug: string, applicationId: string) => string;
  },
  userId: string,
  id: string,
  kind: ReviewerMessage["kind"],
  submissionCommandId?: string,
) => {
  const scope = assignmentScope(userId, id);
  const data = await dependencies.database((db) =>
    readScoped(db, scope, async (tx) => ({
      record: await readReviewerRecord(tx, id),
      message: await latestReviewerMessage(tx, id, kind),
    })),
  );
  const { record, message } = data;
  if (!record || !message || message.status === "sent") {
    return;
  }
  if (submissionCommandId && (message.id !== submissionCommandId || message.status !== "pending")) {
    return;
  }
  if (
    kind === "invitation" &&
    (record.assignment.status !== "invited" || record.assignment.expiresAt <= new Date())
  ) {
    return;
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
};
