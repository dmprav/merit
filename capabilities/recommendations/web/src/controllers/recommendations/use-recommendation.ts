import { useState } from "react";

import type { MaterialVersion } from "@merit/applications/domain";
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
  applicationVersion: MaterialVersion,
  data: RecommendationData,
) => {
  const { drafts, conflicts, resolveConflict, setDraft, ready } = useRecommendationDrafts();
  const [saved, setSaved] = useState(0);
  const [draftReset, setDraftReset] = useState(0);
  const draft = drafts[applicationKey];
  const baseline = {
    expectedRevision: data.revision,
    expectedApplicationVersion: applicationVersion,
  };
  const storeConflict = conflicts.has(applicationKey);
  const serverConflict: RecommendationConflict | null = draft
    ? draft.baseline.expectedApplicationVersion !== applicationVersion
      ? "basis_changed"
      : draft.baseline.expectedRevision !== data.revision
        ? "record_changed"
        : null
    : null;
  const conflict: RecommendationConflict | null =
    serverConflict ?? (storeConflict ? "record_changed" : null);

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
      if (!draft) {
        return;
      }
      if (serverConflict) {
        setDraft(applicationKey, draft.value, baseline, true);
      }
      if (storeConflict) {
        void resolveConflict(applicationKey, "keep");
      }
    },
    loadLatest: () => {
      if (storeConflict) {
        void Promise.resolve(resolveConflict(applicationKey, "use_stored")).then(() =>
          setDraftReset((count) => count + 1),
        );
        return;
      }
      setDraft(applicationKey, undefined, baseline, true);
      setDraftReset((count) => count + 1);
    },
  };
};
