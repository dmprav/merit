import { expect, it } from "vite-plus/test";

import {
  emptyReviewerDraft,
  isInvitationExpired,
  nextReviewerStatus,
  reviewerSubmission,
  reviewerSubmissionProblems,
  reviewerDraftSchema,
  type ReviewerStatus,
  type ParticipationAction,
} from "./index";
import { assessmentInputSchema } from "./index";

it("requires a complete judgment while allowing incomplete private writing", () => {
  const draft = emptyReviewerDraft();
  const basis = { applicationVersion: 2, criteriaVersion: 3 };
  expect(reviewerDraftSchema.parse(draft)).toEqual(draft);
  expect(reviewerSubmission(draft, basis, false)).toBeNull();
  expect(reviewerSubmission({ ...draft, reasoning: "Useful evidence" }, basis, false)).toBeNull();
  expect(
    reviewerSubmission({ ...draft, reasoning: "Useful evidence", position: "Fund" }, basis, false),
  ).toBeNull();
  expect(
    reviewerSubmission(
      { ...draft, reasoning: "Useful evidence", position: "Fund with a condition" },
      basis,
      false,
    ),
  ).toBeNull();
  const funded = {
    ...draft,
    reasoning: "Clear evidence of benefit",
    position: "Fund" as const,
    amount: "20",
  };
  expect(reviewerSubmission(funded, basis, false)).toMatchObject({
    ...basis,
    reasoning: funded.reasoning,
    position: "Fund",
    amount: "20",
    date: null,
  });
  expect(reviewerSubmission(funded, basis, true)).toBeNull();
  expect(reviewerSubmission({ ...funded, note: "Corrected amount" }, basis, true)).not.toBeNull();
  expect(
    reviewerSubmission({ ...funded, position: "Fund with a condition" }, basis, false),
  ).not.toBeNull();
  expect(
    reviewerSubmission({ ...funded, position: "Defer", amount: null }, basis, false),
  ).not.toBeNull();
  for (const amount of [null, "0"]) {
    expect(
      reviewerSubmission({ ...funded, position: "Decline", amount }, basis, false),
    ).not.toBeNull();
  }
  expect(reviewerSubmission({ ...funded, position: "Decline" }, basis, false)).toBeNull();
  expect(reviewerSubmission({ ...funded, amount: "0" }, basis, false)).toBeNull();
  expect(
    assessmentInputSchema.safeParse({
      ...basis,
      date: null,
      position: "Decline",
      amount: "0",
      reasoning: "Outside remit",
      observations: [],
    }).success,
  ).toBe(true);
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
  ["cancelled", "report_conflict", true, false, "", "Connection", null],
  ["conflict", "clear_conflict", true, false, "Connection", "Reviewed; no overlap", "invited"],
  ["conflict", "clear_conflict", true, false, "Connection", "", null],
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
  const basis = { applicationVersion: 1, criteriaVersion: 1 };
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
