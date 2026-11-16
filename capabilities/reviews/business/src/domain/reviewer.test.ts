import { expect, it } from "vite-plus/test";

import {
  emptyReviewerDraft,
  isInvitationExpired,
  decideInvitation,
  decideManagerAction,
  decideParticipation,
  resumptionProblem,
  reviewerSubmission,
  reviewerSubmissionProblems,
  reviewerDraftSchema,
  type ReviewerDraft,
  type ReviewerStatus,
  type ParticipationAction,
  type ReviewerProblem,
} from "./index";

const basis = { applicationVersion: 2, criteriaVersion: 3 };
const funded: ReviewerDraft = {
  ...emptyReviewerDraft(),
  reasoning: "Clear evidence of benefit",
  position: "Fund",
  amount: "20",
};

it("starts an empty private draft that the draft format accepts", () => {
  const draft = emptyReviewerDraft();

  expect(reviewerDraftSchema.parse(draft)).toEqual(draft);
});

it.each([
  { name: "an empty draft", draft: emptyReviewerDraft() },
  { name: "reasoning without a position", draft: { ...funded, position: null, amount: null } },
  { name: "a position without reasoning", draft: { ...funded, reasoning: "" } },
  { name: "funding without an amount", draft: { ...funded, amount: null } },
  {
    name: "conditional funding without an amount",
    draft: { ...funded, position: "Fund with a condition", amount: null },
  },
  { name: "funding of zero", draft: { ...funded, amount: "0" } },
  { name: "a decline with a positive amount", draft: { ...funded, position: "Decline" } },
] satisfies { name: string; draft: ReviewerDraft }[])(
  "keeps $name from submission",
  ({ draft }) => {
    expect(reviewerSubmission(draft, basis, false)).toBeNull();
  },
);

it.each([
  { name: "funding with an amount", draft: funded },
  {
    name: "conditional funding with an amount",
    draft: { ...funded, position: "Fund with a condition" },
  },
  { name: "a deferral without an amount", draft: { ...funded, position: "Defer", amount: null } },
  { name: "a decline without an amount", draft: { ...funded, position: "Decline", amount: null } },
  { name: "a decline of zero", draft: { ...funded, position: "Decline", amount: "0" } },
] satisfies { name: string; draft: ReviewerDraft }[])("submits $name", ({ draft }) => {
  expect(reviewerSubmission(draft, basis, false)).not.toBeNull();
});

it("submits the judgment against the assigned basis without a recorded date", () => {
  expect(reviewerSubmission(funded, basis, false)).toEqual({
    ...basis,
    date: null,
    position: "Fund",
    amount: "20",
    reasoning: funded.reasoning,
    observations: [],
  });
});

it("requires a change note before an amendment can be submitted", () => {
  expect(reviewerSubmission(funded, basis, true)).toBeNull();
  expect(reviewerSubmission({ ...funded, note: " " }, basis, true)).toBeNull();
  expect(reviewerSubmission({ ...funded, note: "Corrected amount" }, basis, true)).not.toBeNull();
});

it.each([
  ["invited", "accept", false, false, "", "", "accepted"],
  ["invited", "accept", true, true, "", "", "submitted"],
  ["accepted", "accept", true, false, "", "", "action_unavailable"],
  ["invited", "decline", false, false, "", "", "declined"],
  ["accepted", "decline", true, false, "", "", "declined"],
  ["invited", "decline", true, true, "", "", "action_unavailable"],
  ["submitted", "decline", true, true, "", "", "action_unavailable"],
  ["invited", "report_conflict", false, false, "", "Personal connection", "conflict"],
  ["submitted", "report_conflict", true, true, "", "New connection", "conflict"],
  ["accepted", "report_conflict", true, false, "", "", "note_required"],
  ["accepted", "report_conflict", true, false, "", "   ", "note_required"],
  ["cancelled", "report_conflict", true, false, "", "Connection", "action_unavailable"],
  ["conflict", "clear_conflict", true, false, "Connection", "Reviewed; no overlap", "invited"],
  ["conflict", "clear_conflict", true, false, "Connection", "", "note_required"],
  ["conflict", "clear_conflict", true, false, "Connection", "   ", "note_required"],
  ["invited", "clear_conflict", false, false, "", "Clear", "action_unavailable"],
  ["submitted", "cancel", true, true, "", "", "cancelled"],
  ["cancelled", "cancel", true, false, "", "", "action_unavailable"],
  ["declined", "cancel", false, false, "", "", "action_unavailable"],
  ["cancelled", "reinstate", true, false, "Unresolved", "", "conflict"],
  ["cancelled", "reinstate", false, false, "", "", "invited"],
  ["cancelled", "reinstate", true, false, "", "", "accepted"],
  ["cancelled", "reinstate", true, true, "", "", "submitted"],
  ["accepted", "reinstate", true, false, "", "", "action_unavailable"],
] as [
  ReviewerStatus,
  ParticipationAction,
  boolean,
  boolean,
  string,
  string,
  ReviewerStatus | ReviewerProblem,
][])(
  "%s / %s preserves consent, conflict and completion",
  (status, action, accepted, submitted, conflict, note, expected) => {
    const decision = decideParticipation({ status, accepted, submitted, conflict }, action, note);
    expect(decision.ok ? decision.status : decision.error).toBe(expected);
  },
);

const participation = { accepted: false, submitted: false, conflict: "" };

it.each([
  ["resend", "invited", false, "invited"],
  ["resend", "accepted", false, "action_unavailable"],
  ["retry_notification", "submitted", true, "submitted"],
  ["retry_notification", "accepted", false, "action_unavailable"],
  ["cancel", "accepted", false, "cancelled"],
] as const)(
  "%s on a %s assignment is decided before any delivery",
  (action, status, submitted, expected) => {
    const decision = decideManagerAction({ ...participation, status, submitted }, action, "");
    expect(decision.ok ? decision.status : decision.error).toBe(expected);
  },
);

const invitation = {
  withdrawn: false,
  request: { status: "outstanding" },
  contact: { email: " Ada@Example.test ", archived: false },
  managerEmail: "manager@example.test",
};

it("invites the contact's normalized email with the manager as the contact for questions", () => {
  expect(decideInvitation(invitation)).toEqual({
    ok: true,
    email: "ada@example.test",
    managerEmail: "manager@example.test",
  });
});

it.each([
  ["application_withdrawn", { withdrawn: true, request: undefined }],
  ["request_unavailable", { request: undefined }],
  ["request_unavailable", { request: { status: "received" } }],
  ["contact_unavailable", { contact: null }],
  ["contact_unavailable", { contact: { email: "ada@example.test", archived: true } }],
  ["contact_email_required", { contact: { email: "  ", archived: false } }],
  ["contact_email_required", { contact: { email: "ada.example.test", archived: false } }],
  ["manager_email_required", { managerEmail: null }],
] as const)("explains a rejected invitation as %s", (error, change) => {
  expect(decideInvitation({ ...invitation, ...change })).toEqual({ ok: false, error });
});

it.each([
  [{ status: "cancelled", contactArchived: true, followUpOutstanding: true }, null],
  [{ status: "invited", contactArchived: true, followUpOutstanding: false }, "contact_unavailable"],
  [{ status: "accepted", contactArchived: false, followUpOutstanding: true }, "conflict"],
  [
    { status: "accepted", submitted: true, contactArchived: false, followUpOutstanding: true },
    null,
  ],
] as const)("resumes an assignment only without displacing other work (%j)", (facts, expected) => {
  expect(resumptionProblem({ submitted: false, ...facts })).toBe(expected);
});

it("reports each submission problem beside its field, in reading order", () => {
  const draft = emptyReviewerDraft();
  expect(reviewerSubmissionProblems(draft, false)).toEqual(["position", "reasoning"]);
  expect(reviewerSubmissionProblems(draft, true)).toEqual(["position", "reasoning", "note"]);
  expect(
    reviewerSubmissionProblems({ ...draft, position: "Fund", reasoning: "Evidence" }, false),
  ).toEqual(["amount"]);
  expect(
    reviewerSubmissionProblems(
      { ...draft, position: "Fund with a condition", amount: "0", reasoning: "Evidence" },
      false,
    ),
  ).toEqual(["amount"]);
  expect(
    reviewerSubmissionProblems(
      { ...draft, position: "Fund", amount: "12.345", reasoning: " " },
      false,
    ),
  ).toEqual(["amount", "reasoning"]);
  expect(
    reviewerSubmissionProblems({ ...draft, position: "Defer", reasoning: "Evidence" }, false),
  ).toEqual([]);
  expect(
    reviewerSubmissionProblems(
      {
        ...draft,
        position: "Defer",
        reasoning: "Evidence",
        observations: [{ criterionId: null, criterion: "Received note", text: "x".repeat(5001) }],
      },
      false,
    ),
  ).toEqual(["content"]);
  for (const candidate of [
    draft,
    { ...draft, position: "Fund" as const, reasoning: "Evidence" },
    { ...draft, position: "Fund" as const, amount: "20", reasoning: "Evidence" },
    { ...draft, position: "Decline" as const, amount: "5", reasoning: "Evidence" },
  ]) {
    for (const amendment of [false, true]) {
      expect(reviewerSubmission(candidate, basis, amendment) === null).toBe(
        reviewerSubmissionProblems(candidate, amendment).length > 0,
      );
    }
  }
});

it("expires only unanswered invitations once their expiry passes", () => {
  const now = new Date("2027-01-15T10:00:00Z");
  const invitation = { status: "invited" as const, expiresAt: "2027-01-15T10:00:00Z" };
  expect(isInvitationExpired(invitation, now)).toBe(true);
  expect(isInvitationExpired({ ...invitation, expiresAt: "2027-01-15T10:00:01Z" }, now)).toBe(
    false,
  );
  expect(isInvitationExpired({ ...invitation, status: "accepted" }, now)).toBe(false);
  expect(isInvitationExpired({ ...invitation, expiresAt: new Date("2027-01-01") }, now)).toBe(true);
});
