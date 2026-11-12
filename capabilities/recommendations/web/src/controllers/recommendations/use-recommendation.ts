import { useState } from "react";

import type { ApplicationView as Application } from "@merit/grantmaking/api";
import type { Recommendation } from "@merit/recommendations/domain";

import type {
  RecommendationData,
  RecommendationDraft,
  RecommendationFailure,
} from "../../contracts/recommendations";
import { useRecommendationDrafts } from "./recommendation-drafts";

export const useRecommendation = (
  applicationKey: string,
  application: Application,
  data: RecommendationData,
) => {
  const { drafts, setDraft } = useRecommendationDrafts();
  const [saved, setSaved] = useState(0);
  const draft = drafts[applicationKey];
  const baseline = {
    expectedRevision: data.revision,
    expectedApplicationVersion: application.version,
  };

  const save = async (value: Recommendation): Promise<RecommendationFailure | null> => {
    try {
      const response = await data.save(value, draft?.baseline ?? baseline);
      if (response.status === "ok") {
        setSaved((count) => count + 1);
        return null;
      }
      return response;
    } catch {
      return { status: "unavailable" };
    }
  };

  return {
    draft: draft?.value,
    saved,
    save,
    updateDraft: (value: RecommendationDraft | undefined) =>
      setDraft(applicationKey, value, baseline),
  };
};
