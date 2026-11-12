import { describe, expect, it } from "vite-plus/test";

import {
  createApplicationRequestSchema,
  editApplicationRequestSchema,
  selectContactRequestSchema,
} from "@merit/applications/api";
import { saveReviewRequestSchema } from "@merit/reviews/api";
import { createRoundRequestSchema, editRoundRequestSchema } from "@merit/rounds/api";

const workspaceSlug = "alder";
const publicId = "0123456789ab";
const requestId = "01a1bf9d-aa6f-7b30-9015-bcabb7406cbc";

describe("grantmaking command inputs", () => {
  it.each([undefined, "", "0", "12.34"])("accepts an optional nonnegative budget: %j", (budget) => {
    expect(
      createRoundRequestSchema.parse({ workspaceSlug, requestId, title: "Round", budget }).budget,
    ).toBe(budget);
  });

  it.each(["-1", "1.001", "1e3", "9".repeat(33)])("rejects an invalid budget: %s", (budget) => {
    expect(
      createRoundRequestSchema.safeParse({ workspaceSlug, requestId, title: "Round", budget })
        .success,
    ).toBe(false);
  });

  it("normalizes a requested amount while preserving an unknown amount", () => {
    const request = { workspaceSlug, publicId, requestId, title: "Application" };

    expect(createApplicationRequestSchema.parse(request).requested).toBeUndefined();
    expect(createApplicationRequestSchema.parse({ ...request, requested: "" }).requested).toBe("");
    expect(createApplicationRequestSchema.parse({ ...request, requested: "12.3" }).requested).toBe(
      "12.30",
    );
    expect(createApplicationRequestSchema.safeParse({ ...request, requested: "-1" }).success).toBe(
      false,
    );
  });

  it.each([
    { schema: editRoundRequestSchema, change: { section: "details", title: "Updated" } },
    { schema: editApplicationRequestSchema, change: { action: "mark_ready" } },
  ])("requires a nonnegative integer edit revision: $change", ({ schema, change }) => {
    const request = { workspaceSlug, publicId, change };

    expect(schema.safeParse({ ...request, expectedRevision: 0 }).success).toBe(true);
    for (const expectedRevision of [undefined, -1, 0.5]) {
      expect(schema.safeParse({ ...request, expectedRevision }).success).toBe(false);
    }
  });

  it("requires both evidence versions when saving a review", () => {
    const request = {
      workspaceSlug,
      publicId,
      expectedRevision: 0,
      expectedApplicationVersion: 1,
      expectedCriteriaVersion: 1,
      change: { action: "cancel", id: requestId },
    };

    expect(saveReviewRequestSchema.safeParse(request).success).toBe(true);
    for (const field of ["expectedApplicationVersion", "expectedCriteriaVersion"] as const) {
      for (const value of [undefined, 0, 0.5]) {
        expect(saveReviewRequestSchema.safeParse({ ...request, [field]: value }).success).toBe(
          false,
        );
      }
    }
  });

  it("distinguishes clearing a contact from an invalid contact identifier", () => {
    const request = { workspaceSlug, publicId, expectedRevision: 0 };

    expect(selectContactRequestSchema.parse({ ...request, contactId: null }).contactId).toBeNull();
    expect(selectContactRequestSchema.parse({ ...request, contactId: requestId }).contactId).toBe(
      requestId,
    );
    expect(selectContactRequestSchema.safeParse({ ...request, contactId: "" }).success).toBe(false);
  });
});
