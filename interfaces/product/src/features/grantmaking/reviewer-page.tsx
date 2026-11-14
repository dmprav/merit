import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import { ReviewerScreen } from "@merit/reviews-web/reviewer";
import type { ReviewerPage as AssignmentPage, ReviewerSummary } from "@merit/reviews/api";
import { DataTable, type TableColumn } from "@merit/tables";
import { Badge } from "@merit/ui/badge";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { Stack } from "@merit/ui/layout";
import linkStyles from "@merit/ui/link.module.css";
import { PageHeader } from "@merit/ui/page-header";
import { SectionHeader } from "@merit/ui/section-header";
import { StateMessage } from "@merit/ui/state-message";

import { AppPage } from "../../app/app-shell";
import { WorkspaceStatusPage } from "../../app/workspace-page";
import { StandalonePage } from "../../components/standalone-page";
import { WorkspaceState } from "../../components/workspace-state";
import { PinButton } from "../navigation/pin-button";
import {
  reviewerData,
  reviewerListOptions,
  reviewerPageOptions,
} from "./data/reviews/reviewer-data";
import styles from "./my-work.module.css";

const ReviewerPage = ({
  children,
  assignment,
  workspaceSlug,
}: {
  children: ReactNode;
  workspaceSlug: string;
  assignment?: { id: string; applicationTitle: string };
}) => {
  const { t } = useTranslation(["reviewer", "web"]);
  return (
    <AppPage
      width="full"
      contained={Boolean(assignment)}
      badge={
        assignment && (
          <PinButton
            target={{ kind: "review", id: assignment.id }}
            title={assignment.applicationTitle}
          />
        )
      }
      breadcrumb={[
        <Link to="/app/$workspaceSlug/work" params={{ workspaceSlug }} key="work">
          {t("web:navigation.myWork")}
        </Link>,
        ...(assignment ? [assignment.applicationTitle] : []),
      ]}
    >
      {children}
    </AppPage>
  );
};

const reviewFailureStatus = (status?: string) =>
  status === "not_found" || status === "forbidden" ? "not_found" : "unavailable";

const ReviewerState = ({
  status = "unavailable",
  assignmentId,
}: {
  status?: string;
  assignmentId?: string;
}) => {
  const { t } = useTranslation(["reviewer", "onboarding", "web"]);
  if (status === "signed_out") {
    return (
      <StateMessage
        title={t("onboarding:signIn")}
        description={t("signInHelp")}
        actions={
          <Link
            to="/app/sign-in"
            search={{ returnTo: assignmentId ? `/reviews/${assignmentId}` : "/reviews" }}
            className={linkStyles.button}
          >
            {t("onboarding:signIn")}
          </Link>
        }
      />
    );
  }

  return <WorkspaceState resource="review" status={reviewFailureStatus(status)} />;
};

/** Legacy links disclose only an authorized invitation until workspace membership is accepted. */
export const ReviewerEntry = ({
  page,
  status,
  assignmentId,
}: {
  page?: AssignmentPage;
  status?: string;
  assignmentId?: string;
}) => (
  <StandalonePage>
    {page ? (
      <ReviewerScreen initial={page} data={reviewerData(page.assignment.id)} />
    ) : (
      <ReviewerState status={status} assignmentId={assignmentId} />
    )}
  </StandalonePage>
);

/** Shows an unreadable assignment list or assignment inside the reviewer's navigation. */
export const ReviewerUnavailable = (props: { status?: string; assignmentId?: string }) =>
  props.status === "signed_out" ? (
    <AppPage centered breadcrumb={null}>
      <ReviewerState {...props} />
    </AppPage>
  ) : (
    <WorkspaceStatusPage resource="review" status={reviewFailureStatus(props.status)} />
  );

export const MyWorkPage = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const format = useFormat();
  const { t } = useTranslation(["reviewer", "web"]);
  const { data } = useSuspenseQuery(reviewerListOptions(workspaceSlug));
  if (data.status !== "ok") {
    return <ReviewerUnavailable status={data.status} />;
  }
  const columns: TableColumn<ReviewerSummary>[] = [
    {
      id: "application",
      header: t("web:work.application"),
      layout: { primary: true },
      cell: (assignment) => (
        <Stack gap={1}>
          <Link
            className={linkStyles.text}
            to="/app/$workspaceSlug/work/$assignmentId"
            params={{ workspaceSlug, assignmentId: assignment.id }}
          >
            {assignment.applicationTitle}
          </Link>
          <span className={styles.supporting}>{assignment.applicant}</span>
        </Stack>
      ),
    },
    {
      id: "status",
      header: t("web:work.status"),
      layout: { width: "25%" },
      cell: (assignment) => (
        <Badge
          tone={
            assignment.status === "submitted"
              ? "success"
              : assignment.status === "conflict"
                ? "warning"
                : "neutral"
          }
        >
          {t(`status.${assignment.status}`)}
        </Badge>
      ),
    },
    {
      id: "due",
      header: t("due"),
      layout: { width: "25%" },
      cell: (assignment) =>
        assignment.dueDate ? (
          <time dateTime={assignment.dueDate}>{format.calendarDate(assignment.dueDate)}</time>
        ) : (
          <span className={styles.supporting}>{t("noDue")}</span>
        ),
    },
  ];
  return (
    <ReviewerPage workspaceSlug={workspaceSlug}>
      <PageHeader title={t("web:navigation.myWork")} />
      <section aria-label={t("assigned")}>
        <SectionHeader title={t("assigned")} count={data.value.length} />
        <DataTable
          data={data.value}
          columns={columns}
          getRowId={(assignment) => assignment.id}
          label={t("assigned")}
          emptyMessage={t("empty")}
        />
      </section>
    </ReviewerPage>
  );
};

export const ReviewerAssignmentPage = ({
  assignmentId,
  workspaceSlug,
}: {
  assignmentId: string;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation(["reviewer", "web"]);
  const { data: result } = useSuspenseQuery(reviewerPageOptions(assignmentId, workspaceSlug));
  const data = useMemo(
    () => reviewerData(assignmentId, workspaceSlug),
    [assignmentId, workspaceSlug],
  );
  const [dirty, setDirty] = useState(false);
  const blocker = useBlocker({ shouldBlockFn: () => dirty, withResolver: true });
  if (result.status !== "ok") {
    return <ReviewerUnavailable status={result.status} assignmentId={assignmentId} />;
  }
  return (
    <ReviewerPage workspaceSlug={workspaceSlug} assignment={result.value.assignment}>
      <ReviewerScreen
        key={assignmentId}
        initial={result.value}
        data={data}
        onDirtyChange={setDirty}
      />
      <ConfirmationDialog
        title={t("leaveTitle")}
        description={t("leaveHelp")}
        closeLabel={t("close")}
        cancelLabel={t("stay")}
        confirmLabel={t("leave")}
        isOpen={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) {
            blocker.reset?.();
          }
        }}
        onConfirm={() => blocker.proceed?.()}
      />
    </ReviewerPage>
  );
};
