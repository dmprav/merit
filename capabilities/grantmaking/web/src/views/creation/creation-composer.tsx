import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { DialogContent } from "@merit/ui/dialog";
import { EditorLoading } from "@merit/ui/editor-loading";
import { useEventToast, useToastWhile } from "@merit/ui/toast";

import type { CreationData } from "../../contracts/creation";
import { useCreation } from "../../controllers/creation/use-creation";
import { CreationForm } from "./creation-form";

type CreationActionProps = {
  data: CreationData;
  /** Navigation changes close a persistent composer while retaining drafts and saved feedback. */
  locationKey?: string;
  /** Supplies an alternate entry point; its callback opens the existing draft without saving. */
  renderTrigger?: (open: () => void) => ReactNode;
};

type CreationController = ReturnType<typeof useCreation>;

export const CreateAction = (props: CreationActionProps) => (
  <CreationComposer key={props.data.draftKey} {...props} />
);

const CreationComposer = ({ data, locationKey, renderTrigger }: CreationActionProps) => {
  const { t } = useTranslation("fundingRounds");
  const creation = useCreation(data, locationKey);
  const focusId = useId();
  const { target, open, saving, changeOpen } = creation;
  const isApplication = target.kind === "application";
  const label = t(isApplication ? "intake.add" : "preparation.create");
  useCreationToasts(creation);

  return (
    <>
      {renderTrigger?.(creation.openEditor)}
      <FormDialog
        title={label}
        context={isApplication ? target.roundTitle : undefined}
        contextLabel={isApplication ? t("rounds.round") : undefined}
        isOpen={open}
        isDismissDisabled={saving}
        onOpenChange={changeOpen}
        trigger={
          renderTrigger ? null : (
            <CreationTrigger id={`${focusId}-trigger`} creation={creation} label={label} />
          )
        }
      >
        <CreationDialogBody focusId={focusId} label={label} creation={creation} />
      </FormDialog>
    </>
  );
};

const CreationDialogBody = ({
  focusId,
  label,
  creation,
}: {
  focusId: string;
  label: string;
  creation: CreationController;
}) => {
  const { draft, target, ready, save, update, close, discard } = creation;
  if (!ready || !draft) {
    return (
      <DialogContent label={label}>
        <EditorLoading />
      </DialogContent>
    );
  }
  return (
    <CreationForm
      key={draft.requestId}
      titleId={`${focusId}-title`}
      draft={draft}
      target={target}
      onChange={update}
      onClose={close}
      onDiscard={discard}
      onSave={save}
    />
  );
};

/** A created record opens on its own; toasts confirm it and recover a failed open or refresh. */
const useCreationToasts = (creation: CreationController) => {
  const { t } = useTranslation("fundingRounds");
  const { created, target, openFailed, refreshError } = creation;

  useEventToast(
    created?.publicId ?? "",
    created && { tone: "success", message: t("creation.created", { title: created.title }) },
  );
  useToastWhile(
    created && openFailed
      ? {
          tone: "warning",
          message: t("creation.openError", { title: created.title }),
          action: {
            label: t(target.kind === "round" ? "creation.openRound" : "creation.openApplication"),
            onPress: () => void creation.openCreated(),
          },
        }
      : null,
  );
  useToastWhile(
    refreshError && {
      tone: "warning",
      message: t("creation.refreshError"),
      action: { label: t("creation.refresh"), onPress: () => void creation.refresh() },
    },
  );
};

const CreationTrigger = ({
  id,
  creation,
  label,
}: {
  id: string;
  creation: CreationController;
  label: string;
}) => {
  const { t } = useTranslation("fundingRounds");
  const { target, resumable, openEditor } = creation;

  return (
    <Button
      id={id}
      size={target.kind === "application" ? "small" : "medium"}
      variant={target.kind === "application" ? "secondary" : "primary"}
      onPress={openEditor}
    >
      {resumable
        ? t(target.kind === "round" ? "creation.resumeRound" : "creation.resumeApplication")
        : label}
    </Button>
  );
};
