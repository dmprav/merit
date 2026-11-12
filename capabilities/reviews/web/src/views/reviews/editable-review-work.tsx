import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import type { ReviewerSummary } from "@merit/reviews/api";
import type { ReviewState } from "@merit/reviews/domain";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Inline } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { StatusMessage } from "@merit/ui/status-message";
import { Tooltip } from "@merit/ui/tooltip";

import type { ReviewProps, ReviewData } from "../../contracts/reviews";
import { useReview } from "../../controllers/reviews/use-review";
import { ManagerReviewers } from "../reviewer/manager-reviewers";
import { reviewError } from "./messages";
import { RequestPicker } from "./request-picker";
import { ReviewContent } from "./review-content";
import { ReviewForm } from "./review-form";
import styles from "./review-work.module.css";

export const EditableReviewWork = ({
  application,
  round,
  availableApplicationVersions = [],
  selectedId,
  onInspectVersion,
  data,
}: ReviewProps & { data: ReviewData }) => {
  const { t } = useTranslation("reviews");
  const work = useReview({ application, round, availableApplicationVersions, data });
  const { draft, editing, resume, state, pending, saving, requestFollowUp, start } = work;
  const [assignments, setAssignments] = useState<ReviewerSummary[]>([]);

  return (
    <ReviewContent
      selectedId={selectedId}
      onInspectVersion={onInspectVersion}
      application={application}
      round={round}
      headerActions={<ReviewActions work={work} workspaceSlug={data.workspaceSlug} />}
      feedback={
        <>
          {data.participation && (
            <ManagerReviewers
              reviews={state}
              data={data.participation}
              onAssignmentsChange={setAssignments}
            />
          )}
          {selectedId && draft && !editing && (
            <Tooltip content={t("resume")}>
              <Button
                variant="quiet"
                iconOnly
                data-draft
                aria-label={t("resume")}
                onPress={() => resume()}
              >
                <Icon name="edit" />
              </Button>
            </Tooltip>
          )}
          <ReviewFeedback work={work} />
          <ReviewEditor work={work} application={application} round={round} data={data} />
        </>
      }
      assessmentActions={(assessment) => (
        <ActionMenu
          label={t("reviewActions", { name: assessment.reviewer })}
          trigger={
            <Button
              variant="quiet"
              size="small"
              iconOnly
              aria-label={t("reviewActions", { name: assessment.reviewer })}
              isDisabled={Boolean(draft) || saving}
            >
              <Icon name="more" />
            </Button>
          }
          items={assessmentItems(assessment, pending, t)}
          onAction={(action) =>
            action === "edit"
              ? start("edit", assessment.contactId, assessment.id)
              : action === "request"
                ? void requestFollowUp(assessment.contactId)
                : start("record", assessment.contactId)
          }
        />
      )}
      requestActions={(request) => (
        <RequestActions
          request={request}
          assigned={assignments.some((assignment) => assignment.requestId === request.id)}
          work={work}
          workspaceSlug={data.workspaceSlug}
        />
      )}
    />
  );
};

const ReviewActions = ({
  work,
  workspaceSlug,
}: {
  work: ReturnType<typeof useReview>;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation("reviews");
  const { draft, editing, close, resume, pending, saving, beginRequest, start } = work;

  return (
    <Inline>
      {draft ? (
        <Tooltip content={t(editing ? "close" : "resume")}>
          <Button
            variant="quiet"
            iconOnly
            data-draft={!editing || undefined}
            aria-label={t(editing ? "close" : "resume")}
            onPress={() => (editing ? close() : resume())}
          >
            <Icon name={editing ? "close" : "edit"} />
          </Button>
        </Tooltip>
      ) : (
        <>
          <RequestPicker
            workspaceSlug={workspaceSlug}
            disabledContactIds={pending.map((request) => request.contactId)}
            trigger={
              <Button size="small" variant="quiet" isDisabled={saving}>
                {t("request")}
              </Button>
            }
            onBegin={beginRequest}
          />
          <Button
            size="small"
            variant="secondary"
            isDisabled={saving}
            onPress={() => start("record")}
          >
            {t("record")}
          </Button>
        </>
      )}
    </Inline>
  );
};

const RequestActions = ({
  request,
  assigned,
  work,
  workspaceSlug,
}: {
  request: ReviewState["requests"][number];
  assigned: boolean;
  work: ReturnType<typeof useReview>;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation("reviews");
  const {
    draft,
    saving,
    start,
    replacementId,
    pending,
    closeReplacement,
    beginRequest,
    replaceRequest,
    cancelRequest,
  } = work;

  return (
    <Inline className={styles.requestActions}>
      <RecordRequestButton
        assigned={assigned}
        disabled={Boolean(draft) || saving}
        onPress={() => start("record", request.contactId)}
      />
      {replacementId === request.id ? (
        <RequestPicker
          initiallyOpen
          replacing
          workspaceSlug={workspaceSlug}
          disabledContactIds={pending.map((item) => item.contactId)}
          onClose={closeReplacement}
          trigger={
            <Button size="small" variant="quiet" iconOnly aria-label={t("replace")}>
              <Icon name="more" />
            </Button>
          }
          onBegin={() => beginRequest(request.id)}
        />
      ) : (
        <ActionMenu
          label={t("requestActions", { name: request.reviewer })}
          trigger={
            <Button
              size="small"
              variant="quiet"
              iconOnly
              aria-label={t("requestActions", { name: request.reviewer })}
              isDisabled={Boolean(draft) || saving}
            >
              <Icon name="more" />
            </Button>
          }
          items={[
            { id: "replace", label: t("replace") },
            { id: "cancel", label: t("cancelRequest") },
          ]}
          onAction={(action) => {
            if (action === "replace") {
              replaceRequest(request.id);
            } else {
              void cancelRequest(request.id);
            }
          }}
        />
      )}
    </Inline>
  );
};

const assessmentItems = (
  assessment: ReviewState["assessments"][number],
  pending: ReviewState["requests"],
  t: TFunction<"reviews">,
) => [
  ...(!assessment.authorUserId ? [{ id: "edit", label: t("edit") }] : []),
  { id: "followUp", label: t("followUp") },
  ...(!pending.some((request) => request.contactId === assessment.contactId)
    ? [{ id: "request", label: t("requestFollowUp") }]
    : []),
];

const RecordRequestButton = ({
  assigned,
  disabled,
  onPress,
}: {
  assigned: boolean;
  disabled: boolean;
  onPress: () => void;
}) => {
  const { t } = useTranslation("reviews");
  return assigned ? null : (
    <Button size="small" variant="quiet" isDisabled={disabled} onPress={onPress}>
      {t("record")}
    </Button>
  );
};

const ReviewEditor = ({
  work,
  application,
  round,
  data,
}: {
  work: ReturnType<typeof useReview>;
  application: ReviewProps["application"];
  round: ReviewProps["round"];
  data: ReviewData;
}) => {
  const { t } = useTranslation("reviews");
  const {
    draft,
    editing,
    close,
    resume,
    saving,
    conflict,
    discard,
    keepDraft,
    state,
    versions,
    updateValues,
    saveDraft,
  } = work;
  const criteriaHistory = round.criteriaHistory;
  return (
    <FormDialog
      title={t(draft?.mode === "request" ? "request" : draft?.mode === "edit" ? "edit" : "record")}
      context={draft?.mode === "request" ? undefined : application.title}
      size={draft?.mode === "request" ? "default" : "wide"}
      trigger={null}
      closeLabel={t("close")}
      isOpen={Boolean(editing && draft)}
      onOpenChange={(open) => {
        if (!open) {
          close();
        } else {
          resume();
        }
      }}
      isDismissDisabled={saving}
    >
      {draft && (
        <>
          {conflict && (
            <Notice as="div" tone="warning">
              <p>{t("conflict")}</p>
              <p>{t("reviewLatest")}</p>
              <Inline>
                <Button variant="secondary" onPress={discard}>
                  {t("useSaved")}
                </Button>
                <Button variant="secondary" onPress={keepDraft}>
                  {t("keepDraft")}
                </Button>
              </Inline>
            </Notice>
          )}
          <ReviewForm
            key={draft.id}
            draft={draft}
            followUp={state.assessments.some((item) => item.contactId === draft.values.contactId)}
            conflict={conflict}
            workspaceSlug={data.workspaceSlug}
            versions={[...versions]
              .sort((a, b) => b - a)
              .map((version) => ({
                id: String(version),
                label: t(version === application.version ? "currentVersion" : "version", {
                  version,
                }),
              }))}
            criteriaHistory={criteriaHistory}
            onChange={updateValues}
            onDiscard={discard}
            onClose={close}
            onSave={saveDraft}
          />
        </>
      )}
    </FormDialog>
  );
};

const ReviewFeedback = ({ work }: { work: ReturnType<typeof useReview> }) => {
  const { t } = useTranslation("reviews");
  const { error, refreshError, refreshing, refresh, saved } = work;
  return (
    <>
      {error && (
        <Notice role="alert" tone="danger">
          {reviewError(t, error)}
        </Notice>
      )}
      {refreshError && (
        <Notice role="alert" tone="warning">
          {t(refreshError === "saved" ? "refreshError" : "refreshReadError")}{" "}
          <Button variant="quiet" isDisabled={refreshing} onPress={() => void refresh()}>
            {t("retry")}
          </Button>
        </Notice>
      )}
      <StatusMessage
        message={saved ? t("saved") : null}
        eventId={saved}
        confirmation={Boolean(saved)}
      />
    </>
  );
};
