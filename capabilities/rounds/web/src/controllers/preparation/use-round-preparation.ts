import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useWorkflowRefresh } from "@merit/query/refresh";

import type {
  PreparationData,
  PreparationFailure,
  PreparationRound,
} from "../../contracts/preparation";
import { usePreparationDrafts } from "./drafts";
import {
  draftChange,
  preparationDraft,
  hasPreparationDraft,
  hasPreparationChanges,
  hasPreparationSectionConflict,
  rebasePreparationDraft,
  type PreparationDraft,
  type PreparationSection,
} from "./preparation-state";

export type PreparationProblem = PreparationFailure | { status: "busy" };

type UseRoundPreparationOptions = {
  round: PreparationRound;
  data: PreparationData;
  onDeleted: () => Promise<void>;
  onRestoreFocus: (section: PreparationSection | null) => void;
};

const keepPreparationDraft = ({
  draft,
  round,
  revision,
  hasConflict,
  draftKey,
  updateDraft,
  resolveConflict,
}: {
  draft: PreparationDraft | undefined;
  round: PreparationRound;
  revision: number;
  hasConflict: boolean;
  draftKey: string;
  updateDraft: (draft: PreparationDraft) => void;
  resolveConflict: (key: string, choice: "keep" | "use_stored") => Promise<void> | void;
}) => {
  if (!draft) {
    return;
  }
  if (draft.revision !== revision) {
    updateDraft(rebasePreparationDraft(draft, round, revision));
  }
  if (hasConflict) {
    void resolveConflict(draftKey, "keep");
  }
};

const loadLatestPreparationDraft = ({
  section,
  round,
  revision,
  hasConflict,
  draftKey,
  updateDraft,
  resolveConflict,
  onResolved,
}: {
  section: PreparationSection;
  round: PreparationRound;
  revision: number;
  hasConflict: boolean;
  draftKey: string;
  updateDraft: (draft: PreparationDraft) => void;
  resolveConflict: (key: string, choice: "keep" | "use_stored") => Promise<void> | void;
  onResolved: () => void;
}) => {
  if (hasConflict) {
    void Promise.resolve(resolveConflict(draftKey, "use_stored")).then(onResolved);
    return;
  }
  updateDraft(preparationDraft(section, round, revision) as PreparationDraft);
  onResolved();
};

const preparePreparationFormDraft = ({
  draft,
  round,
  revision,
  hasConflict,
  updateDraft,
  onAlreadyApplied,
}: {
  draft: PreparationDraft;
  round: PreparationRound;
  revision: number;
  hasConflict: boolean;
  updateDraft: (draft: PreparationDraft) => void;
  onAlreadyApplied: (draft: PreparationDraft) => void;
}) => {
  if (hasConflict) {
    return { current: draft, problem: { status: "conflict" as const } };
  }
  if (!hasPreparationChanges(draft)) {
    return null;
  }
  if (draft.revision === revision) {
    return { current: draft, problem: null };
  }
  if (hasPreparationSectionConflict(draft, round)) {
    return { current: draft, problem: { status: "conflict" as const } };
  }
  const rebased = rebasePreparationDraft(draft, round, revision);
  updateDraft(rebased);
  if (!hasPreparationChanges(rebased)) {
    onAlreadyApplied(rebased);
    return null;
  }
  return { current: rebased, problem: null };
};

type RoundDeletionOptions = {
  ready: boolean;
  revision: number;
  busyRef: RefObject<boolean>;
  setPending: (pending: boolean) => void;
  refresh: (context: "read" | "saved") => Promise<void>;
  onDelete: PreparationData["delete"];
  onDeleted: () => Promise<void>;
  onRestoreFocus: (section: PreparationSection | null) => void;
  onCommitted: () => void;
};

const useRoundDeletion = ({
  ready,
  revision,
  busyRef,
  setPending,
  refresh,
  onDelete,
  onDeleted,
  onRestoreFocus,
  onCommitted,
}: RoundDeletionOptions) => {
  const deleteMutation = useMutation({ mutationFn: onDelete });
  const [deleteRevision, setDeleteRevision] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<PreparationProblem | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [navigationFailed, setNavigationFailed] = useState(false);

  const setDeleting = (open: boolean) => {
    if (busyRef.current || deleted) {
      return;
    }
    setDeleteRevision(open ? revision : null);
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
    if (busyRef.current || !ready || deleted || deleteRevision === null) {
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
        onCommitted();
        await leaveDeletedRound();
      }
    } catch {
      setDeleteError({ status: "unavailable" });
    }
    busyRef.current = false;
    setPending(false);
  };

  return {
    deleting: deleteRevision !== null,
    deleteError,
    deleted,
    navigationFailed,
    returnToRounds,
    setDeleting,
    confirmDelete,
  };
};

// oxlint-disable-next-line max-lines-per-function -- Editing, save, and undo coordinate the same busy guard and drafts.
export const useRoundPreparation = ({
  round,
  data,
  onDeleted,
  onRestoreFocus,
}: UseRoundPreparationOptions) => {
  const { edits, setEdit, ready, conflicts, resolveConflict } = usePreparationDrafts();
  const [editing, setEditing] = useState<PreparationSection | null>(null);
  const [draftReset, setDraftReset] = useState(0);
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

  useEffect(() => {
    if (ready && editing && !edits[`${data.draftKey}/${editing}`]) {
      setEdit(
        `${data.draftKey}/${editing}`,
        preparationDraft(editing, round, data.state.revision) as PreparationDraft,
      );
    }
  }, [ready, editing, edits, setEdit, data.draftKey, round, data.state.revision]);

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
    if (ready && (!draft || !hasPreparationDraft(draft))) {
      updateDraft(preparationDraft(section, round, data.state.revision) as PreparationDraft);
    }
    setError(null);
    setEditing(section);
  };

  const discard = (section: PreparationSection) => {
    if (busyRef.current) {
      return;
    }

    setEdit(key(section), undefined);
    close();
  };

  const editMutation = useMutation({
    mutationFn: ({
      draft,
      requireCurrentRevision,
    }: {
      draft: PreparationDraft;
      requireCurrentRevision?: boolean;
    }) =>
      data.save(
        draftChange(draft),
        draft.revision,
        requireCurrentRevision ? { requireCurrentRevision: true } : undefined,
      ),
  });

  const recordSaved = (
    draft: PreparationDraft,
    mode: "form" | "quick" | "undo",
    revision: number,
  ) => {
    setUndo(
      mode === "quick" && revision !== draft.revision
        ? {
            revision,
            draft: preparationDraft(draft.section, round, data.state.revision) as PreparationDraft,
          }
        : null,
    );
    setEdit(key(draft.section), undefined);
    setEditing(null);
    setFeedback((previous) => ({
      event: previous.event + 1,
      outcome: mode === "undo" ? "undone" : "saved",
    }));
  };

  const hasKeyConflict = (section: PreparationSection) => conflicts.has(key(section));

  const keepDraft = (section: PreparationSection) => {
    keepPreparationDraft({
      draft: draftFor(section),
      round,
      revision: data.state.revision,
      hasConflict: hasKeyConflict(section),
      draftKey: key(section),
      updateDraft,
      resolveConflict,
    });
    setError(null);
  };

  const loadLatest = (section: PreparationSection) => {
    loadLatestPreparationDraft({
      section,
      round,
      revision: data.state.revision,
      hasConflict: hasKeyConflict(section),
      draftKey: key(section),
      updateDraft,
      resolveConflict,
      onResolved: () => setDraftReset((count) => count + 1),
    });
    setError(null);
  };

  const prepareFormDraft = (draft: PreparationDraft) =>
    preparePreparationFormDraft({
      draft,
      round,
      revision: data.state.revision,
      hasConflict: hasKeyConflict(draft.section),
      updateDraft,
      onAlreadyApplied: (rebased) => {
        recordSaved(rebased, "form", data.state.revision);
        onRestoreFocus(rebased.section);
      },
    });

  const commitPreparationDraft = async (
    current: PreparationDraft,
    mode: "form" | "quick" | "undo",
  ): Promise<PreparationProblem | null> => {
    try {
      const result = await editMutation.mutateAsync({
        draft: current,
        requireCurrentRevision: mode === "undo",
      });
      if (result.status !== "ok") {
        setError(result);
        if (result.status === "conflict" || result.status === "invalid") {
          await refresh("read");
        }
        return result;
      }
      recordSaved(current, mode, result.revision);
      // A committed save stays successful even when the subsequent read fails.
      await refresh("saved");
      return null;
    } catch {
      const unavailable: PreparationProblem = { status: "unavailable" };
      setError(unavailable);
      return unavailable;
    }
  };

  const save = async (
    draft: PreparationDraft,
    mode: "form" | "quick" | "undo" = "form",
  ): Promise<PreparationProblem | null> => {
    if (busyRef.current || !ready) {
      return { status: "busy" };
    }
    let current = draft;
    if (mode === "form") {
      const prepared = prepareFormDraft(draft);
      if (!prepared) {
        return null;
      }
      if (prepared.problem) {
        return prepared.problem;
      }
      current = prepared.current;
    }

    busyRef.current = true;
    setPending(true);
    setError(null);
    const saveError = await commitPreparationDraft(current, mode);
    busyRef.current = false;
    setPending(false);
    if (!saveError) {
      onRestoreFocus(current.section);
    }
    return saveError;
  };

  const deletion = useRoundDeletion({
    ready,
    revision: data.state.revision,
    busyRef,
    setPending,
    refresh,
    onDelete: data.delete,
    onDeleted,
    onRestoreFocus,
    onCommitted: () => {
      setEditing(null);
      setUndo(null);
      clearPreparationDrafts(setEdit, key);
    },
  });

  return {
    ready,
    round,
    revision: data.state.revision,
    budgetHistory: data.state.budgetHistory,
    historySource: data.historySource,
    managers: data.state.managers,
    editing,
    draftReset,
    pending,
    error,
    undo,
    feedback,
    refreshError,
    ...deletion,
    draftFor,
    hasKeyConflict,
    updateDraft,
    open,
    close,
    discard,
    keepDraft,
    loadLatest,
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
