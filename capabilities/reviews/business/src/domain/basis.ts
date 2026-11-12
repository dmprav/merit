import { z } from "zod";

import type { MaterialVersion } from "@merit/applications/domain";
import { type CriteriaVersion, type reviewCriteriaSchema } from "@merit/rounds/domain";

/** Versions belong to the same application and round; null means unavailable. */
export type ReviewBasis = {
  applicationVersion: MaterialVersion | null;
  criteriaVersion: CriteriaVersion | null;
  criteria: z.infer<typeof reviewCriteriaSchema> | null;
};

const comparisonSchema = z.enum(["same", "different", "unknown"]);
export const reviewBasisComparisonSchema = z.object({
  applicationVersion: comparisonSchema,
  criteriaVersion: comparisonSchema,
  criteriaContent: comparisonSchema,
});

export type ReviewBasisComparison = z.infer<typeof reviewBasisComparisonSchema>;

export const compareReviewVersions = <Version extends MaterialVersion | CriteriaVersion>(
  recorded: Version | null,
  current: NoInfer<Version> | null,
): z.infer<typeof comparisonSchema> =>
  recorded === null || current === null ? "unknown" : recorded === current ? "same" : "different";

export const sameCriteria = (
  left: z.infer<typeof reviewCriteriaSchema>,
  right: z.infer<typeof reviewCriteriaSchema>,
) =>
  JSON.stringify(left.map((value) => [value.title, value.description ?? ""])) ===
  JSON.stringify(right.map((value) => [value.title, value.description ?? ""]));

export const compareCriteriaContent = (
  recorded: ReviewBasis["criteria"],
  current: ReviewBasis["criteria"],
): z.infer<typeof comparisonSchema> =>
  recorded === null || current === null
    ? "unknown"
    : sameCriteria(recorded, current)
      ? "same"
      : "different";

export const compareReviewBasis = (
  recorded: ReviewBasis,
  current: ReviewBasis,
): ReviewBasisComparison => ({
  applicationVersion: compareReviewVersions(
    recorded.applicationVersion,
    current.applicationVersion,
  ),
  criteriaVersion: compareReviewVersions(recorded.criteriaVersion, current.criteriaVersion),
  criteriaContent: compareCriteriaContent(recorded.criteria, current.criteria),
});

/** A known difference takes precedence over unknown facts. Criteria revisions alone do not age a review. */
export const reviewFreshness = (
  basis: Pick<ReviewBasisComparison, "applicationVersion" | "criteriaContent">,
): "current" | "outdated" | "unknown" => {
  if (basis.applicationVersion === "different" || basis.criteriaContent === "different") {
    return "outdated";
  }
  if (basis.applicationVersion === "unknown" || basis.criteriaContent === "unknown") {
    return "unknown";
  }
  return "current";
};
