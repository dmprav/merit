import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import type { PageSource } from "@merit/query/contracts";
import { RemotePagedContent } from "@merit/query/pages";
import type { ReviewerEvent } from "@merit/reviews/api";
import type { ReviewerSummary } from "@merit/reviews/api";
import { isInvitationExpired, type ReviewerStatus, type ReviewState } from "@merit/reviews/domain";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DateField } from "@merit/ui/date-field";
import { Inline, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PagedContent } from "@merit/ui/paged-content";
import { TextField } from "@merit/ui/text-field";

import type { ManagerReviewerData } from "../../contracts/reviewer";
import { useManagerReviewers } from "../../controllers/reviewer/use-manager-reviewers";
import type { en } from "./messages.en.ts";
import styles from "./reviewer.module.css";

type ManagerReviewersProps = {
  reviews: ReviewState;
  data: ManagerReviewerData;
  onAssignmentsChange: (assignments: ReviewerSummary[]) => void;
};

type ManagerWork = ReturnType<typeof useManagerReviewers>;

type ManagerError =
  | "limited"
  | "inviteInvalid"
  | "reviewerMembershipRequired"
  | "stale"
  | "applicationWithdrawn"
  | "unavailable"
  | null;

type ReviewRequest = ReviewState["requests"][number];

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

export const ManagerReviewers = ({ reviews, data, onAssignmentsChange }: ManagerReviewersProps) => {
  const { t } = useTranslation("reviewer");
  const work = useManagerReviewers(data, reviews.revision);
  useEffect(() => {
    onAssignmentsChange(work.assignments);
  }, [work.assignments, onAssignmentsChange]);
  const inviting = useDialogTarget<ReviewRequest>();
  const revoking = useDialogTarget<ReviewerSummary>();
  const clearing = useDialogTarget<ReviewerSummary>();
  const errorKey = work.error as ManagerError;
  const uninvited = reviews.requests.filter(
    (request) =>
      request.status === "outstanding" &&
      !work.assignments.some((assignment) => assignment.requestId === request.id),
  );

  return (
    <Stack as="section" gap={3} aria-label={t("reviewerAccess")}>
      <h3>{t("reviewerAccess")}</h3>
      {errorKey && (
        <Notice tone="danger" role="alert">
          {t(errorKey)}{" "}
          <Button variant="quiet" onPress={() => void work.refresh()}>
            {t("refresh")}
          </Button>
        </Notice>
      )}
      {work.loaded && !reviews.requests.length && <p>{t("noAssignments")}</p>}
      {work.loaded &&
        uninvited.map((request) => (
          <Inline key={request.id}>
            <span>{request.reviewer}</span>
            <Button
              variant="quiet"
              size="small"
              isDisabled={work.pending}
              onPress={() => inviting.open(request)}
            >
              {t("invite")}
            </Button>
          </Inline>
        ))}
      {work.assignments.map((assignment) => (
        <ReviewerAssignment
          key={assignment.id}
          assignment={assignment}
          historySource={data.historySource?.(assignment)}
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
        closeLabel={t("close")}
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
  detail: "invitationExpired" | "invitationFailed" | "invitationSent" | "invitationPending" | null;
  /** The invitation cannot reach the reviewer until it is resent. */
  needsResend: boolean;
};

/** Combines status, delivery, and expiry so the badge names what the manager must know first. */
const assignmentState = (assignment: ReviewerSummary): AssignmentState => {
  if (isInvitationExpired(assignment)) {
    return {
      label: "invitationState.expired",
      tone: "warning",
      detail: "invitationExpired",
      needsResend: true,
    };
  }
  if (assignment.status === "invited" && assignment.delivery === "failed") {
    return {
      label: "invitationState.undelivered",
      tone: "danger",
      detail: "invitationFailed",
      needsResend: true,
    };
  }
  if (assignment.status === "invited") {
    return {
      label: "status.invited",
      tone: "neutral",
      detail: assignment.delivery === "sent" ? "invitationSent" : "invitationPending",
      needsResend: false,
    };
  }
  return {
    label: `status.${assignment.status}`,
    tone: assignment.status === "conflict" ? "warning" : "neutral",
    detail: null,
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
  const format = useFormat();
  const state = assignmentState(assignment);
  return (
    <Stack gap={3} className={styles.assignment}>
      <Inline>
        <strong>{assignment.reviewer}</strong>
        <Badge tone={state.tone}>{t(state.label)}</Badge>
      </Inline>
      <p className={styles.hint}>
        {assignment.email}
        {assignment.dueDate &&
          ` · ${t("dueOn", { date: format.calendarDate(assignment.dueDate) })}`}
      </p>
      {state.detail && <p>{t(state.detail)}</p>}
      {assignment.conflict && (
        <Notice tone="warning">
          <strong>{t("reportedConflict")}</strong> {assignment.conflict}
        </Notice>
      )}
      {assignment.notification && assignment.notification !== "sent" && (
        <Notice tone="warning">
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
      <AssignmentActions
        assignment={assignment}
        work={work}
        needsResend={state.needsResend}
        onClear={onClear}
        onRevoke={onRevoke}
      />
      <AssignmentHistory history={assignment.history ?? []} source={historySource} />
    </Stack>
  );
};

const AssignmentHistory = ({
  history,
  source,
}: {
  history: ReviewerEvent[];
  source?: PageSource<ReviewerEvent>;
}) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation("reviewer");
  const { formatLocale } = useLocaleSettings();
  return (
    <details className={styles.history} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t("recordHistory")}</summary>
      <RemotePagedContent source={source} entries={history} active={open}>
        {(page) => (
          <PagedContent {...page}>
            {(entries) => (
              <ol>
                {/* Newest first: the latest change usually explains the current status. */}
                {entries.map((event, index) => (
                  <li key={index}>
                    {t(`event.${eventLabel(event.action)}`)} · {event.actor} ·{" "}
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
                    {event.note && <p className={styles.writing}>{event.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </PagedContent>
        )}
      </RemotePagedContent>
    </details>
  );
};

const AssignmentActions = ({
  assignment,
  work,
  needsResend,
  onClear,
  onRevoke,
}: AssignmentProps & { needsResend: boolean }) => {
  const { t } = useTranslation("reviewer");
  return (
    <Inline>
      {assignment.status === "invited" && (
        <Button
          variant={needsResend ? "primary" : "secondary"}
          size="small"
          isDisabled={work.pending}
          onPress={() => void work.manage(assignment, "resend")}
        >
          {t("resend")}
        </Button>
      )}
      {assignment.status === "conflict" && (
        <Button variant="secondary" size="small" isDisabled={work.pending} onPress={onClear}>
          {t("clearConflict")}
        </Button>
      )}
      {assignment.status === "cancelled" ? (
        <Button
          variant="secondary"
          size="small"
          isDisabled={work.pending}
          onPress={() => void work.manage(assignment, "reinstate")}
        >
          {t("reinstate")}
        </Button>
      ) : (
        assignment.status !== "declined" && (
          <Button variant="quiet" size="small" isDisabled={work.pending} onPress={onRevoke}>
            {t("revoke")}
          </Button>
        )
      )}
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
  const [due, setDue] = useState("");
  return (
    <ConfirmationDialog
      title={t("invite")}
      description={t("invitationHelp", { name: request?.reviewer ?? "" })}
      closeLabel={t("close")}
      cancelLabel={t("cancel")}
      confirmLabel={t("invite")}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      isPending={work.pending}
      error={errorKey ? t(errorKey) : null}
      onConfirm={async () => {
        if (request && (await work.invite(request.id, due || null))) {
          onClose();
        }
      }}
    >
      <DateField
        label={t("due")}
        value={due}
        onChange={(value) => setDue(value ?? "")}
        description={t("dueHelp")}
      />
    </ConfirmationDialog>
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
  const [resolution, setResolution] = useState("");
  const [missing, setMissing] = useState(false);
  return (
    <ConfirmationDialog
      title={t("clearConflict")}
      description={t("clearConflictHelp", { name: assignment?.reviewer ?? "" })}
      closeLabel={t("close")}
      cancelLabel={t("cancel")}
      confirmLabel={t("clearConflict")}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      isPending={work.pending}
      error={errorKey ? t(errorKey) : null}
      onConfirm={async () => {
        if (!resolution.trim()) {
          setMissing(true);
          return;
        }
        if (assignment && (await work.manage(assignment, "clear_conflict", resolution))) {
          onClose();
        }
      }}
    >
      {assignment?.conflict && (
        <Stack gap={1}>
          <strong>{t("reportedConflict")}</strong>
          <p className={styles.writing}>{assignment.conflict}</p>
        </Stack>
      )}
      <TextField
        label={t("resolution")}
        isRequired
        multiline
        maxLength={2000}
        value={resolution}
        onChange={(value) => {
          setResolution(value);
          setMissing(false);
        }}
        isInvalid={missing}
        errorMessage={t("resolutionRequired")}
      />
    </ConfirmationDialog>
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
