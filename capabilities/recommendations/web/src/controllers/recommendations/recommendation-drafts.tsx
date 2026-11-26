import { createKeyedDrafts } from "@merit/drafts";

import type { RecommendationBaseline, RecommendationDraft } from "../../contracts/recommendations";
import { recommendationStorage } from "./storage";

const drafts = createKeyedDrafts<RecommendationDraft, RecommendationBaseline>(
  "recommendations",
  recommendationStorage,
);

export const DraftContext = drafts.DraftContext;
export const useRecommendationDraftStore = drafts.useDraftStore;
export const useRecommendationDrafts = drafts.useKeyedDrafts;
