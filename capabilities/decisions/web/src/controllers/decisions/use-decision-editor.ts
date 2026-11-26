import { useLayoutEffect, useState } from "react";

import type { DecisionInput, DecisionVersion } from "@merit/decisions/domain";
import type { ApplicationView as Application } from "@merit/grantmaking/api";

import type { DecisionDraft, DecisionFailure, SaveDecision } from "../../contracts/decisions";
import { decisionDraft } from "./form-state";

export const useDecisionEditor = ({
  application,
  current,
  ready = true,
  draft,
  onDraftChange,
  onSave,
  onClose,
}: {
  application: Application;
  current: DecisionVersion | undefined;
  ready?: boolean;
  draft?: DecisionDraft;
  onDraftChange: (draft: DecisionDraft | undefined) => void;
  onSave: SaveDecision;
  onClose: () => void | Promise<void>;
}) => {
  const initialDraft = decisionDraft(current?.decision ?? null, application.managerRecommendation);
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

  const save = async (value: DecisionInput) => {
    setIsSaving(true);
    let failure: DecisionFailure | null;
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
