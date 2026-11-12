import { z } from "zod";

import { assessmentInputSchema } from "./reviews";

export const reviewerStatuses = [
  "invited",
  "accepted",
  "submitted",
  "conflict",
  "cancelled",
  "declined",
] as const;

export type ReviewerStatus = (typeof reviewerStatuses)[number];

export const reviewerDraftSchema = z.strictObject({
  position: z.enum(["Fund", "Fund with a condition", "Defer", "Decline"]).nullable(),
  amount: z.string().max(32).nullable(),
  reasoning: z.string().max(20000),
  observations: z
    .array(
      z.object({
        criterionId: z.uuid().nullable(),
        criterion: z.string().max(200),
        text: z.string().max(5000),
      }),
    )
    .max(100),
  note: z.string().max(2000),
});

export type ReviewerDraft = z.infer<typeof reviewerDraftSchema>;

export const emptyReviewerDraft = (): ReviewerDraft => ({
  position: null,
  amount: null,
  reasoning: "",
  observations: [],
  note: "",
});

/** The parts of a reviewer's draft that prevent submission, in reading order. */
export type ReviewerSubmissionProblem = "position" | "amount" | "reasoning" | "note" | "content";

const fundingPositions = new Set(["Fund", "Fund with a condition"]);

const submissionContent = (
  draft: ReviewerDraft,
  basis: { applicationVersion: number | null; criteriaVersion: number | null },
) =>
  assessmentInputSchema.safeParse({
    applicationVersion: basis.applicationVersion,
    criteriaVersion: basis.criteriaVersion,
    date: null,
    position: draft.position,
    amount: draft.amount,
    reasoning: draft.reasoning,
    observations: draft.observations,
  });

/**
 * Explains why a draft cannot be submitted so each problem can be shown beside its
 * field. Funding positions need a positive amount; an amendment needs a change note.
 * Content limits enforced by the inputs themselves are reported as `content`.
 */
export const reviewerSubmissionProblems = (
  draft: ReviewerDraft,
  amendment: boolean,
): ReviewerSubmissionProblem[] => {
  const problems = new Set<ReviewerSubmissionProblem>();
  if (draft.position === null) {
    problems.add("position");
  }
  if (draft.position && fundingPositions.has(draft.position) && draft.amount === null) {
    problems.add("amount");
  }
  const content = submissionContent(draft, { applicationVersion: null, criteriaVersion: null });
  for (const issue of content.success ? [] : content.error.issues) {
    const field = issue.path[0];
    problems.add(field === "amount" || field === "reasoning" ? field : "content");
  }
  if (amendment && !draft.note.trim()) {
    problems.add("note");
  }
  const order: ReviewerSubmissionProblem[] = ["position", "amount", "reasoning", "note", "content"];
  return order.filter((problem) => problems.has(problem));
};

export const reviewerSubmission = (
  draft: ReviewerDraft,
  basis: { applicationVersion: number; criteriaVersion: number },
  amendment: boolean,
) => {
  const content = submissionContent(draft, basis);
  if (!content.success || reviewerSubmissionProblems(draft, amendment).length) {
    return null;
  }
  return content.data;
};

export type ParticipationAction =
  | "accept"
  | "decline"
  | "report_conflict"
  | "clear_conflict"
  | "cancel"
  | "reinstate";

const reinstatedStatus = (current: {
  accepted: boolean;
  submitted: boolean;
  conflict: string;
}): ReviewerStatus => {
  if (current.conflict) {
    return "conflict";
  }
  if (!current.accepted) {
    return "invited";
  }
  return current.submitted ? "submitted" : "accepted";
};

type ParticipationState = {
  status: ReviewerStatus;
  accepted: boolean;
  submitted: boolean;
  conflict: string;
};

const transitions: Record<
  ParticipationAction,
  (current: ParticipationState, note: string) => ReviewerStatus | null
> = {
  accept: (current) =>
    current.status === "invited" ? (current.submitted ? "submitted" : "accepted") : null,
  decline: (current) =>
    ["invited", "accepted"].includes(current.status) && !current.submitted ? "declined" : null,
  report_conflict: (current, note) =>
    ["invited", "accepted", "submitted"].includes(current.status) && note.trim()
      ? "conflict"
      : null,
  clear_conflict: (current, note) =>
    current.status === "conflict" && note.trim() ? "invited" : null,
  cancel: (current) => (!["cancelled", "declined"].includes(current.status) ? "cancelled" : null),
  reinstate: (current) => (current.status === "cancelled" ? reinstatedStatus(current) : null),
};

export const nextReviewerStatus = (
  current: ParticipationState,
  action: ParticipationAction,
  note: string,
): ReviewerStatus | null => transitions[action](current, note);

/** An unanswered invitation lapses at its expiry; resending extends it. */
export const isInvitationExpired = (
  assignment: { status: ReviewerStatus; expiresAt: Date | string },
  now = new Date(),
) => assignment.status === "invited" && new Date(assignment.expiresAt) <= now;
