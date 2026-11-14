import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { compareReviewBasis, reviewFreshness, type ReviewBasis } from "./basis";

const original: ReviewBasis = {
  applicationVersion: materialVersionSchema.parse(1),
  criteriaVersion: criteriaVersionSchema.parse(1),
  criteria: [{ id: "6ab5c8b6-9ad8-5941-b120-30092274597f", title: "Community benefit" }],
};

it("distinguishes criteria version identity from content after A to B to A", () => {
  const changed = {
    ...original,
    criteriaVersion: criteriaVersionSchema.parse(2),
    criteria: [{ id: "dc1f55ac-e713-51a8-8d91-f27f1c3d9959", title: "Feasibility" }],
  };
  expect(reviewFreshness(compareReviewBasis(original, changed))).toBe("outdated");
  const restored = { ...original, criteriaVersion: criteriaVersionSchema.parse(3) };
  const comparison = compareReviewBasis(original, restored);
  expect(comparison).toEqual({
    applicationVersion: "same",
    criteriaVersion: "different",
    criteriaContent: "same",
  });
  expect(reviewFreshness(comparison)).toBe("current");
  expect(original.criteriaVersion).toBe(1);
});

it.each([
  {
    name: "missing recorded criteria",
    recorded: { ...original, criteria: null },
    current: original,
    content: "unknown",
    freshness: "unknown",
  },
  {
    name: "missing current criteria",
    recorded: original,
    current: { ...original, criteria: null },
    content: "unknown",
    freshness: "unknown",
  },
  {
    name: "known empty criteria",
    recorded: { ...original, criteria: [] },
    current: { ...original, criteria: [] },
    content: "same",
    freshness: "current",
  },
  {
    name: "new application and unknown criteria",
    recorded: { ...original, criteria: null },
    current: { ...original, applicationVersion: materialVersionSchema.parse(2) },
    content: "unknown",
    freshness: "outdated",
  },
  {
    name: "unknown application and changed criteria",
    recorded: { ...original, applicationVersion: null },
    current: { ...original, criteria: [] },
    content: "different",
    freshness: "outdated",
  },
  {
    name: "unknown recorded application",
    recorded: { ...original, applicationVersion: null },
    current: original,
    content: "same",
    freshness: "unknown",
  },
  {
    name: "unknown current application",
    recorded: original,
    current: { ...original, applicationVersion: null },
    content: "same",
    freshness: "unknown",
  },
])("handles $name without guessing the basis", ({ recorded, current, content, freshness }) => {
  const comparison = compareReviewBasis(recorded, current);
  expect(comparison.criteriaContent).toBe(content);
  expect(reviewFreshness(comparison)).toBe(freshness);
});

it("keeps version identity unknown even when content can be compared", () => {
  const comparison = compareReviewBasis({ ...original, criteriaVersion: null }, original);
  expect(comparison.criteriaVersion).toBe("unknown");
  expect(comparison.criteriaContent).toBe("same");
  expect(reviewFreshness(comparison)).toBe("current");
});

it("compares ordered titles and descriptions exactly, normalizing absent descriptions", () => {
  const recorded = {
    ...original,
    criteria: [
      { id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" },
      { id: "dc1f55ac-e713-51a8-8d91-f27f1c3d9959", title: "Feasibility", description: "Plan" },
    ],
  };
  expect(
    compareReviewBasis(recorded, {
      ...recorded,
      criteria: [
        { id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit", description: "" },
        { id: "dc1f55ac-e713-51a8-8d91-f27f1c3d9959", title: "Feasibility", description: "Plan" },
      ],
    }).criteriaContent,
  ).toBe("same");
  for (const criteria of [
    [...recorded.criteria].reverse(),
    [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" }],
    [
      { id: "3761c90d-bf5a-5cdc-a37c-47c838eb5222", title: "fit" },
      { id: "dc1f55ac-e713-51a8-8d91-f27f1c3d9959", title: "Feasibility", description: "Plan" },
    ],
    [
      { id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" },
      { id: "dc1f55ac-e713-51a8-8d91-f27f1c3d9959", title: "Feasibility", description: "Plan " },
    ],
    [
      { id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" },
      { id: "dc1f55ac-e713-51a8-8d91-f27f1c3d9959", title: "Feasibility" },
    ],
  ]) {
    expect(compareReviewBasis(recorded, { ...recorded, criteria }).criteriaContent).toBe(
      "different",
    );
  }
});

it("does not treat technical criterion identity as a change in assessment content", () => {
  const criteria = [{ id: "20000000-0000-4000-8000-000000000001", title: "Community benefit" }];
  expect(reviewFreshness(compareReviewBasis(original, { ...original, criteria }))).toBe("current");
});
