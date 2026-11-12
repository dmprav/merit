import { useState } from "react";

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
  draft,
  onDraftChange,
  onSave,
  onClose,
}: {
  application: Application;
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
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isOpen = isEditing && Boolean(draft);

  const close = async (discard = false) => {
    await onClose();
    setIsEditing(false);
    if (discard || JSON.stringify(draft) === JSON.stringify(initialDraft)) {
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
    isEditing,
    isSaving,
    isOpen,
    canResume: Boolean(draft) && !isOpen,
    close,
    save,
    open: () => {
      if (!draft) {
        onDraftChange(initialDraft);
      }
      setIsEditing(true);
    },
  };
};
