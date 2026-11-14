import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  canEditIntakeContent,
  isWithdrawn,
  canStartIntakeRevision,
  missingIntakeFields,
  intakeContent,
  type IntakeChange,
} from "@merit/applications/domain";
import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { useWorkflowRefresh } from "@merit/query/refresh";

import type { IntakeData, IntakeFailure } from "../../contracts/intake";
import { useIntakeDrafts } from "./drafts";
import {
  intakeSnapshot,
  intakeDraftCommand,
  intakeDraftConflict,
  intakeRenameCommand,
  intakeMenuActions,
  intakeConfirmationChange,
  outstandingReviewCount,
  intakeDraftChanged,
  newIntakeDraft,
  reconcileIntake,
  type IntakeConfirmation,
  type IntakeConfirmationValues,
  type IntakeDraft,
  type IntakeSection,
  type IntakeSnapshot,
} from "./intake-state";

type UseApplicationIntakeOptions = {
  application: Application;
  data: IntakeData;
  onDeleted: () => Promise<void>;
};

type PendingConfirmation = { action: IntakeConfirmation; revision: number };

/** The open confirmation, and a count of openings that keys dialogs so each starts with fresh input. */
const useConfirmationState = () => {
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [openings, setOpenings] = useState(0);

  const countOpening = (action: IntakeConfirmation | null) =>
    action && setOpenings((count) => count + 1);

  return [confirmation, setConfirmation, openings, countOpening] as const;
};

export const useApplicationIntake = ({
  application,
  data,
  onDeleted,
}: UseApplicationIntakeOptions) => {
  const [confirmation, setConfirmation, openings, countOpening] = useConfirmationState();
  const saving = useIntakeSave(data, onDeleted, () => setConfirmation(null));
  const editing = useIntakeEditing(application, data, saving.busy);
  const actions = intakeActions(application, data, editing, saving, confirmation, setConfirmation);
  const intake = data.state;
  return {
    editor: {
      application,
      workspaceSlug: data.workspaceSlug,
      section: editing.section,
      draft: editing.draft,
      latest: editing.latest,
      workingRevision: intake.workingRevision,
      pending: saving.pending,
      reason: editing.reason,
      conflict: intakeDraftConflict(editing.draft, editing.reasonDraft, intake.revision),
      discard: editing.discard,
      updateDraft: editing.updateDraft,
      changeReason: editing.changeReason,
      keepMyChanges: () => editing.reconcile("mine"),
      useLatestSavedValues: () => editing.reconcile("saved"),
      saveDraft: actions.saveDraft,
    },
    application,
    withdrawn: isWithdrawn(application),
    outstandingReviews: outstandingReviewCount(application),
    contact: data.selectContact
      ? {
          data: {
            workspaceSlug: data.workspaceSlug,
            selectContact: data.selectContact,
            refresh: data.refresh,
            refreshCurrent: data.refreshCurrent,
          },
          revision: intake.revision,
          publicId: data.publicId,
        }
      : null,
    workingRevision: intake.workingRevision,
    canStartRevision: canStartIntakeRevision(application, intake.workingRevision),
    missingFields: missingIntakeFields(intakeContent(application)),
    menuActions: intakeMenuActions(application, intake.workingRevision, editing.changed("title")),
    canOpen: (target: IntakeSection) =>
      !isWithdrawn(application) &&
      editing.section !== target &&
      (target === "details" || canEditIntakeContent(application, intake.workingRevision)),
    section: editing.section,
    preparing: editing.preparing,
    pending: saving.pending,
    unsavedContent: editing.unsavedContent,
    confirmation: confirmation?.action ?? null,
    confirmationKey: openings,
    setConfirmation: (action: IntakeConfirmation | null) => {
      if (!saving.busy.current) {
        saving.setError(null);
        countOpening(action);
        setConfirmation(action ? { action, revision: intake.revision } : null);
      }
    },
    error: saving.error,
    refreshError: saving.refreshError !== null,
    refreshing: saving.refreshing,
    saved: saving.saved,
    changed: editing.changed,
    open: editing.open,
    close: editing.close,
    rename: actions.rename,
    startRevision: () => actions.act({ action: "start_revision", kind: "revision" }),
    startCorrection: () => actions.act({ action: "start_revision", kind: "correction" }),
    markReady: () => actions.act({ action: "mark_ready" }),
    publishRevision: () => actions.act({ action: "publish_revision" }),
    confirm: actions.confirm,
    refresh: () => saving.refreshAfterSave("saved"),
  };
};

const useIntakeEditing = (
  application: Application,
  data: IntakeData,
  busy: ReturnType<typeof useRef<boolean>>,
) => {
  const intake = data.state;
  const { applicationEdits, setApplicationEdit } = useIntakeDrafts();
  const [section, setSection] = useState<IntakeSection | null>(null);
  const latest = intakeSnapshot(application, intake.workingRevision);
  const preparing = application.intakeStatus === "in_preparation";

  const key = (target: IntakeDraft["section"]) => `${data.draftKey}:${target}`;

  const draftFor = (target: IntakeDraft["section"]) => applicationEdits[key(target)];

  const changed = (target: IntakeDraft["section"]) => intakeDraftChanged(draftFor(target));

  const draft = section ? draftFor(section) : undefined;
  const reasonDraft = draftFor("reason");
  const reason = reasonDraft?.section === "reason" ? reasonDraft.value.reason : latest.reason;
  const unsavedContent = (["title", "metadata", "content", "reason"] as const).some(changed);

  const updateDraft = (next: IntakeDraft) => setApplicationEdit(key(next.section), next);

  const close = () => {
    if (draft && !intakeDraftChanged(draft)) {
      setApplicationEdit(key(draft.section), undefined);
    }
    setSection(null);
  };

  const open = (next: IntakeSection) => {
    if (busy.current) {
      return;
    }

    if (!draftFor(next)) {
      updateDraft(newIntakeDraft(next, latest, intake.revision) as IntakeDraft);
    }
    setSection(next);
  };

  const changeReason = (value: string) =>
    updateDraft({
      ...(reasonDraft?.section === "reason"
        ? reasonDraft
        : newIntakeDraft("reason", latest, intake.revision)),
      value: { reason: value },
    });

  const reconcile = (source: "mine" | "saved") => {
    if (!draft) {
      return;
    }

    updateDraft(resolveIntakeDraft(draft, latest, intake.revision, source));
    if (section !== "details" && reasonDraft) {
      updateDraft(resolveIntakeDraft(reasonDraft, latest, intake.revision, source));
    }
  };

  const discard = () => {
    if (!section) {
      return;
    }

    setApplicationEdit(key(section), undefined);
    if (section !== "details") {
      setApplicationEdit(key("reason"), undefined);
    }
    setSection(null);
  };

  return {
    // A withdrawal saved elsewhere hides an open editor; its stored draft returns on reinstatement.
    section: isWithdrawn(application) ? null : section,
    setSection,
    draft,
    latest,
    reasonDraft,
    reason,
    discard,
    updateDraft,
    changeReason,
    reconcile,
    preparing,
    unsavedContent,
    changed,
    open,
    close,
    key,
    setApplicationEdit,
  };
};

const resolveIntakeDraft = (
  draft: IntakeDraft,
  latest: IntakeSnapshot,
  revision: number,
  source: "mine" | "saved",
) =>
  (source === "saved"
    ? newIntakeDraft(draft.section, latest, revision)
    : reconcileIntake(draft, latest, revision)) as IntakeDraft;

const useIntakeSave = (
  data: IntakeData,
  onDeleted: () => Promise<void>,
  onDeleteCommitted: () => void,
) => {
  const intake = data.state;
  const [error, setError] = useState<IntakeFailure | null>(null);
  const {
    refresh: refreshAfterSave,
    refreshError,
    refreshing,
  } = useWorkflowRefresh(() => data.refresh());
  const [saved, setSaved] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ change, revision }: { change: IntakeChange; revision: number }) =>
      data.save(change, revision),
  });
  const busy = useRef(false);

  const save = async (
    change: IntakeChange,
    expectedRevision?: number,
    onCommitted?: (revision: number) => void,
  ): Promise<IntakeFailure | null> => {
    if (busy.current) {
      return { status: "busy" };
    }

    busy.current = true;
    setError(null);

    let failure: IntakeFailure | null = null;
    try {
      const response = await mutation.mutateAsync({
        change,
        revision: expectedRevision ?? intake.revision,
      });
      if (response.status !== "ok") {
        failure = response;
        if (response.status === "conflict") {
          // Refreshing cannot replace the known write outcome with a generic failure.
          await data.refreshCurrent().catch(() => {});
        }
      } else {
        setSaved((value) => value + 1);
        if (change.action === "delete") {
          onDeleteCommitted();
          void onDeleted();
        }
        onCommitted?.(response.revision);

        // Refresh failures must not turn a committed save into a reported failure.
        await refreshAfterSave("saved");
      }
    } catch {
      failure = { status: "unavailable" };
    }

    busy.current = false;
    return failure;
  };

  return {
    save,
    busy,
    setError,
    error,
    refreshError,
    refreshing,
    saved,
    refreshAfterSave,
    pending: mutation.isPending || refreshing,
  };
};

const intakeActions = (
  application: Application,
  data: IntakeData,
  editing: ReturnType<typeof useIntakeEditing>,
  saving: ReturnType<typeof useIntakeSave>,
  confirmation: PendingConfirmation | null,
  setConfirmation: (confirmation: null) => void,
) => {
  const intake = data.state;
  const { reasonDraft, reason, setApplicationEdit, key, setSection, updateDraft, latest } = editing;
  const { save, setError } = saving;

  const saveDraft = async (next: IntakeDraft) => {
    const command = intakeDraftCommand(
      next,
      application,
      intake.workingRevision,
      intake.revision,
      reasonDraft,
      reason,
    );
    if (command.status !== "ok") {
      return command;
    }

    return save(command.change, command.revision, () => {
      setApplicationEdit(key(next.section), undefined);
      if (next.section !== "details") {
        setApplicationEdit(key("reason"), undefined);
      }
      setSection(null);
    });
  };

  const rename = async (title: string) => {
    const change = intakeRenameCommand(application, intake.workingRevision, title);
    if (change?.action === "save_content") {
      return save(change);
    }

    const editTitle = (revision: number) => {
      updateDraft({ ...newIntakeDraft("title", latest, revision), value: { title } });
      setSection("title");
    };

    if (!change) {
      editTitle(intake.revision);
      return null;
    }

    // Starting a correction copies the current submission; keep the entered title even if refresh fails.
    return save(change, intake.revision, editTitle);
  };

  const act = async (change: IntakeChange) => {
    const failure = await save(change);
    setError(failure);
    return failure;
  };

  const confirm = async (values?: IntakeConfirmationValues) => {
    const change = confirmation && intakeConfirmationChange(confirmation.action, values);
    if (!confirmation || !change) {
      return;
    }

    const failure = await save(change, confirmation.revision, () => {
      setConfirmation(null);
      setSection(null);
      if (confirmation.action === "withdraw" || confirmation.action === "reinstate") {
        // Unsaved edits stay available; they reconcile against the latest case after reinstatement.
        return;
      }
      for (const target of ["title", "metadata", "content", "reason"] as const) {
        setApplicationEdit(key(target), undefined);
      }
    });
    setError(failure);
  };

  return { saveDraft, rename, act, confirm };
};

export type ApplicationIntakeController = ReturnType<typeof useApplicationIntake>;
