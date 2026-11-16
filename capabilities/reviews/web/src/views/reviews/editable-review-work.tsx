import type { TFunction } from "i18next";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { ContactLabel } from "@merit/contacts-web/contacts";
import { calendarDateSchema } from "@merit/dates";
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
import type { ReviewFormValues } from "../../controllers/reviews/drafts";
import type { ReviewComparison } from "../../controllers/reviews/review-comparison";
import { useReview } from "../../controllers/reviews/use-review";
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
  const { draft, close, conflict, discard, state, versions, updateValues, saveDraft } = work;
  if (!work.ready || !draft) {
    return (
      <DialogContent label={t(work.mode ?? "record")}>
        <EditorLoading />
      </DialogContent>
    );
  }
  if (conflict) {
    return <ReviewConflict work={work} workspaceSlug={data.workspaceSlug} />;
  }
  return (
    <ReviewForm
      key={draft.id}
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
      onChange={updateValues}
      onDiscard={discard}
      onClose={close}
      onSave={saveDraft}
    />
  );
};

const ReviewConflict = ({
  work,
  workspaceSlug,
}: {
  workspaceSlug: string;
  work: ReturnType<typeof useReview>;
}) => {
  const { t } = useTranslation("reviews");
  const { close, discard, keepDraft } = work;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body) {
      heading.current?.focus();
    }
  }, []);
  const comparison = work.comparison;
  if (!comparison) {
    return null;
  }
  const contextLabels = {
    applicationVersion: "submission",
    criteriaVersion: "criteriaVersion",
    revision: "reviewState",
  } as const;
  return (
    <DialogContent
      label={t("conflictTitle")}
      footer={
        <Inline justify="end">
          <Button size="small" variant="quiet" onPress={close}>
            {t("close")}
          </Button>
          <Button size="small" variant="secondary" onPress={discard}>
            {t("useSaved")}
          </Button>
          <Button size="small" onPress={keepDraft}>
            {t("keepDraft")}
          </Button>
        </Inline>
      }
    >
      <div className={styles.recovery}>
        <h3 ref={heading} tabIndex={-1}>
          {t("conflictTitle")}
        </h3>
        <Notice appearance="inline" tone="warning" role="alert">
          {t("conflict")}
        </Notice>
        <DescriptionList>
          {comparison.changes.map(({ field, before, after }) => (
            <DescriptionListItem key={field} label={t(contextLabels[field])}>
              {t("contextChanged", { before, after })}
            </DescriptionListItem>
          ))}
        </DescriptionList>
        <ReviewConflictComparison comparison={comparison} workspaceSlug={workspaceSlug} />
      </div>
    </DialogContent>
  );
};

const ReviewConflictComparison = ({
  comparison,
  workspaceSlug,
}: {
  comparison: ReviewComparison;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation("reviews");
  const { timestamp } = useFormat();
  const { saved, draft, reviewer } = comparison;
  const recorder = saved.kind === "assessment" ? saved.recorder : null;
  const identity = (
    <ReviewIdentity contactId={draft.contactId} reviewer={reviewer} workspaceSlug={workspaceSlug} />
  );
  return (
    <section aria-label={t("comparison")} className={styles.comparison}>
      <div className={styles.comparisonHeading}>
        <h3>{t("savedWork")}</h3>
        <h3>{t("yourDraft")}</h3>
      </div>
      <dl>
        <ComparisonField
          label={t("reviewer")}
          saved={saved.kind === "missing" ? t("noMatchingRecord") : saved.reviewer}
          draft={identity}
        />
        <AssessmentComparisonFields
          saved={saved.kind === "assessment" ? saved.values : null}
          draft={draft}
        />
      </dl>
      {recorder && (
        <p className={styles.meta}>
          {t("recordedBy", { name: recorder.name })} ·{" "}
          <time dateTime={recorder.recordedAt}>
            {timestamp(recorder.recordedAt, { timeZone: "UTC" })} UTC
          </time>{" "}
          · <ActionProvenance value={recorder.provenance} />
        </p>
      )}
    </section>
  );
};

const ReviewIdentity = ({
  contactId,
  reviewer,
  workspaceSlug,
}: {
  contactId: string;
  reviewer: string | null;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation("reviews");
  return (
    reviewer ||
    (contactId ? (
      <ContactLabel
        workspaceSlug={workspaceSlug}
        contactId={contactId}
        fallback={t("reviewerUnavailable")}
      />
    ) : (
      t("reviewerNotSelected")
    ))
  );
};

const ComparisonField = ({
  label,
  saved,
  draft,
}: {
  label: string;
  saved: ReactNode;
  draft: ReactNode;
}) => (
  <div className={styles.comparisonField}>
    <dt>{label}</dt>
    <dd>{saved}</dd>
    <dd>{draft}</dd>
  </div>
);

const AssessmentComparisonFields = ({
  saved,
  draft,
}: {
  saved: ReviewFormValues | null;
  draft: ReviewFormValues;
}) => {
  const { t } = useTranslation(["reviews", "reviewGrant"]);
  const { money, calendarDate } = useFormat();

  const format = (values: ReviewFormValues) => {
    const amount = parseMoneyInput(values.amount);
    const position = Object.hasOwn(reviewPositionKeys, values.position)
      ? (values.position as keyof typeof reviewPositionKeys)
      : null;
    return {
      reasoning: values.reasoning,
      position: position ? t(reviewPositionKeys[position], { ns: "reviewGrant" }) : t("notStated"),
      amount: amount ? money(amount) : values.amount || t("notStated"),
      assessmentDate: calendarDateSchema.safeParse(values.date).success
        ? calendarDate(values.date)
        : values.date || t("unknown"),
      applicationVersion:
        values.applicationVersion && values.applicationVersion !== "unknown"
          ? t("version", { version: values.applicationVersion })
          : t("unknown"),
      criteriaVersion:
        values.criteriaVersion && values.criteriaVersion !== "unknown"
          ? t("version", { version: values.criteriaVersion })
          : t("unknown"),
      observations: values.observations
        .filter((item) => item.text.trim())
        .map((item) => `${item.criterion}\n${item.text}`)
        .join("\n\n"),
      note: values.note,
    };
  };

  const savedFields = saved ? format(saved) : null;
  const draftFields = format(draft);
  return (Object.keys(draftFields) as (keyof typeof draftFields)[])
    .filter(
      (key) => (key !== "observations" && key !== "note") || draftFields[key] || savedFields?.[key],
    )
    .map((key) => (
      <ComparisonField
        key={key}
        label={t(key)}
        saved={savedFields ? savedFields[key] || t("notStated") : t("noSavedValue")}
        draft={draftFields[key] || t("notStated")}
      />
    ));
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
