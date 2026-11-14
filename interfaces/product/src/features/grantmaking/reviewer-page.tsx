import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ReviewerScreen } from "@merit/reviews-web/reviewer";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { Stack } from "@merit/ui/layout";
import linkStyles from "@merit/ui/link.module.css";
import { PageHeader } from "@merit/ui/page-header";
import { StateMessage } from "@merit/ui/state-message";

import { AppPage } from "../../app/app-shell";
import { RouteRetry } from "../../components/route-retry";
import { StandalonePage } from "../../components/standalone-page";
import { PinButton } from "../navigation/pin-button";
import {
  reviewerData,
  reviewerListOptions,
  reviewerPageOptions,
} from "./data/reviews/reviewer-data";

const ReviewerPage = ({
  children,
  assignment,
}: {
  children: ReactNode;
  assignment?: { id: string; applicationTitle: string };
}) => {
  const { t } = useTranslation("reviewer");
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
        <Link to="/reviews" key="reviews">
          {t("title")}
        </Link>,
        ...(assignment ? [assignment.applicationTitle] : []),
      ]}
    >
      {children}
    </AppPage>
  );
};

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

  if (status === "not_found" || status === "forbidden") {
    return (
      <StateMessage
        title={t("web:state.review.notFound.title")}
        description={t("web:state.review.notFound.description")}
      />
    );
  }

  return (
    <StateMessage
      title={t("web:state.review.unavailable.title")}
      description={t("web:state.review.unavailable.description")}
      actions={<RouteRetry>{t("retry")}</RouteRetry>}
    />
  );
};

/** Signed-out reviewers have no personal navigation yet, so sign-in stands alone. */
export const ReviewerSignIn = ({ assignmentId }: { assignmentId?: string }) => (
  <StandalonePage>
    <ReviewerState status="signed_out" assignmentId={assignmentId} />
  </StandalonePage>
);

/** Shows an unreadable assignment list or assignment inside the reviewer's navigation. */
export const ReviewerUnavailable = (props: { status?: string; assignmentId?: string }) => (
  <AppPage centered breadcrumb={null}>
    <ReviewerState {...props} />
  </AppPage>
);

export const ReviewerListPage = () => {
  const { t } = useTranslation("reviewer");
  const { data } = useSuspenseQuery(reviewerListOptions());
  if (data.status !== "ok") {
    return <ReviewerUnavailable status={data.status} />;
  }
  return (
    <ReviewerPage>
      <Stack gap={5}>
        <PageHeader title={t("title")} />
        {!data.value.length && <p>{t("empty")}</p>}
        {data.value.map((assignment) => (
          <Stack as="article" gap={2} key={assignment.id}>
            <h2>
              <Link to="/reviews/$assignmentId" params={{ assignmentId: assignment.id }}>
                {assignment.applicationTitle}
              </Link>
            </h2>
            <p>
              {assignment.organization} · {assignment.applicant}
            </p>
            <p>
              {t(`status.${assignment.status}`)}
              {assignment.dueDate ? ` · ${assignment.dueDate}` : ""}
            </p>
          </Stack>
        ))}
      </Stack>
    </ReviewerPage>
  );
};

export const ReviewerAssignmentPage = ({ assignmentId }: { assignmentId: string }) => {
  const { t } = useTranslation("reviewer");
  const { data: result } = useSuspenseQuery(reviewerPageOptions(assignmentId));
  const data = useMemo(() => reviewerData(assignmentId), [assignmentId]);
  const [dirty, setDirty] = useState(false);
  const blocker = useBlocker({ shouldBlockFn: () => dirty, withResolver: true });
  if (result.status !== "ok") {
    return <ReviewerUnavailable status={result.status} assignmentId={assignmentId} />;
  }
  return (
    <ReviewerPage assignment={result.value.assignment}>
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
