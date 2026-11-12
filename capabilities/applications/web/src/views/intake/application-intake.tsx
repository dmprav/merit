import type { TFunction } from "i18next";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { intakeContent } from "@merit/applications/domain";
import { useFormat } from "@merit/i18n/format";
import { parseMoney } from "@merit/money";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DialogContent, ModalDialog } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { InlineName } from "@merit/ui/inline-name";
import { Inline } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { StatusMessage } from "@merit/ui/status-message";
import { Tooltip } from "@merit/ui/tooltip";

import type { IntakeSection } from "../../controllers/intake/intake-state";
import type { ApplicationIntakeController } from "../../controllers/intake/use-application-intake";
import styles from "./application-intake.module.css";
import { intakeError } from "./messages";

export const IntakeEditButton = ({
  intake,
  hasSummary,
  section,
  triggerRef,
  onReveal,
}: {
  intake: Pick<ApplicationIntakeController, "canOpen" | "changed" | "pending" | "open">;
  hasSummary: boolean;
  section: Exclude<IntakeSection, "title">;
  triggerRef?: Ref<HTMLButtonElement>;
  onReveal?: () => void;
}) => {
  const { t } = useTranslation("applicationIntake");
  if (!intake.canOpen(section)) {
    return null;
  }

  const changed = intake.changed(section);
  const labels = {
    details: changed
      ? "intake.resumeSummary"
      : hasSummary
        ? "intake.editSummary"
        : "intake.addSummary",
    content: changed ? "intake.resumeContent" : "intake.editContent",
    metadata: changed ? "intake.resumeMetadata" : "intake.editMetadata",
    reason: changed ? "intake.resumeMetadata" : "intake.editMetadata",
  } as const;
  const label = t(labels[section]);
  const addSummary = section === "details" && !hasSummary;

  return (
    <Tooltip content={label}>
      <Button
        ref={triggerRef}
        size="small"
        variant="quiet"
        isDisabled={intake.pending}
        iconOnly={!addSummary}
        data-draft={changed || undefined}
        aria-label={label}
        onPress={() => {
          intake.open(section);
          onReveal?.();
        }}
      >
        {addSummary ? (
          <>
            <Icon name="add" />
            {label}
          </>
        ) : (
          <Icon name="edit" />
        )}
      </Button>
    </Tooltip>
  );
};

export const IntakeTitle = ({
  intake,
  titleRef,
  onReveal,
}: {
  intake: Pick<
    ApplicationIntakeController,
    "application" | "preparing" | "pending" | "unsavedContent" | "rename"
  >;
  titleRef?: Ref<HTMLSpanElement>;
  onReveal: () => void;
}) => {
  const { t } = useTranslation(["applicationIntake", "common"]);

  return (
    <span ref={titleRef} tabIndex={-1}>
      <InlineName
        value={intake.application.title}
        label={t(intake.preparing ? "intake.rename" : "intake.renameRecorded")}
        saveLabel={t(intake.preparing ? "preparation.saveName" : "intake.correct")}
        cancelLabel={t("common:cancel")}
        errorMessage={t("intake.saveError")}
        isDisabled={intake.pending || intake.unsavedContent}
        onSave={async (title) => {
          const error = await intake.rename(title);
          if (!error && !intake.preparing) {
            onReveal();
          }
          return intakeError(t, error);
        }}
      />
    </span>
  );
};

export const intakeMenuItems = (
  actions: ApplicationIntakeController["menuActions"],
  t: TFunction<"applicationIntake">,
) => {
  const labels = {
    title: "intake.resumeTitle",
    start_revision: "intake.startRevision",
    discard_revision: "intake.discardRevision",
    correct: "intake.correct",
    delete: "intake.delete",
  } as const;
  return actions.map((id) => ({ id, label: t(labels[id]) }));
};

export const IntakeControls = ({
  intake,
  onReveal,
}: {
  intake: Pick<
    ApplicationIntakeController,
    | "application"
    | "preparing"
    | "section"
    | "unsavedContent"
    | "workingRevision"
    | "missingFields"
    | "canStartRevision"
    | "pending"
    | "startRevision"
    | "markReady"
    | "publishRevision"
  >;
  onReveal: () => void;
}) => {
  const { t } = useTranslation("applicationIntake");
  const { application, preparing, section, unsavedContent } = intake;
  const working = intake.workingRevision;
  const editingContent = section !== null && section !== "details";
  const missing = intake.missingFields;
  const fields = {
    title: "intake.projectTitle",
    applicant: "intake.applicant",
    requested: "intake.requested",
    answers: "intake.material",
  } as const;

  return (
    <section className={styles.intake} aria-label={t("intake.preparation")}>
      <Inline gap={3} justify="between">
        <IntakeStatus
          preparing={preparing}
          workingRevision={working}
          unsavedContent={unsavedContent}
        />
        {!editingContent && (
          <div className={styles.actions}>
            {intake.canStartRevision && (
              <Button
                size="small"
                variant="secondary"
                isDisabled={intake.pending}
                onPress={() => {
                  onReveal();
                  void intake.startRevision();
                }}
              >
                {t("intake.startRevision")}
              </Button>
            )}
            {preparing ? (
              <Button
                size="small"
                isDisabled={intake.pending || missing.length > 0 || unsavedContent}
                onPress={() => void intake.markReady()}
              >
                {t("intake.markReady")}
              </Button>
            ) : (
              working && (
                <Button
                  size="small"
                  isDisabled={intake.pending || unsavedContent}
                  onPress={() => void intake.publishRevision()}
                >
                  {t("intake.recordRevision")}
                </Button>
              )
            )}
          </div>
        )}
      </Inline>
      {preparing && !editingContent && missing.length > 0 && (
        <p className={styles.hint}>
          {t("intake.missing", { fields: missing.map((field) => t(fields[field])).join(", ") })}
        </p>
      )}
      {working && (
        <RevisionPreview
          application={application}
          working={working}
          editingContent={editingContent}
        />
      )}
      {unsavedContent && !editingContent && (
        <p className={styles.hint}>{t("intake.unsavedContent")}</p>
      )}
    </section>
  );
};

const IntakeStatus = ({
  preparing,
  workingRevision: working,
  unsavedContent,
}: Pick<ApplicationIntakeController, "preparing" | "workingRevision" | "unsavedContent">) => {
  const { t } = useTranslation("applicationIntake");

  return (
    <div className={styles.status}>
      <h2>
        {t(
          working
            ? working.kind === "correction"
              ? "intake.workingCorrection"
              : "intake.workingRevision"
            : preparing
              ? "intake.preparation"
              : "intake.manageSubmission",
        )}
      </h2>
      {unsavedContent ? (
        <Badge>{t("intake.unsaved")}</Badge>
      ) : (
        !working && <Badge>{t(preparing ? "intake.preparing" : "intake.ready")}</Badge>
      )}
    </div>
  );
};

const RevisionPreview = ({
  application,
  working,
  editingContent,
}: {
  application: ApplicationIntakeController["application"];
  working: NonNullable<ApplicationIntakeController["workingRevision"]>;
  editingContent: boolean;
}) => {
  const { t } = useTranslation("applicationIntake");
  const { money } = useFormat();
  const preview = editingContent ? intakeContent(application) : working.content;
  const previewAmount = preview.requested ? parseMoney(preview.requested) : null;

  return (
    <Inline gap={3} justify="between">
      <p className={styles.hint}>
        {t("intake.currentVersionUnchanged", { version: application.version })}
      </p>
      <ModalDialog
        title={t(editingContent ? "intake.currentSubmission" : "intake.previewRevision")}
        closeLabel={t("preparation.close")}
        size="wide"
        trigger={
          <Button size="small" variant="quiet">
            {t(editingContent ? "intake.viewCurrentSubmission" : "intake.previewRevision")}
          </Button>
        }
      >
        <DialogContent
          label={t(editingContent ? "intake.currentSubmission" : "intake.previewRevision")}
        >
          <div className={styles.preview}>
            <div>
              <h3>{preview.title}</h3>
              <p className={styles.hint}>{preview.applicant}</p>
              <p className={styles.hint}>
                {previewAmount?.ok
                  ? t("applications.requestAmount", { amount: money(previewAmount.value) })
                  : t("intake.unknownAmount")}
              </p>
            </div>
            {preview.projectPeriod && (
              <p>
                {t("evidence.projectPeriod")}: {preview.projectPeriod}
              </p>
            )}
            {preview.answers.map((answer, index) => (
              <section key={index} className={styles.reading}>
                <h4>{answer.question}</h4>
                <p>{answer.response}</p>
              </section>
            ))}
            {!editingContent && (
              <section className={styles.changeReason}>
                <h3>{t("intake.reason")}</h3>
                <p>{working.reason || t("intake.reasonHint")}</p>
              </section>
            )}
          </div>
        </DialogContent>
      </ModalDialog>
    </Inline>
  );
};

export const IntakeFeedback = ({
  intake,
}: {
  intake: Pick<
    ApplicationIntakeController,
    | "application"
    | "confirmation"
    | "setConfirmation"
    | "refreshError"
    | "refreshing"
    | "refresh"
    | "error"
    | "saved"
    | "pending"
    | "confirm"
  >;
}) => {
  const { t } = useTranslation(["applicationIntake", "common"]);
  const {
    application,
    confirmation,
    setConfirmation,
    refreshError,
    refreshing,
    refresh,
    error: failure,
    saved,
  } = intake;
  const error =
    confirmation && failure?.status === "conflict"
      ? t("intake.confirmationConflict")
      : intakeError(t, failure);

  return (
    <>
      {refreshError && (
        <Notice as="div" tone="warning" role="alert">
          <p>{t("intake.refreshError")}</p>
          <Button
            size="small"
            variant="secondary"
            isPending={refreshing}
            onPress={() => void refresh()}
          >
            {t("intake.refresh")}
          </Button>
        </Notice>
      )}
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}
      <StatusMessage
        message={saved ? t("intake.saved") : null}
        eventId={saved}
        confirmation={Boolean(saved)}
      />
      <ConfirmationDialog
        title={t(confirmation === "delete" ? "intake.delete" : "intake.discardRevision")}
        description={t(
          confirmation === "delete" ? "intake.deleteDescription" : "intake.discardDescription",
          { title: application.title },
        )}
        closeLabel={t("preparation.close")}
        cancelLabel={t("common:cancel")}
        confirmLabel={t(confirmation === "delete" ? "intake.delete" : "intake.discardRevision")}
        intent="destructive"
        isOpen={confirmation !== null}
        onOpenChange={(value) => {
          if (!value) {
            setConfirmation(null);
          }
        }}
        isPending={intake.pending}
        error={error}
        onConfirm={() => void intake.confirm()}
      />
    </>
  );
};
