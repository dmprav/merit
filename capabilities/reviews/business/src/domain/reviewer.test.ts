import { expect, it } from "vite-plus/test";

import {
  emptyReviewerDraft,
  isInvitationExpired,
  nextReviewerStatus,
  reviewerSubmission,
  reviewerSubmissionProblems,
  reviewerDraftSchema,
  type ReviewerDraft,
  type ReviewerStatus,
  type ParticipationAction,
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
  ["accepted", "accept", true, false, "", "", null],
  ["invited", "decline", false, false, "", "", "declined"],
  ["accepted", "decline", true, false, "", "", "declined"],
  ["invited", "decline", true, true, "", "", null],
  ["submitted", "decline", true, true, "", "", null],
  ["invited", "report_conflict", false, false, "", "Personal connection", "conflict"],
  ["submitted", "report_conflict", true, true, "", "New connection", "conflict"],
  ["accepted", "report_conflict", true, false, "", "", null],
  ["accepted", "report_conflict", true, false, "", "   ", null],
  ["cancelled", "report_conflict", true, false, "", "Connection", null],
  ["conflict", "clear_conflict", true, false, "Connection", "Reviewed; no overlap", "invited"],
  ["conflict", "clear_conflict", true, false, "Connection", "", null],
  ["conflict", "clear_conflict", true, false, "Connection", "   ", null],
  ["invited", "clear_conflict", false, false, "", "Clear", null],
  ["submitted", "cancel", true, true, "", "", "cancelled"],
  ["cancelled", "cancel", true, false, "", "", null],
  ["declined", "cancel", false, false, "", "", null],
  ["cancelled", "reinstate", true, false, "Unresolved", "", "conflict"],
  ["cancelled", "reinstate", false, false, "", "", "invited"],
  ["cancelled", "reinstate", true, false, "", "", "accepted"],
  ["cancelled", "reinstate", true, true, "", "", "submitted"],
  ["accepted", "reinstate", true, false, "", "", null],
] as [
  ReviewerStatus,
  ParticipationAction,
  boolean,
  boolean,
  string,
  string,
  ReviewerStatus | null,
][])(
  "%s / %s preserves consent, conflict and completion",
  (status, action, accepted, submitted, conflict, note, expected) => {
    expect(nextReviewerStatus({ status, accepted, submitted, conflict }, action, note)).toBe(
      expected,
    );
  },
);

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
