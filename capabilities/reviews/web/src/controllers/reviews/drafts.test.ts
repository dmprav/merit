import { expect, expectTypeOf, it } from "vite-plus/test";

import type { MaterialVersion } from "@merit/applications/domain";
import type { ReviewRevision } from "@merit/reviews/domain";
import type { CriteriaVersion } from "@merit/rounds/domain";

import type { ReviewBaseline } from "../../contracts/reviews";
import { reviewDraftSchema } from "./drafts";

const stored = {
  mode: "edit",
  id: "assessment",
  replacesId: null,
  revision: 0,
  applicationVersion: 2,
  criteriaVersion: 3,
  values: {
    contactId: "reviewer",
    applicationVersion: "1",
    criteriaVersion: "unknown",
    date: "",
    position: "unknown",
    amount: "",
    reasoning: "Recovered assessment of earlier material",
    observations: [],
    note: "",
  },
};

it("restores a typed edit baseline independently of the recorded assessment basis", () => {
  const draft = reviewDraftSchema.parse(JSON.parse(JSON.stringify(stored)));
  expect(draft).toEqual(stored);
  expectTypeOf(draft.revision).toEqualTypeOf<ReviewRevision>();
  expectTypeOf(draft.applicationVersion).toEqualTypeOf<MaterialVersion>();
  expectTypeOf(draft.criteriaVersion).toEqualTypeOf<CriteriaVersion>();
  expectTypeOf(draft).toMatchTypeOf<ReviewBaseline>();
});

it.each(["applicationVersion", "criteriaVersion"])(
  "rejects a recovered baseline with a zero %s",
  (field) => {
    expect(reviewDraftSchema.safeParse({ ...stored, [field]: 0 }).success).toBe(false);
  },
);
