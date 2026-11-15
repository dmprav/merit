import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { DialogContent } from "@merit/ui/dialog";
import { EditorLoading } from "@merit/ui/editor-loading";
import { Icon } from "@merit/ui/icon";
import { Notice } from "@merit/ui/notice";
import { StatusMessage } from "@merit/ui/status-message";

import type { CreatedRecord, CreationData } from "../../contracts/creation";
import { useCreation } from "../../controllers/creation/use-creation";
import styles from "./creation-composer.module.css";
import { CreationForm } from "./creation-form";

type CreationActionProps = {
  data: CreationData;
  /** Navigation changes close a persistent composer while retaining drafts and saved feedback. */
  locationKey?: string;
  /** Supplies an alternate entry point; its callback opens the existing draft without saving. */
  renderTrigger?: (open: () => void) => ReactNode;
  /** Restores a surviving alternate entry point when a closed composer’s notice is dismissed. */
  restoreTriggerFocus?: () => void;
  renderCreatedLink: (record: CreatedRecord, label: string) => ReactNode;
};

type CreationController = ReturnType<typeof useCreation>;

export const CreateAction = (props: CreationActionProps) => (
  <CreationComposer key={props.data.draftKey} {...props} />
);

const focusDismissTarget = (focusId: string, open: boolean, restoreTriggerFocus?: () => void) => {
  if (!open && restoreTriggerFocus) {
    restoreTriggerFocus();
    return;
  }
  document.getElementById(`${focusId}-${open ? "title" : "trigger"}`)?.focus();
};

const CreationComposer = ({
  data,
  locationKey,
  renderCreatedLink,
  renderTrigger,
  restoreTriggerFocus,
}: CreationActionProps) => {
  const { t } = useTranslation("fundingRounds");
  const creation = useCreation(data, locationKey);
  const focusId = useId();
  const { target, open, created, saving, changeOpen } = creation;
  const isApplication = target.kind === "application";
  const label = t(isApplication ? "intake.add" : "preparation.create");
  const statusMessage = created ? t("creation.created", { title: created.title }) : null;
  const feedback = created && (
    <CreationFeedback
      creation={creation}
      renderCreatedLink={renderCreatedLink}
      onDismiss={() => {
        focusDismissTarget(focusId, open, restoreTriggerFocus);
        creation.dismiss();
      }}
    />
  );

  return (
    <>
      <StatusMessage eventId={created?.publicId ?? ""} message={statusMessage} />
      {!open && feedback && <div className={styles.confirmation}>{feedback}</div>}
      {renderTrigger?.(creation.openEditor)}
      <FormDialog
        size="wide"
        title={label}
        closeLabel={t("preparation.close")}
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
        <StatusMessage eventId={created?.publicId ?? ""} message={statusMessage} />
        {feedback}
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

const CreationFeedback = ({
  creation,
  renderCreatedLink,
  onDismiss,
}: Pick<CreationActionProps, "renderCreatedLink"> & {
  creation: CreationController;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation("fundingRounds");
  const { created, target, refreshFailed, openFailed, refresh } = creation;
  if (!created) {
    return null;
  }

  return (
    <Notice as="div" tone={refreshFailed || openFailed ? "warning" : "success"}>
      <div className={styles.feedback}>
        <span>{t("creation.created", { title: created.title })}</span>
        {renderCreatedLink(
          created,
          t(target.kind === "round" ? "creation.openRound" : "creation.openApplication"),
        )}
        <Button
          size="small"
          variant="quiet"
          iconOnly
          aria-label={t("creation.dismiss")}
          onPress={onDismiss}
        >
          <Icon name="close" />
        </Button>
      </div>
      {openFailed && <p>{t("creation.openError")}</p>}
      {refreshFailed && (
        <div className={styles.feedback}>
          <span>{t("creation.refreshError")}</span>
          <Button size="small" variant="quiet" onPress={() => void refresh()}>
            {t("creation.refresh")}
          </Button>
        </div>
      )}
    </Notice>
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
      size={target.kind === "application" ? "small" : undefined}
      variant={target.kind === "application" ? "secondary" : "primary"}
      onPress={openEditor}
    >
      {resumable
        ? t(target.kind === "round" ? "creation.resumeRound" : "creation.resumeApplication")
        : label}
    </Button>
  );
};
