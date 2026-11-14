import { createContext, useContext, useMemo } from "react";

import { useDrafts } from "@merit/drafts";

import type { RecommendationBaseline, RecommendationDraft } from "../../contracts/recommendations";
import { recommendationStorage } from "./storage";

type Draft = { value: RecommendationDraft; baseline: RecommendationBaseline };

export const DraftContext = createContext<{
  ready: boolean;
  drafts: Record<string, Draft | undefined>;
  setDraft: (
    key: string,
    value: RecommendationDraft | undefined,
    baseline: RecommendationBaseline,
  ) => void;
  clearDrafts: () => void;
} | null>(null);

export const useRecommendationDraftStore = (storageScope?: string) => {
  const {
    drafts,
    update: setDrafts,
    storageUnavailable: unavailable,
    ready,
    status,
  } = useDrafts(storageScope, "recommendations", { version: 1, schema: recommendationStorage });

  return {
    unavailable,
    ready,
    status,
    value: useMemo(
      () => ({
        ready,
        drafts,
        setDraft: (
          key: string,
          value: RecommendationDraft | undefined,
          baseline: RecommendationBaseline,
        ) =>
          setDrafts((current) => ({
            ...current,
            [key]: value ? { value, baseline: current[key]?.baseline ?? baseline } : undefined,
          })),
        clearDrafts: () => setDrafts(() => ({})),
      }),
      [drafts, setDrafts, ready],
    ),
  };
};

export const useRecommendationDrafts = () => {
  const value = useContext(DraftContext);
  if (!value) {
    throw new Error("GrantmakingDrafts is required");
  }
  return value;
};
