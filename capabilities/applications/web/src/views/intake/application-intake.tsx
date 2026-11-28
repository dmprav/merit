import type { TFunction } from "i18next";
import { useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { intakeContent, intakeLimits, latestWithdrawalDate } from "@merit/applications/domain";
import { calendarDateSchema, todayCalendarDate } from "@merit/dates";
import { useFormat } from "@merit/i18n/format";
import { parseMoney } from "@merit/money";
import { Attribution } from "@merit/ui/attribution";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DateField } from "@merit/ui/date-field";
import { DialogContent, DialogSection, ModalDialog } from "@merit/ui/dialog";
import { Divider } from "@merit/ui/divider";
import { Icon } from "@merit/ui/icon";
import { InlineName } from "@merit/ui/inline-name";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";
import { TextField } from "@merit/ui/text-field";
import { useEventToast, useToastWhile } from "@merit/ui/toast";
import { Tooltip } from "@merit/ui/tooltip";

import type { IntakeSection } from "../../controllers/intake/intake-state";
import type { ApplicationIntakeController } from "../../controllers/intake/use-application-intake";
import styles from "./application-intake.module.css";
import { intakeError } from "./messages";
import { SnapshotPdfList } from "./submitted-pdf-reference";

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
      <div>
        <SectionHeader title={t("workspace.submission")} aside={headingActions} />
        <Stack gap={3}>
          <ReinstateStatus intake={intake} />
          <IntakeTaskFeedback intake={intake} />
        </Stack>
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
    <section aria-label={t("intake.preparation")}>
      <SectionHeader
        title={t("workspace.submission")}
        aside={
          <div className={styles.heading}>
            <IntakeStatus
              preparing={preparing}
              workingRevision={working}
              unsavedContent={unsavedContent}
            />
            <div className={styles.actions}>
              {headingActions}
              {!editingContent &&
                (preparing ? (
                  <Button
                    variant="secondary"
                    isDisabled={
                      !intake.ready || intake.pending || missing.length > 0 || unsavedContent
                    }
                    onPress={() => void intake.markReady()}
                  >
                    {t("intake.markReady")}
                  </Button>
                ) : (
                  working && (
                    <Button
                      variant="secondary"
                      isDisabled={!intake.ready || intake.pending || unsavedContent}
                      onPress={() => void intake.publishRevision()}
                    >
                      {t("intake.recordRevision")}
                    </Button>
                  )
                ))}
            </div>
          </div>
        }
      />
      <Stack gap={3}>
        <IntakeTaskFeedback intake={intake} />
        {preparing && !editingContent && missing.length > 0 && (
          <Text as="p" variant="caption">
            {t("intake.missing", { fields: missing.map((field) => t(fields[field])).join(", ") })}
          </Text>
        )}
        {working && (
          <RevisionPreview
            application={application}
            working={working}
            editingContent={editingContent}
          />
        )}
        {unsavedContent && !editingContent && (
          <Text as="p" variant="caption">
            {t("intake.unsavedContent")}
          </Text>
        )}
      </Stack>
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
    <Stack as="section" gap={4} aria-label={t("intake.withdrawn")}>
      <Divider spacing={4} />
      <div>
        <SectionHeader
          level={3}
          title={t("intake.withdrawnOn", { date: calendarDate(withdrawal.withdrawnOn) })}
          aside={action}
        />
        <Stack gap={3}>
          <Attribution actor={withdrawal.recorder.name} />
          <Reading as="p">{withdrawal.reason}</Reading>
        </Stack>
      </div>
      <Divider spacing={4} />
    </Stack>
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
      <Badge appearance="plain">{t(status)}</Badge>
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
      <Text as="p" variant="caption">
        {t("intake.currentVersionUnchanged", { version: application.version })}
      </Text>
      <ModalDialog
        title={t(editingContent ? "intake.currentSubmission" : "intake.previewRevision")}
        trigger={
          <Button variant="quiet">
            {t(editingContent ? "intake.viewCurrentSubmission" : "intake.previewRevision")}
          </Button>
        }
      >
        <DialogContent reading>
          <Reading prose={false}>
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
            {Boolean(preview.pdfs?.length) && (
              <DialogSection title={t("pdfs.title")}>
                <SnapshotPdfList pdfs={preview.pdfs ?? []} />
              </DialogSection>
            )}
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
    | "hasCommitment"
  >;
}) => {
  const { t } = useTranslation(["applicationIntake", "common"]);
  const { confirmation, error: failure, saved } = intake;
  useEventToast(saved, { tone: "success", message: t("intake.saved") });
  const error =
    confirmation && failure?.status === "conflict"
      ? t("intake.confirmationConflict")
      : intakeError(t, failure);

  return (
    <>
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

export const useIntakeRefreshToast = (
  intake: Pick<ApplicationIntakeController, "refreshError" | "refresh">,
) => {
  const { t } = useTranslation("applicationIntake");

  useToastWhile(
    intake.refreshError
      ? {
          tone: "warning",
          message: t("intake.refreshError"),
          action: { label: t("intake.refresh"), onPress: () => void intake.refresh() },
        }
      : null,
  );
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
    | "hasCommitment"
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
        hasCommitment={intake.hasCommitment}
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

/** A funded decision blocks withdrawal, so explain the next step instead of offering the form. */
const WithdrawBlockedDialog = ({
  application,
  isOpen,
  onClose,
}: Pick<ReasonDialogProps, "application" | "isOpen" | "onClose">) => {
  const { t } = useTranslation("applicationIntake");

  return (
    <ModalDialog
      title={t("intake.withdrawFor", { title: application.title })}
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
    >
      {({ close }) => (
        <DialogContent
          footer={
            <Inline justify="end">
              <Button variant="secondary" autoFocus onPress={close}>
                {t("intake.close")}
              </Button>
            </Inline>
          }
        >
          <p>{t("intake.hasCommitment")}</p>
        </DialogContent>
      )}
    </ModalDialog>
  );
};

const WithdrawDialog = ({
  application,
  outstandingReviews,
  hasCommitment,
  ...props
}: ReasonDialogProps & { outstandingReviews: number; hasCommitment: boolean }) =>
  hasCommitment ? (
    <WithdrawBlockedDialog
      application={application}
      isOpen={props.isOpen}
      onClose={props.onClose}
    />
  ) : (
    <WithdrawForm application={application} outstandingReviews={outstandingReviews} {...props} />
  );

const WithdrawForm = ({
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
