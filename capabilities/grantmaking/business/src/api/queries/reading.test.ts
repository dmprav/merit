import { describe, expect, it } from "vite-plus/test";

import { applicationContentInput, roundListInput } from "./reading";

const workspaceSlug = "alder";
const applicationId = "0123456789ab";

describe("round list requests", () => {
  it("defaults to a page of 20 rounds", () => {
    expect(roundListInput.parse({ workspaceSlug }).limit).toBe(20);
  });

  it.each([0, 51, 1.5])("rejects page size %s", (limit) => {
    expect(roundListInput.safeParse({ workspaceSlug, limit }).success).toBe(false);
  });
});

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
