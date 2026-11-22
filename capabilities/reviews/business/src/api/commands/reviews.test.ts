import { expect, expectTypeOf, it } from "vite-plus/test";

import { materialVersionSchema, type MaterialVersion } from "@merit/applications/domain";
import type { CriteriaVersion } from "@merit/rounds/domain";

import { compareReviewVersions } from "../../domain/basis";
import { reviewChangeSchema } from "../../domain/reviews";
import { reviewRevisionSchema, type ReviewRevision } from "../../domain/versions";
import { saveReviewRequestSchema } from "./reviews";

it("keeps sequence types distinct while retaining numeric wire values", () => {
  const request = saveReviewRequestSchema.parse({
    workspaceSlug: "alder",
    publicId: "b8q3w5j7c2df",
    expectedRevision: 0,
    expectedApplicationVersion: 1,
    expectedCriteriaVersion: 2,
    change: { action: "cancel", id: "2c343adf-a49f-50bd-8d8d-6c676aec4bdc" },
  });
  expectTypeOf(request.expectedRevision).toEqualTypeOf<ReviewRevision>();
  expectTypeOf(request.expectedApplicationVersion).toEqualTypeOf<MaterialVersion>();
  expectTypeOf(request.expectedCriteriaVersion).toEqualTypeOf<CriteriaVersion>();
  expectTypeOf<MaterialVersion>().not.toMatchTypeOf<CriteriaVersion>();
  expectTypeOf<MaterialVersion>().not.toMatchTypeOf<ReviewRevision>();
  expectTypeOf<CriteriaVersion>().not.toMatchTypeOf<ReviewRevision>();
  expectTypeOf<number>().not.toMatchTypeOf<MaterialVersion>();
  expectTypeOf<number>().not.toMatchTypeOf<CriteriaVersion>();
  expectTypeOf<number>().not.toMatchTypeOf<ReviewRevision>();
  expect(JSON.parse(JSON.stringify(request))).toEqual(request);
  expect(
    compareReviewVersions(request.expectedApplicationVersion, materialVersionSchema.parse(1)),
  ).toBe("same");
  // @ts-expect-error Criteria and material versions cannot be compared as one sequence.
  compareReviewVersions(request.expectedApplicationVersion, request.expectedCriteriaVersion);
});

it.each(["expectedApplicationVersion", "expectedCriteriaVersion"] as const)(
  "requires %s when saving a review",
  (field) => {
    const request = {
      workspaceSlug: "alder",
      publicId: "b8q3w5j7c2df",
      expectedRevision: 0,
      expectedApplicationVersion: 1,
      expectedCriteriaVersion: 1,
      change: { action: "cancel", id: "2c343adf-a49f-50bd-8d8d-6c676aec4bdc" },
    };

    expect(saveReviewRequestSchema.safeParse(request).success).toBe(true);
    expect(saveReviewRequestSchema.safeParse({ ...request, [field]: undefined }).success).toBe(
      false,
    );
  },
);

it("uses the same UUID for a request and its later cancellation", () => {
  const id = "ABCDEF00-0000-4000-8000-000000000001";
  const request = { action: "request", id, contactId: id, replacesId: null };
  expect(reviewChangeSchema.parse(request).id).toBe(id.toLowerCase());
  expect(reviewChangeSchema.parse({ action: "cancel", id }).id).toBe(id.toLowerCase());
  expect(reviewChangeSchema.safeParse({ action: "cancel", id: "request" }).success).toBe(false);
});

it.each([-1, 1.5, NaN, Infinity, "1"])("rejects invalid review revision %s", (value) => {
  expect(reviewRevisionSchema.safeParse(value).success).toBe(false);
});
