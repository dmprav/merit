import { z } from "zod";

import { assessmentEntrySchema } from "./reviews";

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
  assessmentEntrySchema.safeParse({
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
  (current: ParticipationState) => ReviewerStatus | null
> = {
  accept: (current) =>
    current.status === "invited" ? (current.submitted ? "submitted" : "accepted") : null,
  decline: (current) =>
    ["invited", "accepted"].includes(current.status) && !current.submitted ? "declined" : null,
  report_conflict: (current) =>
    ["invited", "accepted", "submitted"].includes(current.status) ? "conflict" : null,
  clear_conflict: (current) => (current.status === "conflict" ? "invited" : null),
  cancel: (current) => (!["cancelled", "declined"].includes(current.status) ? "cancelled" : null),
  reinstate: (current) => (current.status === "cancelled" ? reinstatedStatus(current) : null),
};

const explainedActions = new Set<ParticipationAction>(["report_conflict", "clear_conflict"]);

/** Why a reviewer operation was rejected; each reason is reported to the caller. */
export const reviewerProblems = [
  "invalid_input",
  "application_withdrawn",
  "workspace_membership_required",
  "invitation_exists",
  "request_unavailable",
  "contact_unavailable",
  "contact_email_required",
  "manager_email_required",
  "action_unavailable",
  "note_required",
  "submission_incomplete",
  "already_requested",
  "version_unavailable",
  "criteria_unavailable",
  "assessment_unavailable",
  "follow_up_required",
] as const;

export type ReviewerProblem = (typeof reviewerProblems)[number];

type Decision<T> = ({ ok: true } & T) | { ok: false; error: ReviewerProblem };

const reject = (error: ReviewerProblem) => ({ ok: false, error }) as const;

/**
 * Decides the next participation status. Conflicts are reported and cleared only with
 * an explanation.
 */
export const decideParticipation = (
  current: ParticipationState,
  action: ParticipationAction,
  note: string,
): Decision<{ status: ReviewerStatus }> => {
  const status = transitions[action](current);
  if (!status) {
    return reject("action_unavailable");
  }
  if (explainedActions.has(action) && !note.trim()) {
    return reject("note_required");
  }
  return { ok: true, status };
};

export type ManagerAction = Exclude<ParticipationAction, "accept" | "decline" | "report_conflict">;

/**
 * Decides a manager's action on an assignment. Only an unanswered invitation can be
 * resent, and only a submitted assessment has a notification to retry.
 */
export const decideManagerAction = (
  current: ParticipationState,
  action: ManagerAction | "resend" | "retry_notification",
  note: string,
): Decision<{ status: ReviewerStatus }> => {
  if (action === "resend") {
    return current.status === "invited"
      ? { ok: true, status: current.status }
      : reject("action_unavailable");
  }
  if (action === "retry_notification") {
    return current.submitted ? { ok: true, status: current.status } : reject("action_unavailable");
  }
  return decideParticipation(current, action, note);
};

/**
 * Decides whether a review request can be sent as an invitation, returning the
 * recipient's normalized email. The requesting manager's membership email is shown
 * to the reviewer as the contact for questions.
 */
export const decideInvitation = (facts: {
  withdrawn: boolean;
  request: { status: string } | undefined;
  contact: { email: string; archived: boolean } | null | undefined;
  managerEmail: string | null;
}): Decision<{ email: string; managerEmail: string }> => {
  if (facts.withdrawn) {
    return reject("application_withdrawn");
  }
  if (facts.request?.status !== "outstanding") {
    return reject("request_unavailable");
  }
  if (!facts.contact || facts.contact.archived) {
    return reject("contact_unavailable");
  }
  const email = facts.contact.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return reject("contact_email_required");
  }
  if (!facts.managerEmail) {
    return reject("manager_email_required");
  }
  return { ok: true, email, managerEmail: facts.managerEmail };
};

/**
 * An assignment can resume only for an available contact, and an unsubmitted one must
 * not displace a follow-up request already outstanding for the same contact.
 */
export const resumptionProblem = (facts: {
  status: ReviewerStatus;
  submitted: boolean;
  contactArchived: boolean;
  followUpOutstanding: boolean;
}) => {
  if (facts.status === "cancelled") {
    return null;
  }
  if (facts.contactArchived) {
    return "contact_unavailable" as const;
  }
  return !facts.submitted && facts.followUpOutstanding ? ("conflict" as const) : null;
};

/** An unanswered invitation lapses at its expiry; resending extends it. */
export const isInvitationExpired = (
  assignment: { status: ReviewerStatus; expiresAt: Date | string },
  now = new Date(),
) => assignment.status === "invited" && new Date(assignment.expiresAt) <= now;
