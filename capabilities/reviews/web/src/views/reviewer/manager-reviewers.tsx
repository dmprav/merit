import { useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Form, FormActions, FormDateField, FormDialog, FormTextField, useForm } from "@merit/forms";
import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import type { PageSource } from "@merit/query/contracts";
import { RemotePagedContent } from "@merit/query/pages";
import type { ReviewerEvent } from "@merit/reviews/api";
import type { ReviewerSummary } from "@merit/reviews/api";
import {
  isInvitationExpired,
  type ReviewerProblem,
  type ReviewerStatus,
  type ReviewState,
} from "@merit/reviews/domain";
import { ActionMenu } from "@merit/ui/action-menu";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { Icon } from "@merit/ui/icon";
import { Inline, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PagedContent } from "@merit/ui/paged-content";
import { PersonIdentity } from "@merit/ui/person-identity";
import { useReadingNavigation } from "@merit/ui/reference-workspace";

import type { useManagerReviewers } from "../../controllers/reviewer/use-manager-reviewers";
import type { en } from "./messages.en.ts";
import styles from "./reviewer.module.css";

type ManagerReviewersProps = {
  reviews: ReviewState;
  work: ManagerWork;
};

type ManagerWork = NonNullable<ReturnType<typeof useManagerReviewers>>;

type ManagerError =
  | "limited"
  | "inviteInvalid"
  | "reviewerMembershipRequired"
  | "contactUnavailable"
  | "contactEmailRequired"
  | "managerEmailRequired"
  | "stale"
  | "applicationWithdrawn"
  | "unavailable"
  | null;

const invalidErrors: Partial<Record<ReviewerProblem, ManagerError>> = {
  application_withdrawn: "applicationWithdrawn",
  workspace_membership_required: "reviewerMembershipRequired",
  contact_unavailable: "contactUnavailable",
  contact_email_required: "contactEmailRequired",
  manager_email_required: "managerEmailRequired",
  invitation_exists: "stale",
  request_unavailable: "stale",
  action_unavailable: "stale",
};

type ReviewRequest = ReviewState["requests"][number];

const managerError = (failure: ManagerWork["failure"]): ManagerError => {
  if (!failure) {
    return null;
  }
  if (failure.status === "invalid") {
    return invalidErrors[failure.error] ?? "inviteInvalid";
  }
  if (failure.status === "limited") {
    return "limited";
  }
  return failure.status === "conflict" ? "stale" : "unavailable";
};

/**
 * Keeps the dialog's subject while it closes, so its title and text do not empty mid-exit.
 * `key` changes on every opening; keying the dialog with it starts each one with fresh input.
 */
const useDialogTarget = <T,>() => {
  const [state, setState] = useState<{ target: T | null; isOpen: boolean; key: number }>({
    target: null,
    isOpen: false,
    key: 0,
  });
  return {
    ...state,
    open: (target: T) => setState((current) => ({ target, isOpen: true, key: current.key + 1 })),
    close: () => setState((current) => ({ ...current, isOpen: false })),
  };
};

export const ManagerReviewers = ({ reviews, work }: ManagerReviewersProps) => {
  const { t } = useTranslation("reviewer");
  const inviting = useDialogTarget<ReviewRequest>();
  const revoking = useDialogTarget<ReviewerSummary>();
  const clearing = useDialogTarget<ReviewerSummary>();
  const errorKey = managerError(work.failure);
  const uninvited = reviews.requests.filter(
    (request) =>
      request.status === "outstanding" &&
      !work.assignments.some((assignment) => assignment.requestId === request.id),
  );

  return (
    <Stack as="section" gap={3} aria-label={t("reviewerAccess")}>
      {errorKey && !inviting.isOpen && !clearing.isOpen && !revoking.isOpen && (
        <Notice appearance="inline" tone="danger" role="alert">
          {t(errorKey)}{" "}
          <Button variant="quiet" isDisabled={work.pending} onPress={() => void work.refresh()}>
            {t("refresh")}
          </Button>
        </Notice>
      )}
      {work.refreshError && (
        <Notice appearance="inline" tone="warning" role="alert">
          {t(
            work.refreshError === "saved"
              ? "participationSavedRefreshError"
              : "participationReadError",
          )}{" "}
          <Button variant="quiet" isDisabled={work.pending} onPress={() => void work.refresh()}>
            {t("refresh")}
          </Button>
        </Notice>
      )}
      {work.loaded && !reviews.requests.length && <p>{t("noAssignments")}</p>}
      {work.loaded &&
        uninvited.map((request) => (
          <div key={request.id} className={styles.assignmentRow}>
            <PersonIdentity name={request.reviewer} />
            <span className={styles.hint}>{t("notInvited")}</span>
            <Button
              variant="secondary"
              size="small"
              isDisabled={work.pending}
              onPress={() => inviting.open(request)}
            >
              {t("invite")}
            </Button>
          </div>
        ))}
      {work.assignments.map((assignment) => (
        <ReviewerAssignment
          key={assignment.id}
          assignment={assignment}
          historySource={work.historySource?.(assignment)}
          work={work}
          onClear={() => clearing.open(assignment)}
          onRevoke={() => revoking.open(assignment)}
        />
      ))}
      <InviteReviewerDialog
        key={`invite-${inviting.key}`}
        work={work}
        errorKey={errorKey}
        request={inviting.target}
        isOpen={inviting.isOpen}
        onClose={inviting.close}
      />
      <ClearConflictDialog
        key={`clear-${clearing.key}`}
        work={work}
        errorKey={errorKey}
        assignment={clearing.target}
        isOpen={clearing.isOpen}
        onClose={clearing.close}
      />
      <ConfirmationDialog
        title={t("revokeTitle", { name: revoking.target?.reviewer ?? "" })}
        description={t("revokeHelp")}
        cancelLabel={t("cancel")}
        confirmLabel={t("revoke")}
        intent="destructive"
        isOpen={revoking.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            revoking.close();
          }
        }}
        isPending={work.pending}
        error={errorKey ? t(errorKey) : null}
        onConfirm={async () => {
          if (revoking.target && (await work.manage(revoking.target, "cancel"))) {
            revoking.close();
          }
        }}
      />
    </Stack>
  );
};

type AssignmentState = {
  label: `status.${ReviewerStatus}` | `invitationState.${keyof typeof en.invitationState}`;
  tone: "neutral" | "warning" | "danger";
  /** The invitation cannot reach the reviewer until it is resent. */
  needsResend: boolean;
};

/** Combines status, delivery, and expiry so the badge names what the manager must know first. */
const assignmentState = (assignment: ReviewerSummary): AssignmentState => {
  if (isInvitationExpired(assignment)) {
    return {
      label: "invitationState.expired",
      tone: "warning",
      needsResend: true,
    };
  }
  if (assignment.status === "invited" && assignment.delivery === "failed") {
    return {
      label: "invitationState.undelivered",
      tone: "danger",
      needsResend: true,
    };
  }
  if (assignment.status === "invited") {
    return {
      label: "status.invited",
      tone: "neutral",
      needsResend: false,
    };
  }
  return {
    label: `status.${assignment.status}`,
    tone: assignment.status === "conflict" ? "warning" : "neutral",
    needsResend: false,
  };
};

type AssignmentProps = {
  historySource?: PageSource<ReviewerEvent>;
  assignment: ManagerWork["assignments"][number];
  work: ManagerWork;
  onClear: () => void;
  onRevoke: () => void;
};

const ReviewerAssignment = ({
  assignment,
  work,
  onClear,
  onRevoke,
  historySource,
}: AssignmentProps) => {
  const { t } = useTranslation("reviewer");
  const state = assignmentState(assignment);
  const {
    destination: historyOpen,
    heading: historyHeading,
    root,
    open,
    back,
  } = useReadingNavigation<true>();
  const historyTrigger = useRef<HTMLButtonElement>(null);
  return (
    <section ref={root} className={styles.assignment} aria-label={assignment.reviewer}>
      {historyOpen ? (
        <Stack gap={4}>
          <Inline>
            <Button variant="quiet" size="small" alignment="start" onPress={back}>
              {t("backToReviewers")}
            </Button>
            <h3 ref={historyHeading} tabIndex={-1} className={styles.noteTitle}>
              {t("historyFor", { name: assignment.reviewer })}
            </h3>
          </Inline>
          <AssignmentHistory history={assignment.history ?? []} source={historySource} />
        </Stack>
      ) : (
        <Stack gap={3}>
          <div className={styles.assignmentRow}>
            <PersonIdentity name={assignment.reviewer} description={assignment.email} />
            <AssignmentActions
              assignment={assignment}
              work={work}
              triggerRef={historyTrigger}
              onClear={onClear}
              onRevoke={onRevoke}
              onHistory={() => {
                open(true, () => historyTrigger.current);
              }}
            />
            <AssignmentFacts assignment={assignment} state={state} />
          </div>
          {assignment.conflict && (
            <p className={styles.writing}>
              <span className={styles.hint}>{t("reportedConflict")}: </span>
              {assignment.conflict}
            </p>
          )}
          {assignment.notification && assignment.notification !== "sent" && (
            <Notice appearance="inline" tone="warning">
              {t("notificationFailed")}{" "}
              <Button
                variant="quiet"
                isDisabled={work.pending}
                onPress={() => void work.manage(assignment, "retry_notification")}
              >
                {t("retryNotification")}
              </Button>
            </Notice>
          )}
        </Stack>
      )}
    </section>
  );
};

const AssignmentFacts = ({
  assignment,
  state,
}: {
  assignment: ReviewerSummary;
  state: AssignmentState;
}) => {
  const { t } = useTranslation("reviewer");
  const format = useFormat();
  return (
    <dl className={styles.assignmentFacts}>
      <div>
        <dt>{t("participation")}</dt>
        <dd>
          <Badge tone={assignment.status === "conflict" ? "warning" : "neutral"}>
            {t(
              assignment.status === "invited" &&
                (state.needsResend || assignment.delivery !== "sent")
                ? "notAccepted"
                : `status.${assignment.status}`,
            )}
          </Badge>
        </dd>
      </div>
      <div>
        <dt>{t("due")}</dt>
        <dd>{assignment.dueDate ? format.calendarDate(assignment.dueDate) : t("noDue")}</dd>
      </div>
      {assignment.status === "invited" && (
        <div>
          <dt>{t("delivery")}</dt>
          <dd>
            {state.needsResend ? (
              <Badge tone={state.tone}>{t(state.label)}</Badge>
            ) : (
              t(assignment.delivery === "sent" ? "invitationSent" : "invitationPending")
            )}
          </dd>
        </div>
      )}
    </dl>
  );
};

const AssignmentHistory = ({
  history,
  source,
}: {
  history: ReviewerEvent[];
  source?: PageSource<ReviewerEvent>;
}) => {
  const { t } = useTranslation("reviewer");
  const { formatLocale } = useLocaleSettings();
  return (
    <RemotePagedContent source={source} entries={history} active>
      {(page) => (
        <PagedContent {...page}>
          {(entries) => (
            <ol className={styles.events}>
              {/* Newest first: the latest change usually explains the current status. */}
              {entries.map((event, index) => (
                <li key={index}>
                  <div className={styles.eventHeading}>
                    <span>{t(`event.${eventLabel(event.action)}`)}</span>
                    <time dateTime={event.at} title={event.at}>
                      {new Date(event.at).toLocaleString(formatLocale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}{" "}
                      UTC
                    </time>
                  </div>
                  <p className={styles.hint}>{event.actor}</p>
                  {event.note && <p className={styles.writing}>{event.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </PagedContent>
      )}
    </RemotePagedContent>
  );
};

const AssignmentActions = ({
  assignment,
  work,
  onClear,
  onRevoke,
  onHistory,
  triggerRef,
}: AssignmentProps & { onHistory: () => void; triggerRef: Ref<HTMLButtonElement> }) => {
  const { t } = useTranslation("reviewer");
  const items = [
    ...(assignment.status === "invited" ? [{ id: "resend", label: t("resend") }] : []),
    ...(!["cancelled", "declined"].includes(assignment.status)
      ? [{ id: "revoke", label: t("revoke") }]
      : []),
    { id: "history", label: t("recordHistory") },
  ];
  return (
    <Inline>
      {assignment.status === "conflict" && (
        <Button variant="secondary" size="small" isDisabled={work.pending} onPress={onClear}>
          {t("clearConflict")}
        </Button>
      )}
      {assignment.status === "cancelled" && (
        <Button
          variant="secondary"
          size="small"
          isDisabled={work.pending}
          onPress={() => void work.manage(assignment, "reinstate")}
        >
          {t("reinstate")}
        </Button>
      )}
      <ActionMenu
        label={t("reviewerActions", { name: assignment.reviewer })}
        trigger={
          <Button
            ref={triggerRef}
            variant="quiet"
            size="small"
            iconOnly
            isDisabled={work.pending}
            aria-label={t("reviewerActions", { name: assignment.reviewer })}
          >
            <Icon name="more" />
          </Button>
        }
        items={items}
        onAction={(action) => {
          if (action === "history") {
            onHistory();
          } else if (action === "revoke") {
            onRevoke();
          } else {
            void work.manage(assignment, "resend");
          }
        }}
      />
    </Inline>
  );
};

type DialogProps<T> = {
  work: ManagerWork;
  errorKey: ManagerError;
  isOpen: boolean;
  onClose: () => void;
} & T;

const InviteReviewerDialog = ({
  work,
  errorKey,
  request,
  isOpen,
  onClose,
}: DialogProps<{ request: ReviewRequest | null }>) => {
  const { t } = useTranslation("reviewer");
  const { form, submission } = useForm({
    defaultValues: { due: "" },
    schema: z.object({ due: z.union([z.literal(""), z.iso.date(t("dateInvalid"))]) }),
    onSubmit: async ({ due }) => {
      if (request && (await work.invite(request.id, due || null))) {
        onClose();
      }
      return null;
    },
    submitErrorMessage: t("unavailable"),
  });
  const status = {
    ...submission,
    isSubmitting: submission.isSubmitting || work.pending,
    error: errorKey ? t(errorKey) : submission.error,
  };
  return (
    <FormDialog
      title={t("invite")}
      context={request?.reviewer}
      trigger={null}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      isDismissDisabled={status.isSubmitting}
    >
      <Form
        label={t("invite")}
        submission={status}
        actions={
          <FormActions
            submission={status}
            onCancel={onClose}
            cancelLabel={t("cancel")}
            submitLabel={t("invite")}
            submittingLabel={t("sending")}
          />
        }
      >
        <form.Field name="due">
          {(field) => <FormDateField field={field} label={t("due")} />}
        </form.Field>
      </Form>
    </FormDialog>
  );
};

const ClearConflictDialog = ({
  work,
  errorKey,
  assignment,
  isOpen,
  onClose,
}: DialogProps<{ assignment: ReviewerSummary | null }>) => {
  const { t } = useTranslation("reviewer");
  const { form, submission } = useForm({
    defaultValues: { resolution: "" },
    schema: z.object({ resolution: z.string().trim().min(1, t("resolutionRequired")).max(2000) }),
    onSubmit: async ({ resolution }) => {
      if (assignment && (await work.manage(assignment, "clear_conflict", resolution))) {
        onClose();
      }
      return null;
    },
    submitErrorMessage: t("unavailable"),
  });
  const status = {
    ...submission,
    isSubmitting: submission.isSubmitting || work.pending,
    error: errorKey ? t(errorKey) : submission.error,
  };
  return (
    <FormDialog
      title={t("clearConflict")}
      context={assignment?.reviewer}
      trigger={null}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      isDismissDisabled={status.isSubmitting}
    >
      <Form
        label={t("clearConflict")}
        submission={status}
        actions={
          <FormActions
            submission={status}
            onCancel={onClose}
            cancelLabel={t("cancel")}
            submitLabel={t("clearConflict")}
            submittingLabel={t("working")}
          />
        }
      >
        {assignment?.conflict && (
          <div>
            <p className={styles.hint}>{t("reportedConflict")}</p>
            <p className={styles.writing}>{assignment.conflict}</p>
          </div>
        )}
        <p>{t("clearConflictHelp", { name: assignment?.reviewer ?? "" })}</p>
        <form.Field name="resolution">
          {(field) => (
            <FormTextField
              field={field}
              label={t("resolution")}
              isRequired
              multiline
              rows={3}
              maxLength={2000}
            />
          )}
        </form.Field>
      </Form>
    </FormDialog>
  );
};

const eventLabels = {
  "review_assignment.invited": "invite",
  "review_assignment.invitation_renewed": "resend",
  "review_assignment.accepted": "accept",
  "review_assignment.declined": "decline",
  "review_assignment.withdrawn": "withdrawn",
  "review_assignment.conflict_reported": "report_conflict",
  "review_assignment.conflict_cleared": "clear_conflict",
  "review_assignment.access_ended": "cancel",
  "review_assignment.reinstated": "reinstate",
  "assessment.submitted": "submit",
  "assessment.amended": "amend",
} as const;

const eventLabel = (action: string) => eventLabels[action as keyof typeof eventLabels] ?? "changed";
