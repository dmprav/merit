import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import {
  reviewerAddressSchema,
  reviewerApplicationSchema,
  type ReviewerService,
  type ReviewerMessage,
} from "../api/reviewer";
import type { ReviewService } from "../api/service";
import {
  inviteReviewer,
  manageReviewer,
  respondToReview,
  saveReviewerDraft,
  submitReviewerAssessment,
} from "./commands/reviewer";
import { deliverReviewerMessages } from "./commands/reviewer-delivery";
import { saveApplicationReview, type RecordAssessmentAudit } from "./commands/reviews";
import {
  listReviewerAssignments,
  readReviewerAssignment,
  managerReviewerAssignments,
} from "./queries/reviewer";

type Dependencies = { database: <T>(operation: (db: Database) => Promise<T>) => Promise<T> };

export const createReviewerService = (
  dependencies: Dependencies & {
    verifiedEmails: (actor: Actor) => Promise<string[]>;
    recordAuditEvent: RecordAssessmentAudit;
    send: (message: ReviewerMessage) => Promise<void>;
    reviewerUrl: (id: string) => string;
    managerUrl: (slug: string, applicationId: string) => string;
  },
): ReviewerService => {
  const { database, verifiedEmails, recordAuditEvent } = dependencies;

  const read: ReviewerService["read"] = async (actor, input) => {
    const parsed = reviewerAddressSchema.safeParse(input);
    if (!parsed.success) {
      return { status: "invalid" };
    }
    const emails = await verifiedEmails(actor);
    return database((db) => readReviewerAssignment(db, actor, emails, parsed.data.assignmentId));
  };

  const forApplication: ReviewerService["forApplication"] = (actor, input) => {
    const parsed = reviewerApplicationSchema.safeParse(input);
    return parsed.success
      ? database((db) => managerReviewerAssignments(db, actor, parsed.data))
      : Promise.resolve({ status: "invalid" });
  };

  const managerAssignment = async (
    actor: Actor,
    { workspaceSlug, publicId }: { workspaceSlug: string; publicId: string },
    id: string,
  ) => {
    const rows = await forApplication(actor, { workspaceSlug, publicId });
    const value = rows.status === "ok" ? rows.value.find((row) => row.id === id) : undefined;
    return value ? ({ status: "ok", value } as const) : ({ status: "not_found" } as const);
  };

  return {
    read,
    forApplication,
    list: async (actor) => {
      const emails = await verifiedEmails(actor);
      return database((db) => listReviewerAssignments(db, actor, emails));
    },
    invite: async (actor, input) => {
      const emails = await verifiedEmails(actor);
      const result = await database((db) => inviteReviewer(db, actor, emails, input));
      if (result.status !== "ok") {
        return result;
      }
      await deliverReviewerMessages(dependencies, result.id);
      return managerAssignment(actor, input, result.id);
    },
    manage: async (actor, input) => {
      const result = await database((db) => manageReviewer(db, actor, input));
      if (result.status !== "ok") {
        return result;
      }
      if (input.action === "resend" || input.action === "retry_notification") {
        await deliverReviewerMessages(dependencies, result.id);
      }
      return managerAssignment(actor, input, result.id);
    },
    respond: async (actor, input) => {
      const emails = await verifiedEmails(actor);
      const result = await database((db) => respondToReview(db, actor, emails, input));
      if (result.status !== "ok") {
        return result;
      }
      const page = await read(actor, { assignmentId: result.id });
      return page.status === "ok" ? { status: "ok", value: page.value.assignment } : page;
    },
    saveDraft: (actor, input) => database((db) => saveReviewerDraft(db, actor, input)),
    submit: async (actor, input) => {
      const result = await database((db) =>
        submitReviewerAssessment(db, actor, input, recordAuditEvent),
      );
      if (result.status === "ok") {
        await deliverReviewerMessages(dependencies, input.assignmentId);
      }
      return result;
    },
  };
};

export const createReviewService = ({
  database,
  recordAuditEvent,
}: Dependencies & { recordAuditEvent: RecordAssessmentAudit }): ReviewService => ({
  saveReview: (actor, input) =>
    database((db) => saveApplicationReview(db, actor, input, recordAuditEvent)),
});
