import { useLayoutEffect, useState } from "react";

type Unavailable = { status: "unavailable" };

/**
 * Opens, closes, and saves a draft-backed editor. Opening seeds the draft with `initialDraft`
 * once the store is ready; closing an untouched draft, or discarding one, removes it so no
 * recovery indicator remains. A save that throws reports `unavailable` and keeps the draft.
 */
export const useDraftEditor = <Draft, Input, Failure>({
  initialDraft,
  ready = true,
  draft,
  onDraftChange,
  onSave,
  onClose,
}: {
  initialDraft: Draft;
  ready?: boolean;
  draft?: Draft;
  onDraftChange: (draft: Draft | undefined) => void;
  onSave: (value: Input) => Failure | null | Promise<Failure | null>;
  onClose: () => void | Promise<void>;
}) => {
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

  const save = async (value: Input) => {
    setIsSaving(true);
    let failure: Failure | Unavailable | null;
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
