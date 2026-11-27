import { expect, it } from "vite-plus/test";

import {
  emptyReviewerDraft,
  isInvitationExpired,
  decideInvitation,
  decideManagerAction,
  decideParticipation,
  decideReviewerWork,
  resumptionProblem,
  reviewerSubmission,
  reviewerSubmissionProblems,
  reviewerDraftSchema,
  type ReviewerDraft,
  type ReviewerStatus,
  type ParticipationAction,
  type ReviewerProblem,
  type ReviewerSubmissionProblem,
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
    amount: { minorUnits: "2000", currency: "EUR" },
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

const evidence = { ...emptyReviewerDraft(), reasoning: "Evidence" };

it.each([
  {
    name: "an empty draft",
    draft: emptyReviewerDraft(),
    amendment: false,
    problems: ["position", "reasoning"],
  },
  {
    name: "an empty amendment",
    draft: emptyReviewerDraft(),
    amendment: true,
    problems: ["position", "reasoning", "note"],
  },
  {
    name: "funding without an amount",
    draft: { ...evidence, position: "Fund" },
    amendment: false,
    problems: ["amount"],
  },
  {
    name: "conditional funding of zero",
    draft: { ...evidence, position: "Fund with a condition", amount: "0" },
    amendment: false,
    problems: ["amount"],
  },
  {
    name: "excess amount precision and blank reasoning",
    draft: { ...evidence, position: "Fund", amount: "12.345", reasoning: " " },
    amendment: false,
    problems: ["amount", "reasoning"],
  },
  {
    name: "a complete deferral",
    draft: { ...evidence, position: "Defer" },
    amendment: false,
    problems: [],
  },
  {
    name: "an observation beyond its length limit",
    draft: {
      ...evidence,
      position: "Defer",
      observations: [{ criterionId: null, criterion: "Received note", text: "x".repeat(5001) }],
    },
    amendment: false,
    problems: ["content"],
  },
] satisfies {
  name: string;
  draft: ReviewerDraft;
  amendment: boolean;
  problems: ReviewerSubmissionProblem[];
}[])(
  "reports the problems in $name beside their fields, in reading order",
  ({ draft, amendment, problems }) => {
    expect(reviewerSubmissionProblems(draft, amendment)).toEqual(problems);
  },
);

it.each([
  emptyReviewerDraft(),
  { ...evidence, position: "Fund" },
  { ...evidence, position: "Fund", amount: "20" },
  { ...evidence, position: "Decline", amount: "5" },
] satisfies ReviewerDraft[])("blocks submission exactly when it reports a problem: %j", (draft) => {
  for (const amendment of [false, true]) {
    expect(reviewerSubmission(draft, basis, amendment) === null).toBe(
      reviewerSubmissionProblems(draft, amendment).length > 0,
    );
  }
});

const now = new Date("2027-01-15T10:00:00Z");

it.each([
  {
    name: "an invitation at its expiry",
    status: "invited",
    expiresAt: "2027-01-15T10:00:00Z",
    expired: true,
  },
  {
    name: "an invitation before its expiry",
    status: "invited",
    expiresAt: "2027-01-15T10:00:01Z",
    expired: false,
  },
  {
    name: "an accepted invitation past its expiry",
    status: "accepted",
    expiresAt: "2027-01-15T10:00:00Z",
    expired: false,
  },
  {
    name: "an invitation with a stored expiry time",
    status: "invited",
    expiresAt: new Date("2027-01-01"),
    expired: true,
  },
] satisfies { name: string; status: ReviewerStatus; expiresAt: Date | string; expired: boolean }[])(
  "expires only unanswered invitations once their expiry passes: $name",
  ({ status, expiresAt, expired }) => {
    expect(isInvitationExpired({ status, expiresAt }, now)).toBe(expired);
  },
);

it("reports why reviewer work is unavailable, with access decided before withdrawal", () => {
  expect(decideReviewerWork({ permitted: true, withdrawn: false })).toEqual({ available: true });
  expect(decideReviewerWork({ permitted: true, withdrawn: true })).toEqual({
    available: false,
    reason: "application_withdrawn",
  });
  // Writes report missing access before withdrawal, so a read matches what a write returns first.
  expect(decideReviewerWork({ permitted: false, withdrawn: true })).toEqual({
    available: false,
    reason: "action_unavailable",
  });
});
