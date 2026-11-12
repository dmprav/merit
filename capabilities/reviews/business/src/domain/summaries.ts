import type { MaterialVersion } from "@merit/applications/domain";

import { compareReviewVersions, reviewFreshness } from "./basis";

export const assessmentStatus = (
  assessment: {
    criteriaChanged: boolean;
    criteriaUnknown: boolean;
    submission: { applicationVersion: MaterialVersion | null } | null;
  },
  applicationVersion: MaterialVersion,
): "current" | "outdated" | "outstanding" | "unknown" => {
  if (!assessment.submission) {
    return "outstanding";
  }
  return reviewFreshness({
    applicationVersion: compareReviewVersions(
      assessment.submission.applicationVersion,
      applicationVersion,
    ),
    criteriaContent: assessment.criteriaChanged
      ? "different"
      : assessment.criteriaUnknown
        ? "unknown"
        : "same",
  });
};

export const summarizeAssessments = (
  assessments: readonly { status: ReturnType<typeof assessmentStatus> }[],
) => {
  const counts = { current: 0, outdated: 0, outstanding: 0, unknown: 0 };
  for (const assessment of assessments) {
    counts[assessment.status]++;
  }
  return counts;
};
