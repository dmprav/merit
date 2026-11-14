import { z } from "zod";

import type { encodeApplicationMaterial } from "@merit/applications/api";
import { auditPageInput } from "@merit/audit/api";
import type { Actor } from "@merit/auth";
import { calendarDateSchema } from "@merit/dates";

import type { ReviewBasisComparison } from "../domain/basis";
import { reviewerDraftSchema, type ReviewerDraft, type ReviewerStatus } from "../domain/reviewer";
import type { ReviewState } from "../domain/reviews";

const publicIdSchema = z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/);

export const reviewerListInput = z
  .strictObject({ workspaceSlug: z.string().min(1).max(80) })
  .optional();

export const reviewerAddressSchema = z.strictObject({
  assignmentId: z.uuid(),
  workspaceSlug: z.string().min(1).max(80).optional(),
});
export const reviewerApplicationSchema = z.strictObject({
  workspaceSlug: z.string().min(1).max(80),
  publicId: publicIdSchema,
});
export const inviteReviewerSchema = reviewerApplicationSchema.extend({
  commandId: z.uuid(),
  requestId: z.uuid(),
  dueDate: calendarDateSchema.nullable(),
});
export const manageReviewerSchema = reviewerApplicationSchema.extend({
  assignmentId: z.uuid(),
  commandId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum(["cancel", "reinstate", "clear_conflict", "resend", "retry_notification"]),
  note: z.string().trim().max(2000),
});
export const reviewerActionSchema = reviewerAddressSchema.extend({
  commandId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum(["accept", "decline", "report_conflict"]),
  note: z.string().trim().max(2000),
});
export const saveReviewerDraftSchema = reviewerAddressSchema.extend({
  commandId: z.uuid(),
  expectedDraftRevision: z.number().int().nonnegative(),
  draft: reviewerDraftSchema,
});
export const submitReviewerSchema = reviewerAddressSchema.extend({
  commandId: z.uuid(),
  expectedDraftRevision: z.number().int().nonnegative(),
});

export type ReviewerSummary = {
  id: string;
  requestId: string;
  revision: number;
  status: ReviewerStatus;
  reviewer: string;
  hasSubmitted: boolean;
  email: string;
  applicationTitle: string;
  applicant: string;
  organization: string;
  workspaceSlug: string;
  dueDate: string | null;
  managerName: string;
  managerEmail: string;
  applicationVersion: number;
  criteriaVersion: number;
  basisComparison: ReviewBasisComparison;
  materialChanged: boolean;
  criteriaChanged: boolean;
  conflict: string;
  delivery: "pending" | "sent" | "failed";
  notification: "pending" | "sent" | "failed" | null;
  expiresAt: string;
};

export type ReviewerPage = {
  assignment: ReviewerSummary;
  material: ReturnType<typeof encodeApplicationMaterial> | null;
  criteria: ReviewState["requests"][number]["criteria"];
  draft: { revision: number; content: ReviewerDraft } | null;
  assessment: ReviewState["assessments"][number] | null;
};

export type ReviewerResult<T> =
  | { status: "ok"; value: T }
  | { status: "not_found" | "forbidden" | "conflict" | "expired" | "limited" }
  | { status: "invalid"; error?: "application_withdrawn" | "workspace_membership_required" };

export type ReviewerEvent = { action: string; actor: string | null; at: string; note: string };

export type ReviewerMessage = {
  id: string;
  to: string;
  kind: "invitation" | "submission";
  organization: string;
  title: string;
  applicant: string;
  reviewer: string;
  manager: string;
  managerEmail: string;
  dueDate: string | null;
  url: string;
};

export const reviewerHistoryInput = reviewerApplicationSchema.extend({
  ...auditPageInput.shape,
  assignmentId: z.uuid(),
});

export interface ReviewerService {
  history: (
    actor: Actor,
    input: z.input<typeof reviewerHistoryInput>,
  ) => Promise<ReviewerResult<{ entries: ReviewerEvent[]; nextCursor: string | null }>>;
  list: (
    actor: Actor,
    input?: { workspaceSlug: string },
  ) => Promise<ReviewerResult<ReviewerSummary[]>>;
  read: (
    actor: Actor,
    input: z.infer<typeof reviewerAddressSchema>,
  ) => Promise<ReviewerResult<ReviewerPage>>;
  forApplication: (
    actor: Actor,
    input: z.infer<typeof reviewerApplicationSchema>,
  ) => Promise<ReviewerResult<ReviewerSummary[]>>;
  invite: (
    actor: Actor,
    input: z.infer<typeof inviteReviewerSchema>,
  ) => Promise<ReviewerResult<ReviewerSummary>>;
  manage: (
    actor: Actor,
    input: z.infer<typeof manageReviewerSchema>,
  ) => Promise<ReviewerResult<ReviewerSummary>>;
  respond: (
    actor: Actor,
    input: z.infer<typeof reviewerActionSchema>,
  ) => Promise<ReviewerResult<ReviewerSummary>>;
  saveDraft: (
    actor: Actor,
    input: z.infer<typeof saveReviewerDraftSchema>,
  ) => Promise<ReviewerResult<{ revision: number }>>;
  submit: (
    actor: Actor,
    input: z.infer<typeof submitReviewerSchema>,
  ) => Promise<ReviewerResult<{ revision: number }>>;
}
