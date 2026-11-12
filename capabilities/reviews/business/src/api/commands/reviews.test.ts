import { expect, expectTypeOf, it } from "vite-plus/test";

import { materialVersionSchema, type MaterialVersion } from "@merit/applications/domain";
import { criteriaVersionSchema, type CriteriaVersion } from "@merit/rounds/domain";

import { compareReviewVersions } from "../../domain/basis";
import { reviewRevisionSchema, type ReviewRevision } from "../../domain/versions";
import { saveReviewRequestSchema } from "./reviews";

it("keeps sequence types distinct while retaining numeric wire values", () => {
  const request = saveReviewRequestSchema.parse({
    workspaceSlug: "alder",
    publicId: "b8q3w5j7c2df",
    expectedRevision: 0,
    expectedApplicationVersion: 1,
    expectedCriteriaVersion: 2,
    change: { action: "cancel", id: "request" },
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

it.each([0, -1, 1.5, NaN, Infinity, "1"])("rejects invalid evidence version %s", (value) => {
  expect(materialVersionSchema.safeParse(value).success).toBe(false);
  expect(criteriaVersionSchema.safeParse(value).success).toBe(false);
});

it.each([-1, 1.5, NaN, Infinity, "1"])("rejects invalid review revision %s", (value) => {
  expect(reviewRevisionSchema.safeParse(value).success).toBe(false);
});
