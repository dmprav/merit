import { describe, expect, it } from "vite-plus/test";

import {
  applicationContentInput,
  contactApplicationSummarySchema,
  roundListInput,
  reviewListInput,
} from "./reading";

const workspaceSlug = "alder";
const applicationId = "0123456789ab";

it("requires actual round context and a recognized relationship for contact application summaries", () => {
  const summary = {
    applicationId,
    roundId: "0123456789ac",
    title: "Neighbour Table",
    roundTitle: "Community grants",
    relationships: ["applicant_contact", "review_requested", "assessment_recorded"],
    applicationVersion: 1,
    intakeRevision: 0,
    reviewRevision: 0,
    recommendationRevision: 0,
    intakeStatus: "in_preparation",
    withdrawn: false,
    requested: null,
    contactId: null,
    hasWorkingRevision: false,
  };
  expect(contactApplicationSummarySchema.parse(summary)).toEqual(summary);
  expect(
    contactApplicationSummarySchema.safeParse({ ...summary, roundTitle: undefined }).success,
  ).toBe(false);
  expect(contactApplicationSummarySchema.safeParse({ ...summary, relationships: [] }).success).toBe(
    false,
  );
  expect(
    contactApplicationSummarySchema.safeParse({ ...summary, relationships: ["member"] }).success,
  ).toBe(false);
});

describe("round list requests", () => {
  it("defaults to a page of 20 rounds", () => {
    expect(roundListInput.parse({ workspaceSlug }).limit).toBe(20);
  });

  it.each([0, 51, 1.5])("rejects page size %s", (limit) => {
    expect(roundListInput.safeParse({ workspaceSlug, limit }).success).toBe(false);
  });
});

it.each(["request:old-id", "assessment:", "other:00000000-0000-4000-8000-000000000001"])(
  "rejects malformed review cursor %s",
  (after) => {
    expect(reviewListInput.safeParse({ workspaceSlug, applicationId, after }).success).toBe(false);
  },
);

describe("application content requests", () => {
  const request = { workspaceSlug, applicationId, section: "submission" };

  it("defaults to the first 8,000 characters", () => {
    expect(applicationContentInput.parse(request)).toMatchObject({ offset: 0, length: 8000 });
  });

  it("accepts a continuation with a valid content fingerprint", () => {
    expect(
      applicationContentInput.safeParse({ ...request, offset: 8000, fingerprint: "a".repeat(32) })
        .success,
    ).toBe(true);
  });

  it.each([
    { reason: "a negative offset", range: { offset: -1 } },
    { reason: "an offset above the supported limit", range: { offset: 2147483647 } },
    { reason: "an empty content slice", range: { length: 0 } },
    { reason: "more than 8,000 characters", range: { length: 8001 } },
    { reason: "an invalid fingerprint", range: { fingerprint: "invalid" } },
  ])("rejects $reason", ({ range }) => {
    expect(applicationContentInput.safeParse({ ...request, ...range }).success).toBe(false);
  });
});
