import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type { ReviewData, ReviewTransport } from "../../contracts/reviews";

type ReviewSource = { save: ReviewTransport; grantWorkScope: QueryKey };

export const createReviewData = (
  client: QueryClient,
  target: { workspaceSlug: string; publicId: string },
  source: ReviewSource,
): ReviewData => {
  const { workspaceSlug, publicId } = target;
  return {
    draftKey: `${workspaceSlug}/${publicId}`,
    workspaceSlug,
    save: (change, baseline) =>
      source.save({
        workspaceSlug,
        publicId,
        change,
        expectedRevision: baseline.revision,
        expectedApplicationVersion: baseline.applicationVersion,
        expectedCriteriaVersion: baseline.criteriaVersion,
      }),
    refresh: () =>
      client.invalidateQueries({ queryKey: source.grantWorkScope }, { throwOnError: true }),
  };
};
