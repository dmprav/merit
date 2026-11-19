import type { TFunction } from "i18next";
import { useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { intakeContent, intakeLimits, latestWithdrawalDate } from "@merit/applications/domain";
import { calendarDateSchema, todayCalendarDate } from "@merit/dates";
import { useFormat } from "@merit/i18n/format";
import { parseMoney } from "@merit/money";
import shell from "@merit/ui/application-shell.module.css";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DateField } from "@merit/ui/date-field";
import { DialogContent, DialogSection, ModalDialog } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { InlineName } from "@merit/ui/inline-name";
import { Inline, Reading } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { StatusMessage } from "@merit/ui/status-message";
import { TextField } from "@merit/ui/text-field";
import { Tooltip } from "@merit/ui/tooltip";

import type { IntakeSection } from "../../controllers/intake/intake-state";
import type { ApplicationIntakeController } from "../../controllers/intake/use-application-intake";
import styles from "./application-intake.module.css";
import { intakeError } from "./messages";

export const IntakeSectionEditButton = ({
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
    <IntakeEditButton
      label={label}
      changed={changed}
      add={addSummary}
      isDisabled={intake.pending}
      triggerRef={triggerRef}
      onPress={() => {
        intake.open(section);
        onReveal?.();
      }}
    />
  );
};

export const IntakeEditButton = ({
  label,
  changed = false,
  add = false,
  isDisabled,
  triggerRef,
  onPress,
}: {
  label: string;
  changed?: boolean;
  add?: boolean;
  isDisabled: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  onPress: () => void;
}) => {
  return (
    <Tooltip content={label}>
      <Button
        ref={triggerRef}
        size="small"
        variant="quiet"
        isDisabled={isDisabled}
        iconOnly={!add}
        data-draft={changed || undefined}
        aria-label={label}
        onPress={onPress}
      >
        {add ? (
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
    "application" | "withdrawn" | "preparing" | "pending" | "unsavedContent" | "rename" | "ready"
  >;
  titleRef?: Ref<HTMLSpanElement>;
  onReveal: () => void;
}) => {
  const { t } = useTranslation(["applicationIntake", "common"]);
  // A withdrawn application is read-only, so its title cannot be renamed or corrected.
  if (intake.withdrawn) {
    return <span ref={titleRef}>{intake.application.title}</span>;
  }

  return (
    <span ref={titleRef} tabIndex={-1}>
      <InlineName
        value={intake.application.title}
        label={t(intake.preparing ? "intake.rename" : "intake.renameRecorded")}
        saveLabel={t(intake.preparing ? "preparation.saveName" : "intake.correct")}
        cancelLabel={t("common:cancel")}
        errorMessage={t("intake.saveError")}
        isPreparing={!intake.ready}
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
    withdraw: "intake.withdraw",
    delete: "intake.delete",
  } as const;
  return actions.map((id) => ({ id, label: t(labels[id]) }));
};

type IntakeControlsProps = {
  intake: Pick<
    ApplicationIntakeController,
    | "application"
    | "withdrawn"
    | "preparing"
    | "section"
    | "ready"
    | "unsavedContent"
    | "workingRevision"
    | "missingFields"
    | "pending"
    | "markReady"
    | "publishRevision"
    | "setConfirmation"
    | "confirmation"
    | "error"
  >;
  headingActions?: ReactNode;
};

export const IntakeControls = ({ intake, headingActions }: IntakeControlsProps) => {
  const { t } = useTranslation("applicationIntake");
  const { application, preparing, section, unsavedContent } = intake;
  if (intake.withdrawn) {
    return (
      <div className={styles.intake}>
        <Inline gap={3} justify="between">
          <h2>{t("workspace.submission")}</h2>
          {headingActions}
        </Inline>
        <ReinstateStatus intake={intake} />
        <IntakeTaskFeedback intake={intake} />
      </div>
    );
  }
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
        <Inline gap={3} align="baseline">
          <h2>{t("workspace.submission")}</h2>
          <IntakeStatus
            preparing={preparing}
            workingRevision={working}
            unsavedContent={unsavedContent}
          />
        </Inline>
        <div className={styles.actions}>
          {headingActions}
          {!editingContent &&
            (preparing ? (
              <Button
                size="small"
                isDisabled={!intake.ready || intake.pending || missing.length > 0 || unsavedContent}
                onPress={() => void intake.markReady()}
              >
                {t("intake.markReady")}
              </Button>
            ) : (
              working && (
                <Button
                  size="small"
                  isDisabled={!intake.ready || intake.pending || unsavedContent}
                  onPress={() => void intake.publishRevision()}
                >
                  {t("intake.recordRevision")}
                </Button>
              )
            ))}
        </div>
      </Inline>
      <IntakeTaskFeedback intake={intake} />
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

const ReinstateStatus = ({
  intake,
}: {
  intake: Pick<ApplicationIntakeController, "application" | "pending" | "setConfirmation">;
}) => {
  const { t } = useTranslation("applicationIntake");

  return (
    <WithdrawalStatus
      application={intake.application}
      action={
        <Button
          size="small"
          variant="secondary"
          isDisabled={intake.pending}
          onPress={() => intake.setConfirmation("reinstate")}
        >
          {t("intake.reinstate")}
        </Button>
      }
    />
  );
};

/** The retained facts of a withdrawal, with the one action allowed while withdrawn. */
export const WithdrawalStatus = ({
  application,
  action,
}: {
  application: ApplicationIntakeController["application"];
  action?: ReactNode;
}) => {
  const { t } = useTranslation("applicationIntake");
  const { calendarDate } = useFormat();
  const withdrawal = application.withdrawal;
  if (!withdrawal) {
    return null;
  }

  return (
    <section className={styles.withdrawal} aria-label={t("intake.withdrawn")}>
      <Inline gap={3} justify="between">
        <h3>{t("intake.withdrawnOn", { date: calendarDate(withdrawal.withdrawnOn) })}</h3>
        {action}
      </Inline>
      <p className={styles.hint}>
        {t("intake.withdrawalRecordedBy", { name: withdrawal.recorder.name })}
      </p>
      <Reading as="p" className={styles.reason}>
        {withdrawal.reason}
      </Reading>
    </section>
  );
};

type StatusState = Partial<
  Pick<ApplicationIntakeController, "preparing" | "workingRevision" | "unsavedContent">
>;

const IntakeStatus = ({ preparing, workingRevision, unsavedContent }: StatusState) => {
  const { t } = useTranslation("applicationIntake");
  const status = workingRevision
    ? workingRevision.kind === "correction"
      ? "intake.workingCorrection"
      : "intake.workingRevision"
    : preparing
      ? "intake.preparing"
      : "intake.ready";

  return (
    <div className={styles.status}>
      <span>{t(status)}</span>
      {unsavedContent && <Badge>{t("intake.unsaved")}</Badge>}
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
        trigger={
          <Button size="small" variant="quiet">
            {t(editingContent ? "intake.viewCurrentSubmission" : "intake.previewRevision")}
          </Button>
        }
      >
        <DialogContent reading>
          <Reading className={styles.preview}>
            <DialogSection title={preview.title}>
              <p>{preview.applicant}</p>
              <p>
                {previewAmount?.ok
                  ? t("applications.requestAmount", { amount: money(previewAmount.value) })
                  : t("intake.unknownAmount")}
              </p>
              {preview.projectPeriod && (
                <p>
                  {t("evidence.projectPeriod")}: {preview.projectPeriod}
                </p>
              )}
            </DialogSection>
            {preview.answers.map((answer, index) => (
              <DialogSection key={index} title={answer.question}>
                <p>{answer.response}</p>
              </DialogSection>
            ))}
            {!editingContent && (
              <DialogSection title={t("intake.reason")}>
                <p>{working.reason || t("intake.reasonHint")}</p>
              </DialogSection>
            )}
          </Reading>
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
    | "confirmationKey"
    | "outstandingReviews"
  >;
}) => {
  const { t } = useTranslation(["applicationIntake", "common"]);
  const { confirmation, error: failure, saved } = intake;
  const error =
    confirmation && failure?.status === "conflict"
      ? t("intake.confirmationConflict")
      : intakeError(t, failure);

  return (
    <>
      <StatusMessage
        className={shell.confirmation}
        message={saved ? t("intake.saved") : null}
        eventId={saved}
        confirmation={Boolean(saved)}
      />
      <IntakeConfirmations intake={intake} error={error} />
    </>
  );
};

const IntakeTaskFeedback = ({
  intake,
}: {
  intake: Pick<ApplicationIntakeController, "confirmation" | "error">;
}) => {
  const { t } = useTranslation("applicationIntake");
  const error = !intake.confirmation && intakeError(t, intake.error);

  return error ? (
    <Notice appearance="inline" tone="danger" role="alert">
      {error}
    </Notice>
  ) : null;
};

export const IntakeRefreshFeedback = ({
  intake,
}: {
  intake: Pick<ApplicationIntakeController, "refreshError" | "refreshing" | "refresh">;
}) => {
  const { t } = useTranslation("applicationIntake");

  return intake.refreshError ? (
    <Notice
      appearance="inline"
      tone="warning"
      role="alert"
      actions={
        <Button
          size="small"
          variant="quiet"
          isPending={intake.refreshing}
          onPress={() => void intake.refresh()}
        >
          {t("intake.refresh")}
        </Button>
      }
    >
      {t("intake.refreshError")}
    </Notice>
  ) : null;
};

const IntakeConfirmations = ({
  intake,
  error,
}: {
  intake: Pick<
    ApplicationIntakeController,
    | "application"
    | "confirmation"
    | "setConfirmation"
    | "pending"
    | "confirm"
    | "confirmationKey"
    | "outstandingReviews"
  >;
  error: string | null;
}) => {
  const { t } = useTranslation(["applicationIntake", "common"]);
  const { application, confirmation, setConfirmation } = intake;
  const shared = {
    application,
    pending: intake.pending,
    error,
    onClose: () => setConfirmation(null),
    onConfirm: intake.confirm,
  };

  return (
    <>
      <WithdrawDialog
        key={`withdraw-${intake.confirmationKey}`}
        {...shared}
        isOpen={confirmation === "withdraw"}
        outstandingReviews={intake.outstandingReviews}
      />
      <ReinstateDialog
        key={`reinstate-${intake.confirmationKey}`}
        {...shared}
        isOpen={confirmation === "reinstate"}
      />
      <ConfirmationDialog
        title={t(confirmation === "delete" ? "intake.delete" : "intake.discardRevision")}
        description={t(
          confirmation === "delete" ? "intake.deleteDescription" : "intake.discardDescription",
          { title: application.title },
        )}
        cancelLabel={t("common:cancel")}
        confirmLabel={t(confirmation === "delete" ? "intake.delete" : "intake.discardRevision")}
        intent="destructive"
        isOpen={confirmation === "delete" || confirmation === "discard_revision"}
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

type ReasonDialogProps = {
  isOpen: boolean;
  application: ApplicationIntakeController["application"];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: ApplicationIntakeController["confirm"];
};

/** A required, multiline reason field that reports its own emptiness, like the reviewer dialogs. */
const useReason = () => {
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);

  return {
    reason,
    missing,
    setReason: (value: string) => {
      setReason(value);
      setMissing(false);
    },
    /** True when the reason is present; otherwise shows its required error. */
    check: () => {
      setMissing(!reason.trim());
      return Boolean(reason.trim());
    },
  };
};

const ReasonField = ({
  label,
  errorMessage,
  state,
}: {
  label: string;
  errorMessage: string;
  state: ReturnType<typeof useReason>;
}) => (
  <TextField
    label={label}
    isRequired
    multiline
    maxLength={intakeLimits.reasonLength}
    value={state.reason}
    onChange={state.setReason}
    isInvalid={state.missing}
    errorMessage={errorMessage}
  />
);

const useWithdrawalDate = () => {
  const { t } = useTranslation("applicationIntake");
  const [date, setDate] = useState(todayCalendarDate);
  const [problem, setProblem] = useState<
    "intake.withdrawalDateInvalid" | "intake.withdrawalDateFuture" | null
  >(null);

  return {
    date,
    error: problem ? t(problem) : undefined,
    change: (value: string) => {
      setDate(value);
      setProblem(null);
    },
    /** True when the date can be sent; otherwise shows its error. */
    check: () => {
      const error = !calendarDateSchema.safeParse(date).success
        ? "intake.withdrawalDateInvalid"
        : date > latestWithdrawalDate(new Date().toISOString())
          ? "intake.withdrawalDateFuture"
          : null;
      setProblem(error);
      return error === null;
    },
  };
};

const WithdrawDialog = ({
  application,
  outstandingReviews,
  pending,
  error,
  onClose,
  onConfirm,
  isOpen,
}: ReasonDialogProps & { outstandingReviews: number }) => {
  const { t } = useTranslation(["applicationIntake", "common"]);
  const date = useWithdrawalDate();
  const reason = useReason();
  const description = [
    t("intake.withdrawDescription"),
    outstandingReviews > 0 && t("intake.withdrawClosesReviews", { count: outstandingReviews }),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ConfirmationDialog
      title={t("intake.withdrawFor", { title: application.title })}
      description={description}
      cancelLabel={t("common:cancel")}
      confirmLabel={t("intake.withdraw")}
      intent="destructive"
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isPending={pending}
      error={error}
      onConfirm={() => {
        // Check both fields so every problem shows at once.
        const valid = [date.check(), reason.check()].every(Boolean);
        if (valid) {
          void onConfirm({ withdrawnOn: date.date, reason: reason.reason });
        }
      }}
    >
      <DateField
        label={t("intake.withdrawalDate")}
        value={date.date}
        onChange={date.change}
        isRequired
        isInvalid={date.error !== undefined}
        errorMessage={date.error}
      />
      <ReasonField
        label={t("intake.withdrawalReason")}
        errorMessage={t("intake.withdrawalReasonRequired")}
        state={reason}
      />
    </ConfirmationDialog>
  );
};

const ReinstateDialog = ({
  isOpen,
  application,
  pending,
  error,
  onClose,
  onConfirm,
}: ReasonDialogProps) => {
  const { t } = useTranslation(["applicationIntake", "common"]);
  const reason = useReason();

  return (
    <ConfirmationDialog
      title={t("intake.reinstateFor", { title: application.title })}
      description={t("intake.reinstateDescription")}
      cancelLabel={t("common:cancel")}
      confirmLabel={t("intake.reinstate")}
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isPending={pending}
      error={error}
      onConfirm={() => reason.check() && void onConfirm({ reason: reason.reason })}
    >
      <ReasonField
        label={t("intake.reinstateReason")}
        errorMessage={t("intake.reinstateReasonRequired")}
        state={reason}
      />
    </ConfirmationDialog>
  );
};
