import { useLayoutEffect, useRef, useState } from "react";

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
  // The latest draft, so cleanup after an awaited close sees writing entered since.
  const latestDraft = useRef(draft);

  useLayoutEffect(() => {
    latestDraft.current = draft;
  }, [draft]);

  useLayoutEffect(() => {
    if (isOpen && ready && !draft) {
      onDraftChange(initialDraft);
    }
  }, [isOpen, ready, draft, onDraftChange, initialDraft]);

  const close = async (discard = false) => {
    const closing = JSON.stringify(draft);
    setIsOpen(false);
    await onClose();
    // A draft written after the editor reopened while onClose was pending is not this close's to clear.
    const current = JSON.stringify(latestDraft.current);
    const unchanged = current === closing;
    if (ready && unchanged && (discard || current === JSON.stringify(initialDraft))) {
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
