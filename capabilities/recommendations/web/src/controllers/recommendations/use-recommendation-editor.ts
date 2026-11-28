import { useDraftEditor } from "@merit/drafts";
import type { Recommendation } from "@merit/recommendations/domain";

import type {
  RecommendationApplication,
  RecommendationDraft,
  RecommendationFailure,
  SaveRecommendation,
} from "../../contracts/recommendations";
import { recommendationDraft } from "./form-state";

export const useRecommendationEditor = ({
  application,
  ready = true,
  draft,
  onDraftChange,
  onSave,
  onClose,
}: {
  application: RecommendationApplication;
  ready?: boolean;
  draft?: RecommendationDraft;
  onDraftChange: (draft: RecommendationDraft | undefined) => void;
  onSave: SaveRecommendation;
  onClose: () => void | Promise<void>;
}) => {
  const recommendation = application.managerRecommendation;
  const initialDraft = recommendationDraft(recommendation, application.requested);
  if (!recommendation && application.intakeStatus === "in_preparation") {
    initialDraft.position = "Defer";
  }
  return useDraftEditor<RecommendationDraft, Recommendation, RecommendationFailure>({
    initialDraft,
    ready,
    draft,
    onDraftChange,
    onSave,
    onClose,
  });
};
