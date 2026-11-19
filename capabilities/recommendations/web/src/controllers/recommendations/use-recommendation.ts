import { useState } from "react";

import type { ApplicationView as Application } from "@merit/grantmaking/api";
import type { Recommendation } from "@merit/recommendations/domain";

import type {
  RecommendationData,
  RecommendationDraft,
  RecommendationFailure,
} from "../../contracts/recommendations";
import { useRecommendationDrafts } from "./recommendation-drafts";

export type RecommendationConflict = "basis_changed" | "record_changed";

export const useRecommendation = (
  applicationKey: string,
  application: Application,
  data: RecommendationData,
) => {
  const { drafts, setDraft, ready } = useRecommendationDrafts();
  const [saved, setSaved] = useState(0);
  const [draftReset, setDraftReset] = useState(0);
  const draft = drafts[applicationKey];
  const baseline = {
    expectedRevision: data.revision,
    expectedApplicationVersion: application.version,
  };
  const conflict: RecommendationConflict | null = draft
    ? draft.baseline.expectedApplicationVersion !== application.version
      ? "basis_changed"
      : draft.baseline.expectedRevision !== data.revision
        ? "record_changed"
        : null
    : null;

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
    ready,
    draft: draft?.value,
    conflict,
    draftReset,
    saved,
    save,
    updateDraft: (value: RecommendationDraft | undefined) =>
      setDraft(applicationKey, value, baseline),
    keepDraft: () => {
      if (draft) {
        setDraft(applicationKey, draft.value, baseline, true);
      }
    },
    loadLatest: () => {
      setDraft(applicationKey, undefined, baseline, true);
      setDraftReset((count) => count + 1);
    },
  };
};
