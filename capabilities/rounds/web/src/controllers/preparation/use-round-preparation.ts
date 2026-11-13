import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { RoundView } from "@merit/grantmaking/api";
import { useWorkflowRefresh } from "@merit/query/refresh";

import type { PreparationData, PreparationFailure } from "../../contracts/preparation";
import { usePreparationDrafts } from "./drafts";
import {
  draftChange,
  preparationDraft,
  hasPreparationDraft,
  hasPreparationChanges,
  type PreparationDraft,
  type PreparationSection,
} from "./preparation-state";

export type PreparationProblem = PreparationFailure | { status: "busy" };

type UseRoundPreparationOptions = {
  round: RoundView;
  data: PreparationData;
  onDeleted: () => Promise<void>;
  onRestoreFocus: (section: PreparationSection | null) => void;
};

// oxlint-disable-next-line max-lines-per-function -- Editing, save, undo, and deletion coordinate the same busy guard and drafts.
export const useRoundPreparation = ({
  round,
  data,
  onDeleted,
  onRestoreFocus,
}: UseRoundPreparationOptions) => {
  const { edits, setEdit } = usePreparationDrafts();
  const [editing, setEditing] = useState<PreparationSection | null>(null);
  const [error, setError] = useState<PreparationProblem | null>(null);
  const [pending, setPending] = useState(false);
  const busyRef = useRef(false);

  const [undo, setUndo] = useState<{ revision: number; draft: PreparationDraft } | null>(null);
  const [feedback, setFeedback] = useState<{ event: number; outcome: "saved" | "undone" | null }>({
    event: 0,
    outcome: null,
  });
  const { refresh, refreshError } = useWorkflowRefresh((context) =>
    context === "saved" ? data.refresh() : data.refreshCurrent(),
  );

  const key = (section: PreparationSection) => `${data.draftKey}/${section}`;

  const draftFor = <S extends PreparationSection>(section: S) =>
    edits[key(section)] as Extract<PreparationDraft, { section: S }> | undefined;

  const updateDraft = (draft: PreparationDraft) => setEdit(key(draft.section), draft);

  const close = ({ restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
    if (busyRef.current) {
      return;
    }

    const section = editing;
    setEditing(null);
    if (section && restoreFocus) {
      onRestoreFocus(section);
    }
  };

  const open = (section: PreparationSection) => {
    if (busyRef.current) {
      return;
    }

    const draft = draftFor(section);
    if (!draft || !hasPreparationDraft(draft)) {
      updateDraft(preparationDraft(section, round, data.state.revision) as PreparationDraft);
    }
    setError(null);
    setEditing(section);
  };

  const discard = (section: PreparationSection) => {
    setEdit(key(section), undefined);
    close();
  };

  const editMutation = useMutation({
    mutationFn: (draft: PreparationDraft) => data.save(draftChange(draft), draft.revision),
  });

  const save = async (
    draft: PreparationDraft,
    mode: "form" | "quick" | "undo" = "form",
  ): Promise<PreparationProblem | null> => {
    if (busyRef.current) {
      return { status: "busy" };
    }
    if (mode === "form" && draft.revision !== data.state.revision) {
      return { status: "conflict" };
    }
    if (mode === "form" && !hasPreparationChanges(draft)) {
      return null;
    }

    busyRef.current = true;
    setPending(true);
    setError(null);

    let saveError: PreparationProblem | null = null;
    try {
      const result = await editMutation.mutateAsync(draft);
      if (result.status !== "ok") {
        saveError = result;
        setError(saveError);
        if (result.status === "conflict" || result.status === "invalid") {
          await refresh("read");
        }
      } else {
        setUndo(
          mode === "quick" && result.revision !== draft.revision
            ? {
                revision: result.revision,
                draft: preparationDraft(
                  draft.section,
                  round,
                  data.state.revision,
                ) as PreparationDraft,
              }
            : null,
        );
        setEdit(key(draft.section), undefined);
        setEditing(null);
        setFeedback((previous) => ({
          event: previous.event + 1,
          outcome: mode === "undo" ? "undone" : "saved",
        }));

        // A committed save stays successful even when the subsequent read fails.
        await refresh("saved");
      }
    } catch {
      saveError = { status: "unavailable" };
      setError(saveError);
    }

    busyRef.current = false;
    setPending(false);
    if (!saveError) {
      onRestoreFocus(draft.section);
    }

    return saveError;
  };

  const deleteMutation = useMutation({ mutationFn: data.delete });
  const [deleteRevision, setDeleteRevision] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<PreparationProblem | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [navigationFailed, setNavigationFailed] = useState(false);

  const setDeleting = (open: boolean) => {
    if (busyRef.current || deleted) {
      return;
    }

    setDeleteRevision(open ? data.state.revision : null);
    setDeleteError(null);
    if (!open) {
      onRestoreFocus(null);
    }
  };

  const leaveDeletedRound = async () => {
    setNavigationFailed(false);
    try {
      await onDeleted();
    } catch {
      setNavigationFailed(true);
    }
  };

  const returnToRounds = async () => {
    if (busyRef.current || !deleted) {
      return;
    }

    busyRef.current = true;
    setPending(true);
    await leaveDeletedRound();
    busyRef.current = false;
    setPending(false);
  };

  const confirmDelete = async () => {
    if (busyRef.current || deleted || deleteRevision === null) {
      return;
    }

    busyRef.current = true;
    setPending(true);
    setDeleteError(null);

    try {
      const result = await deleteMutation.mutateAsync(deleteRevision);
      if (result.status !== "ok") {
        setDeleteError(result);
        await refresh("read");
      } else {
        setDeleted(true);
        setDeleteRevision(null);
        setEditing(null);
        setUndo(null);
        clearPreparationDrafts(setEdit, key);

        await leaveDeletedRound();
      }
    } catch {
      setDeleteError({ status: "unavailable" });
    }

    busyRef.current = false;
    setPending(false);
  };

  return {
    round,
    revision: data.state.revision,
    budgetHistory: data.state.budgetHistory,
    historySource: data.historySource,
    managers: data.state.managers,
    editing,
    pending,
    error,
    undo,
    feedback,
    refreshError,
    deleting: deleteRevision !== null,
    deleteError,
    deleted,
    navigationFailed,
    returnToRounds,
    setDeleting,
    confirmDelete,
    draftFor,
    updateDraft,
    open,
    close,
    discard,
    saveDraft: (draft: PreparationDraft) => save(draft),
    renameRound: (title: string) =>
      save({ ...preparationDraft("title", round, data.state.revision), value: { title } }, "quick"),
    changeMeetingDate: (meetingDate: string | null) =>
      save(
        {
          ...(draftFor("meetingDate") ??
            preparationDraft("meetingDate", round, data.state.revision)),
          value: { meetingDate: meetingDate ?? "" },
        },
        "quick",
      ),
    assignManager: (userId: string) =>
      save(
        {
          ...(draftFor("manager") ?? preparationDraft("manager", round, data.state.revision)),
          value: { userId },
        },
        "quick",
      ),

    refresh,
    dismissUndo: () => setUndo(null),
    undoSave: () =>
      undo ? save({ ...undo.draft, revision: undo.revision }, "undo") : Promise.resolve(null),
  };
};

const clearPreparationDrafts = (
  setEdit: ReturnType<typeof usePreparationDrafts>["setEdit"],
  key: (section: PreparationSection) => string,
) => {
  for (const section of [
    "title",
    "purpose",
    "meetingDate",
    "criteria",
    "budget",
    "manager",
  ] as const) {
    setEdit(key(section), undefined);
  }
};
