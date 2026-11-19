import { describe, expect, it } from "vite-plus/test";

import {
  inviteReviewerSchema,
  manageReviewerSchema,
  reviewerAddressSchema,
  reviewerApplicationSchema,
  reviewerActionSchema,
  saveReviewerDraftSchema,
  submitReviewerSchema,
} from "./index";

const assignmentId = "10000000-0000-4000-8000-000000000001";
const commandId = "10000000-0000-4000-8000-000000000002";
const address = { workspaceSlug: "alder", publicId: "0123456789ab" };

describe("assignment addresses", () => {
  it("accepts an assignment and an application address", () => {
    expect(reviewerAddressSchema.safeParse({ assignmentId }).success).toBe(true);
    expect(reviewerApplicationSchema.safeParse(address).success).toBe(true);
  });

  it("rejects malformed assignment and application identifiers", () => {
    expect(reviewerAddressSchema.safeParse({ assignmentId: "guess" }).success).toBe(false);
    expect(reviewerApplicationSchema.safeParse({ ...address, publicId: "guess" }).success).toBe(
      false,
    );
  });

  it("rejects an account supplied by the client", () => {
    expect(reviewerAddressSchema.safeParse({ assignmentId, userId: "someone" }).success).toBe(
      false,
    );
  });
});

describe("manager commands", () => {
  const invitation = { ...address, commandId, requestId: assignmentId, dueDate: null };
  const management = {
    ...address,
    assignmentId,
    commandId,
    expectedRevision: 0,
    action: "cancel",
    note: "",
  };

  it("accepts an invitation without a response date", () => {
    expect(inviteReviewerSchema.safeParse(invitation).success).toBe(true);
  });

  it("rejects an invitation response date that is not a calendar date", () => {
    expect(inviteReviewerSchema.safeParse({ ...invitation, dueDate: "2027-02-30" }).success).toBe(
      false,
    );
  });

  it("requires a valid revision baseline for an assignment change", () => {
    expect(manageReviewerSchema.safeParse(management).success).toBe(true);
    expect(manageReviewerSchema.safeParse({ ...management, expectedRevision: -1 }).success).toBe(
      false,
    );
  });
});

describe("reviewer commands", () => {
  const response = { assignmentId, commandId, expectedRevision: 0, note: "" };
  const input = {
    assignmentId,
    commandId,
    expectedDraftRevision: 0,
    draft: { position: null, amount: null, reasoning: "", observations: [], note: "" },
  };

  it("accepts a reviewer's own participation response", () => {
    expect(reviewerActionSchema.safeParse({ ...response, action: "accept" }).success).toBe(true);
  });

  it("rejects a manager's conflict resolution sent as a reviewer response", () => {
    expect(reviewerActionSchema.safeParse({ ...response, action: "clear_conflict" }).success).toBe(
      false,
    );
  });

  it("accepts an empty draft", () => {
    expect(saveReviewerDraftSchema.safeParse(input).success).toBe(true);
  });

  it.each(["", ".", "12.", ".5", "12.30"])(
    "keeps the unfinished draft amount %j as typed",
    (amount) => {
      expect(
        saveReviewerDraftSchema.parse({ ...input, draft: { ...input.draft, amount } }).draft.amount,
      ).toBe(amount);
    },
  );

  it("rejects a draft amount with more than two decimal places", () => {
    expect(
      saveReviewerDraftSchema.safeParse({ ...input, draft: { ...input.draft, amount: "12.345" } })
        .success,
    ).toBe(false);
  });

  it("rejects draft reasoning beyond the assessment limit", () => {
    expect(
      saveReviewerDraftSchema.safeParse({
        ...input,
        draft: { ...input.draft, reasoning: "x".repeat(20001) },
      }).success,
    ).toBe(false);
  });

  it("rejects draft authorship supplied by the client", () => {
    expect(
      saveReviewerDraftSchema.safeParse({
        ...input,
        draft: { ...input.draft, authorUserId: "dana" },
      }).success,
    ).toBe(false);
  });

  it("requires the saved draft revision to submit", () => {
    expect(
      submitReviewerSchema.safeParse({ assignmentId, commandId, expectedDraftRevision: 1 }).success,
    ).toBe(true);
    expect(submitReviewerSchema.safeParse({ assignmentId, commandId }).success).toBe(false);
  });
});
