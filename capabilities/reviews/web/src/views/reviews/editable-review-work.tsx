import type { TFunction } from "i18next";
import { useEffect, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { calendarDateSchema } from "@merit/dates";
import { ConflictBanner, RetainedDraftNotice } from "@merit/forms";
import { useFormat } from "@merit/i18n/format";
import { parseMoneyInput } from "@merit/money/input";
import type { ReviewState } from "@merit/reviews/domain";
import { ActionMenu } from "@merit/ui/action-menu";
import { ActionProvenance } from "@merit/ui/action-provenance";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { DialogContent } from "@merit/ui/dialog";
import { EditorLoading } from "@merit/ui/editor-loading";
import { Icon } from "@merit/ui/icon";
import { Inline } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { ReferencePane, ReferenceWorkspace, WorkPane } from "@merit/ui/reference-workspace";
import { StatusMessage } from "@merit/ui/status-message";

import type { ReviewProps, ReviewData } from "../../contracts/reviews";
import { useManagerReviewers } from "../../controllers/reviewer/use-manager-reviewers";
import type { ReviewDraft, ReviewFormValues } from "../../controllers/reviews/drafts";
import { useReview } from "../../controllers/reviews/use-review";
import { valuesFromContent } from "../../controllers/reviews/values";
import { ManagerReviewers } from "../reviewer/manager-reviewers";
import { reviewPositionKeys } from "./assessment-outcome";
import { reviewError } from "./messages";
import { RequestPicker } from "./request-picker";
import { ReviewContent } from "./review-content";
import { ReviewForm } from "./review-form";
import type { ReviewWorkProps, ReviewWorkspace } from "./review-work";
import styles from "./review-work.module.css";
import type { ReviewReading } from "./use-review-reading";

export const EditableReviewWork = ({
  application,
  round,
  availableApplicationVersions = [],
  reading,
  children,
  disabled = false,
  onInspectVersion,
  data,
}: ReviewWorkProps & { data: ReviewData; reading: ReviewReading }) => {
  const { t } = useTranslation("reviews");
  const work = useReview({ application, round, availableApplicationVersions, data });
  const { managing, actionRef, start, resume, startManaging, close } = useReviewTask(work);
  const { editing } = work;
  const participation = useManagerReviewers(data.participation, work.state.revision);
  const taskDisabled = disabled || managing;

  const manage = data.participation ? startManaging : undefined;
  const actions = (
    <ReviewActions
      work={work}
      onStart={start}
      onResume={resume}
      actionRef={actionRef}
      disabled={taskDisabled}
      workspaceSlug={data.workspaceSlug}
      onManage={manage}
    />
  );
  const editorTitle = t(reviewTaskTitle(work.mode, managing));
  const active = editing || managing;
  const editorCloseAction = (
    <ReviewTaskClose work={work} managing={managing} disabled={disabled} onClose={close} />
  );
  const editor = (
    <ReviewTaskEditor
      work={work}
      application={application}
      round={round}
      data={data}
      managing={managing}
      participation={participation}
    />
  );
  const headerActions = !children && actions;

  const content = (inspectVersion = onInspectVersion) => (
    <ReviewContent
      reading={reading}
      onInspectVersion={inspectVersion}
      application={application}
      round={round}
      headerActions={headerActions}
      assessmentActions={(assessment) => (
        <AssessmentActions
          assessment={assessment}
          work={work}
          onStart={start}
          disabled={taskDisabled}
        />
      )}
      requestActions={(request) => (
        <RequestActions
          request={request}
          assigned={Boolean(
            participation?.assignments.some((assignment) => assignment.requestId === request.id),
          )}
          work={work}
          onStart={start}
          disabled={taskDisabled || Boolean(participation && !participation.loaded)}
          workspaceSlug={data.workspaceSlug}
        />
      )}
    />
  );

  const slots = {
    content,
    reading,
    editor,
    feedback: <ReviewFeedback work={work} />,
    active,
    fill: editing,
    editorTitle,
    editorCloseAction,
    actions,
  };
  return children ? children(slots) : <ReviewWorkspaceFrame {...slots} />;
};

const ReviewWorkspaceFrame = ({
  content,
  editor,
  feedback,
  active,
  fill,
  editorTitle,
  editorCloseAction,
}: ReviewWorkspace) => {
  const { t } = useTranslation("reviews");
  return (
    <ReferenceWorkspace after={feedback}>
      <ReferencePane label={t("title")}>{content()}</ReferencePane>
      <WorkPane
        label={t("reviewTask")}
        title={active && editorTitle}
        titleActions={editorCloseAction}
        fill={fill}
      >
        {editor}
      </WorkPane>
    </ReferenceWorkspace>
  );
};

const reviewTaskTitle = (mode: ReturnType<typeof useReview>["mode"], managing: boolean) =>
  managing ? "manageReviews" : (mode ?? "record");

const ReviewTaskClose = ({
  work,
  managing,
  disabled,
  onClose,
}: {
  work: ReturnType<typeof useReview>;
  managing: boolean;
  disabled: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation("reviews");
  return (
    <Button
      variant="quiet"
      size="small"
      iconOnly
      autoFocus={managing || !work.ready}
      aria-label={t("closeTask")}
      isDisabled={disabled || work.saving}
      onPress={onClose}
    >
      <Icon name="close" />
    </Button>
  );
};

const ReviewTaskEditor = ({
  work,
  application,
  round,
  data,
  managing,
  participation,
}: {
  work: ReturnType<typeof useReview>;
  application: ReviewProps["application"];
  round: ReviewProps["round"];
  data: ReviewData;
  managing: boolean;
  participation: ReturnType<typeof useManagerReviewers>;
}) => (
  <>
    {work.editing && (
      <ReviewEditor work={work} application={application} round={round} data={data} />
    )}
    {managing && participation && <ManagerReviewers reviews={work.state} work={participation} />}
  </>
);

const useReviewTask = (work: ReturnType<typeof useReview>) => {
  const [managing, setManaging] = useState(false);
  const returnTarget = useRef<HTMLElement | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);

  const captureTrigger = () => {
    returnTarget.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const { editing } = work;

  const start: typeof work.start = (...args) => {
    captureTrigger();
    work.start(...args);
  };

  const resume = () => {
    captureTrigger();
    work.resume();
  };

  const wasEditing = useRef(false);
  useEffect(() => {
    let frame: number | undefined;
    if (!editing && !managing && wasEditing.current && document.activeElement === document.body) {
      frame = requestAnimationFrame(() => {
        if (document.activeElement === document.body) {
          (returnTarget.current?.isConnected ? returnTarget.current : actionRef.current)?.focus();
        }
      });
    }
    wasEditing.current = editing || managing;
    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [editing, managing]);
  return {
    managing,
    actionRef,
    start,
    resume,
    startManaging: () => {
      captureTrigger();
      setManaging(true);
    },
    close: () => (managing ? setManaging(false) : work.close()),
  };
};

const AssessmentActions = ({
  assessment,
  work,
  onStart,
  disabled,
}: {
  assessment: ReviewState["assessments"][number];
  work: ReturnType<typeof useReview>;
  onStart: ReturnType<typeof useReview>["start"];
  disabled: boolean;
}) => {
  const { t } = useTranslation("reviews");
  return (
    <ActionMenu
      label={t("reviewActions", { name: assessment.reviewer })}
      trigger={
        <Button
          variant="quiet"
          size="small"
          iconOnly
          aria-label={t("reviewActions", { name: assessment.reviewer })}
          isDisabled={disabled || Boolean(work.draft) || work.saving}
        >
          <Icon name="more" />
        </Button>
      }
      items={assessmentItems(assessment, work.pending, t)}
      onAction={(action) =>
        action === "edit"
          ? onStart("edit", assessment.contactId, assessment.id)
          : action === "request"
            ? void work.requestFollowUp(assessment.contactId)
            : onStart("record", assessment.contactId)
      }
    />
  );
};

const ReviewActions = ({
  work,
  workspaceSlug,
  disabled,
  onManage,
  actionRef,
  onStart,
  onResume,
}: {
  onStart: ReturnType<typeof useReview>["start"];
  onResume: () => void;
  actionRef: Ref<HTMLButtonElement>;
  work: ReturnType<typeof useReview>;
  workspaceSlug: string;
  disabled: boolean;
  onManage?: () => void;
}) => {
  const { t } = useTranslation("reviews");
  const { draft, editing, pending, saving, beginRequest } = work;

  return (
    <Inline>
      {draft ? (
        !editing && (
          <Button
            ref={actionRef}
            size="small"
            variant="secondary"
            data-draft
            isDisabled={disabled || saving}
            onPress={onResume}
          >
            {t("resume")}
          </Button>
        )
      ) : (
        <>
          <RequestPicker
            workspaceSlug={workspaceSlug}
            disabledContactIds={pending.map((request) => request.contactId)}
            trigger={
              <Button size="small" variant="quiet" isDisabled={disabled || saving}>
                {t("request")}
              </Button>
            }
            onBegin={beginRequest}
          />
          <Button
            size="small"
            variant="secondary"
            ref={actionRef}
            isDisabled={disabled || saving}
            onPress={() => onStart("record")}
          >
            {t("record")}
          </Button>
        </>
      )}
      {onManage && (
        <Button
          variant="quiet"
          size="small"
          isDisabled={disabled || editing || saving}
          onPress={onManage}
        >
          {t("manageReviews")}
        </Button>
      )}
    </Inline>
  );
};

const RequestActions = ({
  request,
  assigned,
  disabled,
  onStart,
  work,
  workspaceSlug,
}: {
  request: ReviewState["requests"][number];
  assigned: boolean;
  onStart: ReturnType<typeof useReview>["start"];
  disabled: boolean;
  work: ReturnType<typeof useReview>;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation("reviews");
  const {
    draft,
    saving,
    replacementId,
    pending,
    closeReplacement,
    beginRequest,
    replaceRequest,
    cancelRequest,
  } = work;

  return (
    <Inline className={styles.requestActions}>
      {!assigned && (
        <Button
          size="small"
          variant="quiet"
          isDisabled={disabled || Boolean(draft) || saving}
          onPress={() => onStart("record", request.contactId)}
        >
          {t("record")}
        </Button>
      )}
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
              isDisabled={disabled || Boolean(draft) || saving}
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
    draftReset,
    close,
    conflict,
    missingTarget,
    discard,
    keepDraft,
    loadLatest,
    saving,
    state,
    versions,
    updateValues,
    saveDraft,
  } = work;
  if (!work.ready || !draft) {
    return (
      <DialogContent label={t(work.mode ?? "record")}>
        <EditorLoading />
      </DialogContent>
    );
  }
  if (missingTarget) {
    return (
      <DialogContent label={t("retainedTitle")}>
        <RetainedDraftNotice
          title={t("retainedTitle")}
          message={t("assessmentUnavailable")}
          copyLabel={t("retainedCopy")}
          copyingLabel={t("retainedCopying")}
          copiedLabel={t("retainedCopied")}
          copyFailedLabel={t("retainedCopyFailed")}
          discardLabel={t("discard")}
          textToCopy={retainedReviewText(draft.values)}
          isDisabled={saving}
          onDiscard={discard}
        />
      </DialogContent>
    );
  }
  return (
    <ReviewForm
      key={`${draft.id}:${draftReset}`}
      draft={draft}
      followUp={state.assessments.some((item) => item.contactId === draft.values.contactId)}
      workspaceSlug={data.workspaceSlug}
      versions={[...versions]
        .sort((a, b) => b - a)
        .map((version) => ({
          id: String(version),
          label: t(version === application.version ? "currentVersion" : "version", { version }),
        }))}
      criteriaHistory={round.criteriaHistory}
      isConflict={conflict}
      beforeFields={
        conflict && (
          <ReviewConflictBanner
            draft={draft}
            state={state}
            onKeepDraft={keepDraft}
            onLoadLatest={loadLatest}
            isDisabled={saving}
          />
        )
      }
      onChange={updateValues}
      onDiscard={discard}
      onClose={close}
      onSave={saveDraft}
    />
  );
};

const retainedReviewText = (values: ReviewFormValues) =>
  [
    values.reasoning,
    ...values.observations
      .filter((item) => item.text.trim())
      .map((item) => `${item.criterion}\n${item.text}`),
    values.note,
  ]
    .filter((part) => part.trim())
    .join("\n\n");

const ReviewConflictBanner = ({
  draft,
  state,
  onKeepDraft,
  onLoadLatest,
  isDisabled,
}: {
  draft: ReviewDraft;
  state: ReviewState;
  onKeepDraft: () => void;
  onLoadLatest: () => void;
  isDisabled: boolean;
}) => {
  const { t } = useTranslation("reviews");
  const { timestamp } = useFormat();
  const assessment = state.assessments.findLast((item) =>
    draft.mode === "edit" ? item.id === draft.id : item.contactId === draft.values.contactId,
  );
  const request = state.requests.find(
    (item) => item.contactId === draft.values.contactId && item.status === "outstanding",
  );
  const version = assessment?.versions.at(-1);
  const recorder = version?.recorder ?? null;

  return (
    <ConflictBanner
      title={t("conflictTitle")}
      message={t("conflict")}
      attribution={
        recorder ? (
          <>
            {t("recordedBy", { name: recorder.name })} ·{" "}
            <time dateTime={recorder.recordedAt}>
              {timestamp(recorder.recordedAt, { timeZone: "UTC" })} UTC
            </time>{" "}
            · <ActionProvenance value={recorder.provenance} />
          </>
        ) : undefined
      }
      keepMine={{ label: t("keepDraft"), onPress: onKeepDraft }}
      useSaved={{ label: t("useSaved"), onPress: onLoadLatest }}
      isDisabled={isDisabled}
      latest={{
        toggleLabel: t("viewLatest"),
        hideLabel: t("hideLatest"),
        heading: t("savedWork"),
        children: <LatestAssessmentPreview assessment={assessment} request={request} />,
      }}
    />
  );
};

const LatestAssessmentPreview = ({
  assessment,
  request,
}: {
  assessment: ReviewState["assessments"][number] | undefined;
  request: ReviewState["requests"][number] | undefined;
}) => {
  const { t } = useTranslation(["reviews"]);
  const version = assessment?.versions.at(-1);
  if (!assessment || !version) {
    return (
      <DescriptionList>
        <DescriptionListItem label={t("reviewer")}>
          {request ? request.reviewer : t("noMatchingRecord")}
        </DescriptionListItem>
      </DescriptionList>
    );
  }

  return <LatestAssessmentDetails assessment={assessment} version={version} />;
};

const formatRecordedObservations = (observations: { criterion: string; text: string }[]) =>
  observations
    .filter((item) => item.text.trim())
    .map((item) => `${item.criterion}\n${item.text}`)
    .join("\n\n");

const resolveReviewPosition = (position: string) =>
  Object.hasOwn(reviewPositionKeys, position)
    ? (position as keyof typeof reviewPositionKeys)
    : null;

const formatLatestVersionLabel = (
  t: (key: string, options?: { version: string }) => string,
  value: string | undefined,
) => (value && value !== "unknown" ? t("version", { version: value }) : t("unknown"));

const LatestAssessmentDetails = ({
  assessment,
  version,
}: {
  assessment: ReviewState["assessments"][number];
  version: ReviewState["assessments"][number]["versions"][number];
}) => {
  const { t } = useTranslation(["reviews", "reviewGrant"]);
  const { money, calendarDate } = useFormat();
  const values = {
    ...valuesFromContent(version.content, assessment.contactId),
    note: version.note,
  };
  const amount = parseMoneyInput(values.amount);
  const position = resolveReviewPosition(values.position);
  const observations = formatRecordedObservations(values.observations);
  const formattedDate = calendarDateSchema.safeParse(values.date).success
    ? calendarDate(values.date)
    : values.date || t("unknown");

  return (
    <DescriptionList>
      <DescriptionListItem label={t("reviewer")}>{assessment.reviewer}</DescriptionListItem>
      <DescriptionListItem label={t("position")}>
        {position ? t(reviewPositionKeys[position], { ns: "reviewGrant" }) : t("notStated")}
      </DescriptionListItem>
      <DescriptionListItem label={t("amount")}>
        {amount ? money(amount) : values.amount || t("notStated")}
      </DescriptionListItem>
      <DescriptionListItem label={t("assessmentDate")}>{formattedDate}</DescriptionListItem>
      <DescriptionListItem label={t("applicationVersion")}>
        {formatLatestVersionLabel(t, values.applicationVersion)}
      </DescriptionListItem>
      <DescriptionListItem label={t("criteriaVersion")}>
        {formatLatestVersionLabel(t, values.criteriaVersion)}
      </DescriptionListItem>
      <DescriptionListItem label={t("reasoning")}>
        {values.reasoning || t("notStated")}
      </DescriptionListItem>
      {observations && (
        <DescriptionListItem label={t("observations")}>{observations}</DescriptionListItem>
      )}
      {values.note && <DescriptionListItem label={t("note")}>{values.note}</DescriptionListItem>}
    </DescriptionList>
  );
};

const ReviewFeedback = ({ work }: { work: ReturnType<typeof useReview> }) => {
  const { t } = useTranslation("reviews");
  const { error, refreshError, refreshing, refresh, saved } = work;
  return (
    <>
      {(error || refreshError) && (
        <div className={styles.workspaceFeedback}>
          {error && (
            <Notice appearance="inline" role="alert" tone="danger">
              {reviewError(t, error)}
            </Notice>
          )}
          {refreshError && (
            <Notice
              appearance="inline"
              role="alert"
              tone="warning"
              actions={
                <Button
                  size="small"
                  variant="quiet"
                  isPending={refreshing}
                  onPress={() => void refresh()}
                >
                  {t("retry")}
                </Button>
              }
            >
              {t(refreshError === "saved" ? "refreshError" : "refreshReadError")}
            </Notice>
          )}
        </div>
      )}
      <StatusMessage
        message={saved ? t("saved") : null}
        eventId={saved}
        confirmation={Boolean(saved)}
        className={shellStyles.confirmation}
      />
    </>
  );
};
