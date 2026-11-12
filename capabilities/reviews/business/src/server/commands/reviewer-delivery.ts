import type { Database } from "@merit/db";

import type { ReviewerMessage } from "../../api/reviewer";
import { pendingReviewerMessages, finishReviewerMessage } from "../persistence/commands/reviewer";
import { readReviewerRecord } from "../persistence/reviewer-records";

export const deliverReviewerMessages = async (
  dependencies: {
    database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
    send: (message: ReviewerMessage) => Promise<void>;
    reviewerUrl: (id: string) => string;
    managerUrl: (slug: string, applicationId: string) => string;
  },
  id: string,
) => {
  const data = await dependencies.database(async (db) => ({
    record: await readReviewerRecord(db, id),
    messages: await pendingReviewerMessages(db, id),
  }));
  if (!data.record) {
    return;
  }
  const record = data.record;
  const seen = new Set<string>();
  for (const message of data.messages) {
    if (seen.has(message.kind)) {
      continue;
    }
    seen.add(message.kind);
    if (
      message.status === "sent" ||
      (message.kind === "invitation" &&
        (record.assignment.status !== "invited" || record.assignment.expiresAt <= new Date()))
    ) {
      continue;
    }
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
            ? dependencies.reviewerUrl(id)
            : dependencies.managerUrl(record.slug, record.assignment.caseId),
      });
      await dependencies.database((db) => finishReviewerMessage(db, message.id, "sent"));
    } catch {
      await dependencies.database((db) => finishReviewerMessage(db, message.id, "failed"));
    }
  }
};
