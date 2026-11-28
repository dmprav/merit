import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";

import {
  reviewerAddressSchema,
  reviewerListInput,
  reviewerApplicationSchema,
  type ReviewerService,
} from "../api/reviewer";
import type { ReviewService } from "../api/service";
import { runAiReview, type AiReviewDependencies } from "./commands/ai-reviews";
import {
  inviteReviewer,
  manageReviewer,
  respondToReview,
  saveReviewerDraft,
  submitReviewerAssessment,
} from "./commands/reviewer";
import {
  deliverReviewerMessage,
  type ReviewerDeliveryDependencies,
} from "./commands/reviewer-delivery";
import { saveApplicationReview } from "./commands/reviews";
import { readApplicationAiReviewRun, readApplicationAiReviews } from "./queries/ai-reviews";
import {
  listReviewerAssignments,
  readReviewerAssignment,
  managerReviewerAssignments,
  managerReviewerHistory,
} from "./queries/reviewer";

type Dependencies = { database: <T>(operation: (db: Database) => Promise<T>) => Promise<T> };

type ReviewerDependencies = ReviewerDeliveryDependencies & {
  onSubmitted?: WorkspaceChangeObserver;
};

const reviewerReads = ({ database }: Dependencies): Pick<ReviewerService, "read" | "list"> => ({
  read: async (actor, input) => {
    const parsed = reviewerAddressSchema.safeParse(input);
    if (!parsed.success) {
      return { status: "invalid", error: "invalid_input" };
    }
    return database((db) =>
      readReviewerAssignment(db, actor, parsed.data.assignmentId, parsed.data.workspaceSlug),
    );
  },
  list: async (actor, input) => {
    const parsed = reviewerListInput.safeParse(input);
    if (!parsed.success) {
      return { status: "invalid", error: "invalid_input" };
    }
    return database((db) => listReviewerAssignments(db, actor, parsed.data?.workspaceSlug));
  },
});

export const createReviewerService = (dependencies: ReviewerDependencies): ReviewerService => {
  const { database } = dependencies;
  const { read, list } = reviewerReads(dependencies);

  const forApplication: ReviewerService["forApplication"] = (actor, input) => {
    const parsed = reviewerApplicationSchema.safeParse(input);
    return parsed.success
      ? database((db) => managerReviewerAssignments(db, actor, parsed.data))
      : Promise.resolve({ status: "invalid", error: "invalid_input" });
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
    history: (actor, input) => database((db) => managerReviewerHistory(db, actor, input)),
    read,
    forApplication,
    list,
    invite: async (actor, input) => {
      const result = await database((db) => inviteReviewer(db, actor, input));
      if (result.status !== "ok") {
        return result;
      }
      await deliverReviewerMessage(dependencies, actor.userId, result.id, "invitation", {
        workspaceSlug: input.workspaceSlug,
      });
      return managerAssignment(actor, input, result.id);
    },
    manage: async (actor, input) => {
      const result = await database((db) => manageReviewer(db, actor, input));
      if (result.status !== "ok") {
        return result;
      }
      if (input.action === "resend" || input.action === "retry_notification") {
        await deliverReviewerMessage(
          dependencies,
          actor.userId,
          result.id,
          input.action === "resend" ? "invitation" : "submission",
          { workspaceSlug: input.workspaceSlug },
        );
      }
      return managerAssignment(actor, input, result.id);
    },
    respond: async (actor, input) => {
      const result = await database((db) => respondToReview(db, actor, input));
      if (result.status !== "ok") {
        return result;
      }
      const page = await read(actor, {
        assignmentId: result.id,
        workspaceSlug: input.workspaceSlug,
      });
      return page.status === "ok" ? { status: "ok", value: page.value.assignment } : page;
    },
    saveDraft: (actor, input) => database((db) => saveReviewerDraft(db, actor, input)),
    submit: async (actor, input) => {
      const result = await database((db) =>
        submitReviewerAssessment(db, actor, input, dependencies.onSubmitted),
      );
      if (result.status === "ok") {
        await deliverReviewerMessage(dependencies, actor.userId, input.assignmentId, "submission", {
          workspaceSlug: input.workspaceSlug,
          submissionCommandId: input.commandId,
        });
      }
      return result;
    },
  };
};

export const createReviewService = ({
  database,
  reviewer,
  onAiReviewSaved,
}: Dependencies & {
  reviewer?: AiReviewDependencies["reviewer"];
  onAiReviewSaved?: WorkspaceChangeObserver;
}): ReviewService => ({
  saveReview: (actor, input) => database((db) => saveApplicationReview(db, actor, input)),
  runAiReview: (actor, input) =>
    runAiReview(database, actor, input, { reviewer, onSaved: onAiReviewSaved }),
  readAiReviewRun: (actor, input) => database((db) => readApplicationAiReviewRun(db, actor, input)),
  readAiReviews: (actor, input) => database((db) => readApplicationAiReviews(db, actor, input)),
  aiReviewProvider: reviewer ? { provider: reviewer.provider, model: reviewer.model } : null,
});
