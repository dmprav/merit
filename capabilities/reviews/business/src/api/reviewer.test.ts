import { expect, it } from "vite-plus/test";

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

it("validates assignment addresses and rejects account or authority supplied by a client", () => {
  expect(reviewerAddressSchema.safeParse({ assignmentId }).success).toBe(true);
  expect(reviewerApplicationSchema.safeParse(address).success).toBe(true);
  expect(reviewerAddressSchema.safeParse({ assignmentId: "guess" }).success).toBe(false);
  expect(reviewerAddressSchema.safeParse({ assignmentId, userId: "someone" }).success).toBe(false);
  expect(reviewerApplicationSchema.safeParse({ ...address, publicId: "guess" }).success).toBe(
    false,
  );
});
it("validates invitation dates and requires revision baselines for changes", () => {
  const invitation = { ...address, commandId, requestId: assignmentId, dueDate: null };
  expect(inviteReviewerSchema.safeParse(invitation).success).toBe(true);
  expect(inviteReviewerSchema.safeParse({ ...invitation, dueDate: "2027-02-30" }).success).toBe(
    false,
  );
  const management = {
    ...address,
    assignmentId,
    commandId,
    expectedRevision: 0,
    action: "cancel",
    note: "",
  };
  expect(manageReviewerSchema.safeParse(management).success).toBe(true);
  expect(manageReviewerSchema.safeParse({ ...management, expectedRevision: -1 }).success).toBe(
    false,
  );
  expect(
    reviewerActionSchema.safeParse({
      assignmentId,
      commandId,
      expectedRevision: 0,
      action: "accept",
      note: "",
    }).success,
  ).toBe(true);
  expect(
    reviewerActionSchema.safeParse({
      assignmentId,
      commandId,
      expectedRevision: 0,
      action: "clear_conflict",
      note: "",
    }).success,
  ).toBe(false);
});
it("accepts incomplete drafts but bounds content and never accepts authorship from the client", () => {
  const input = {
    assignmentId,
    commandId,
    expectedDraftRevision: 0,
    draft: { position: null, amount: null, reasoning: "", observations: [], note: "" },
  };
  expect(saveReviewerDraftSchema.safeParse(input).success).toBe(true);
  expect(
    saveReviewerDraftSchema.safeParse({
      ...input,
      draft: { ...input.draft, reasoning: "x".repeat(20001) },
    }).success,
  ).toBe(false);
  expect(
    saveReviewerDraftSchema.safeParse({ ...input, draft: { ...input.draft, authorUserId: "dana" } })
      .success,
  ).toBe(false);
  expect(
    submitReviewerSchema.safeParse({ assignmentId, commandId, expectedDraftRevision: 1 }).success,
  ).toBe(true);
  expect(submitReviewerSchema.safeParse({ assignmentId, commandId }).success).toBe(false);
});
