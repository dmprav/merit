import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Notice } from "@merit/ui/notice";
import { StatusMessage } from "@merit/ui/status-message";

import type { CreatedRecord, CreationData } from "../../contracts/creation";
import { useCreation } from "../../controllers/creation/use-creation";
import styles from "./creation-composer.module.css";
import { CreationForm } from "./creation-form";

type CreationActionProps = {
  data: CreationData;
  renderCreatedLink: (record: CreatedRecord, label: string) => ReactNode;
};

type CreationController = ReturnType<typeof useCreation>;

export const CreateAction = ({ data, renderCreatedLink }: CreationActionProps) => (
  <CreationComposer key={data.draftKey} data={data} renderCreatedLink={renderCreatedLink} />
);

const CreationComposer = ({ data, renderCreatedLink }: CreationActionProps) => {
  const { t } = useTranslation("fundingRounds");
  const creation = useCreation(data);
  const { draft, target, open, created, saving, changeOpen, save, update, close, discard } =
    creation;
  const label = t(target.kind === "round" ? "preparation.create" : "intake.add");
  const feedback = created && (
    <CreationFeedback creation={creation} renderCreatedLink={renderCreatedLink} />
  );

  return (
    <>
      <StatusMessage
        eventId={created?.publicId ?? ""}
        message={created ? t("creation.created", { title: created.title }) : null}
      />
      {!open && feedback && <div className={styles.confirmation}>{feedback}</div>}
      <FormDialog
        size="wide"
        title={label}
        closeLabel={t("preparation.close")}
        context={target.kind === "application" ? target.roundTitle : undefined}
        contextLabel={target.kind === "application" ? t("rounds.round") : undefined}
        isOpen={open}
        isDismissDisabled={saving}
        onOpenChange={changeOpen}
        trigger={<CreationTrigger creation={creation} label={label} />}
      >
        <StatusMessage
          eventId={created?.publicId ?? ""}
          message={created ? t("creation.created", { title: created.title }) : null}
        />
        {feedback}
        {draft && (
          <CreationForm
            key={draft.requestId}
            draft={draft}
            target={target}
            onChange={update}
            onClose={close}
            onDiscard={discard}
            onSave={save}
          />
        )}
      </FormDialog>
    </>
  );
};

const CreationFeedback = ({
  creation,
  renderCreatedLink,
}: Pick<CreationActionProps, "renderCreatedLink"> & { creation: CreationController }) => {
  const { t } = useTranslation("fundingRounds");
  const { created, target, refreshFailed, openFailed, dismiss, refresh } = creation;
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
          onPress={dismiss}
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

const CreationTrigger = ({ creation, label }: { creation: CreationController; label: string }) => {
  const { t } = useTranslation("fundingRounds");
  const { target, resumable, openEditor } = creation;

  return (
    <Button
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
