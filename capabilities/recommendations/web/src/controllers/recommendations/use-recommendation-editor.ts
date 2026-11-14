import { useLayoutEffect, useState } from "react";

import type { ApplicationView as Application } from "@merit/grantmaking/api";
import type { Recommendation } from "@merit/recommendations/domain";

import type {
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
  application: Application;
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
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  useLayoutEffect(() => {
    if (isOpen && ready && !draft) {
      onDraftChange(initialDraft);
    }
  }, [isOpen, ready, draft, onDraftChange, initialDraft]);

  const close = async (discard = false) => {
    setIsOpen(false);
    await onClose();
    if (ready && (discard || JSON.stringify(draft) === JSON.stringify(initialDraft))) {
      onDraftChange(undefined);
    }
  };

  const save = async (value: Recommendation) => {
    setIsSaving(true);
    let failure: RecommendationFailure | null;
    try {
      failure = await onSave(value);
    } catch {
      failure = { status: "unavailable" };
    }
    setIsSaving(false);
    return failure;
  };

  return {
    isOpen,
    isSaving,
    canResume: Boolean(draft) && !isOpen,
    close,
    save,
    open: () => setIsOpen(true),
  };
};
