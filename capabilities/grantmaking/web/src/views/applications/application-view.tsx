import { useState, type ReactNode, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import type { IntakeState } from "@merit/applications-web/contracts";
import {
  ApplicationDocuments,
  type ApplicationDocumentSession,
} from "@merit/applications-web/documents";
import { ApplicationIntake, type IntakeSession } from "@merit/applications-web/work";
import type { ApplicationDocuments as ApplicationDocumentSnapshot } from "@merit/applications/api";
import { isWithdrawn } from "@merit/applications/domain";
import type {
  ApplicationRoundContext,
  ApplicationView as Application,
} from "@merit/grantmaking/api";
import { RemotePagedContent } from "@merit/query/pages";
import { ApplicationRecommendationSummary } from "@merit/recommendations-web/work";
import type { ReviewData } from "@merit/reviews-web/contracts";
import { ReviewWork, ReviewOverview, type ReviewWorkspace } from "@merit/reviews-web/work";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { PageHeader } from "@merit/ui/page-header";
import { PagedContent } from "@merit/ui/paged-content";
import {
  ReferencePane,
  ReferenceSwitcher,
  ReferenceWorkspace,
  WorkPane,
} from "@merit/ui/reference-workspace";

import { ApplicationAuditHistory } from "./application-audit-history";
import { ApplicationHistory } from "./application-history";
import styles from "./application-view.module.css";
import { useApplicationNavigation, type ApplicationReference } from "./use-application-navigation";

type ApplicationViewProps = {
  readOnly?: boolean;
  application: Application;
  round: ApplicationRoundContext;
  navigation?: ReactNode;
  editor?: ReactNode;
  editorCloseAction?: ReactNode;
  intake?: IntakeSession;
  documents?: ApplicationDocumentSnapshot;
  documentSession?: ApplicationDocumentSession;
  reviewData?: ReviewData | null;
  intakeState?: IntakeState;
  recommendationAction?: ReactNode;
  tab?: "evidence" | "reviews";
  onTabChange?: (tab: "evidence" | "reviews") => void;
};

export const ApplicationView = (props: ApplicationViewProps) => {
  const {
    application,
    round,
    readOnly = false,
    editor,
    intake,
    reviewData,
    intakeState,
    tab = "evidence",
    onTabChange,
  } = props;
  // A withdrawn application keeps its reviews and recommendation readable but accepts no work.
  const locked = readOnly || isWithdrawn(application);
  const history = intake?.data.state.history ?? intakeState?.history ?? [];
  return (
    <ReviewWork
      application={application}
      round={round}
      data={locked ? null : reviewData}
      disabled={Boolean(editor)}
      availableApplicationVersions={
        intake?.data.state.materialVersions ??
        intakeState?.materialVersions ??
        (intake || intakeState
          ? history.flatMap((entry) =>
              [entry.before?.version, entry.after?.version].filter(
                (version) => version !== undefined,
              ),
            )
          : undefined)
      }
    >
      {(review) => (
        <ApplicationWorkspace
          {...props}
          review={review}
          locked={locked}
          history={history}
          tab={tab}
          onTabChange={onTabChange}
        />
      )}
    </ReviewWork>
  );
};

const ApplicationWorkspace = (
  props: ApplicationViewProps & {
    review: ReviewWorkspace;
    locked: boolean;
    history: NonNullable<IntakeState["history"]>;
  },
) => {
  const { application, intake, editor, review, tab = "evidence", onTabChange } = props;
  const state = useApplicationNavigation({
    tab,
    onTabChange,
    editorOpen: Boolean(editor) || review.active,
  });
  return (
    <ApplicationIntake application={application} session={intake} onReveal={state.revealIntake}>
      {(content) => <ApplicationLayout {...props} content={content} state={state} />}
    </ApplicationIntake>
  );
};

type ApplicationLayoutProps = ApplicationViewProps & {
  locked: boolean;
  content: Parameters<ComponentProps<typeof ApplicationIntake>["children"]>[0];
  state: ReturnType<typeof useApplicationNavigation>;
  history: NonNullable<IntakeState["history"]>;
  review: ReviewWorkspace;
};

const ApplicationLayout = (props: ApplicationLayoutProps) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  const { editor, content, review } = props;
  const labels: Record<ApplicationReference, string> = {
    evidence: t("workspace.submission"),
    documents: t("workspace.documents"),
    reviews: t("workspace.assessments"),
    history: t("workspace.history"),
    details: t("workspace.details"),
  };

  return (
    <div className={styles.view}>
      <ReferenceWorkspace
        header={<ApplicationHeader {...props} />}
        toWorkLabel={t(
          editor
            ? "workspace.toEditor"
            : review.active
              ? "workspace.toReviewTask"
              : "workspace.toOverview",
        )}
        toReferenceLabel={t("workspace.browseReference")}
        after={
          <>
            {content.feedback}
            {review.feedback}
          </>
        }
      >
        <ApplicationReferencePane {...props} labels={labels} />
        <ApplicationWorkPane {...props} />
      </ReferenceWorkspace>
    </div>
  );
};

const ApplicationHeader = ({ application, content, navigation }: ApplicationLayoutProps) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  return (
    <PageHeader
      density="compact"
      title={content.title}
      description={application.submission?.organization}
      actions={
        <>
          {navigation}
          {content.menu.items.length > 0 && (
            <ActionMenu
              label={t("intake.moreActions")}
              trigger={
                <Button
                  size="small"
                  variant="quiet"
                  iconOnly
                  isDisabled={content.menu.disabled}
                  aria-label={t("intake.moreActions")}
                >
                  <Icon name="more" />
                </Button>
              }
              items={content.menu.items}
              onAction={content.menu.onAction}
            />
          )}
        </>
      }
    />
  );
};

const ApplicationReferencePane = ({
  labels,
  state,
  ...layout
}: ApplicationLayoutProps & { labels: Record<ApplicationReference, string> }) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  const { reference, referenceViewport, referenceMenu, changeReference } = state;
  return (
    <ReferencePane
      label={t("workspace.reference")}
      viewportRef={referenceViewport}
      toolbar={
        <ReferenceSwitcher
          label={t("workspace.reference")}
          triggerLabel={t("workspace.referenceLabel", { name: labels[reference] })}
          options={labels}
          selected={reference}
          onChange={changeReference}
          triggerRef={referenceMenu}
        />
      }
    >
      {(Object.keys(labels) as ApplicationReference[]).map((referenceKey) => (
        <ApplicationReferenceSection
          key={referenceKey}
          {...layout}
          state={state}
          referenceKey={referenceKey}
          labels={labels}
          sourceDocumentsLabel={t("workspace.sourceDocuments")}
        />
      ))}
    </ReferencePane>
  );
};

const referenceAttributes = (
  key: ApplicationReference,
  label: string,
  sourceDocumentsLabel: string,
): { role?: "region"; "aria-label"?: string } => {
  if (key === "reviews" || key === "history") {
    return {};
  }
  return {
    role: "region",
    "aria-label": key === "documents" ? sourceDocumentsLabel : label,
  };
};

const ApplicationReferenceSection = ({
  referenceKey,
  labels,
  sourceDocumentsLabel,
  state,
  ...layout
}: ApplicationLayoutProps & {
  referenceKey: ApplicationReference;
  labels: Record<ApplicationReference, string>;
  sourceDocumentsLabel: string;
}) => {
  const { reference, historyHeading, historyFrom, historyVisit, inspectHistory } = state;
  return (
    <div
      {...referenceAttributes(referenceKey, labels[referenceKey], sourceDocumentsLabel)}
      hidden={reference !== referenceKey}
    >
      {referenceKey === "history" && (
        <div className={styles.historyHeading}>
          <h2 ref={historyHeading} tabIndex={-1}>
            {labels.history}
          </h2>
        </div>
      )}
      <ApplicationReferenceBody
        {...layout}
        referenceKey={referenceKey}
        reference={reference}
        historyFrom={historyFrom}
        historyVisit={historyVisit}
        inspectHistory={inspectHistory}
      />
    </div>
  );
};

const ApplicationReferenceBody = ({
  referenceKey,
  application,
  content,
  history,
  intake,
  review,
  documents,
  documentSession,
  readOnly = false,
  reference,
  historyFrom,
  historyVisit,
  inspectHistory,
}: Omit<ApplicationLayoutProps, "state"> & {
  referenceKey: ApplicationReference;
  reference: ApplicationLayoutProps["state"]["reference"];
  historyFrom: ApplicationLayoutProps["state"]["historyFrom"];
  historyVisit: ApplicationLayoutProps["state"]["historyVisit"];
  inspectHistory: ApplicationLayoutProps["state"]["inspectHistory"];
}) => {
  switch (referenceKey) {
    case "evidence":
      return content.evidence;
    case "documents":
      return (
        <ApplicationDocuments
          mode="manage"
          documents={documents}
          canWrite={!readOnly && !isWithdrawn(application) && Boolean(documentSession?.attach)}
          session={documentSession ?? { readFile: async () => ({ status: "not_found" }) }}
        />
      );
    case "reviews":
      return review.content(inspectHistory);
    case "details":
      return content.details;
    case "history":
      return (
        <RemotePagedContent
          source={intake?.data.historySource}
          entries={history}
          active={reference === "history"}
        >
          {(page) => (
            <PagedContent {...page}>
              {(entries, hasMore) => (
                <ApplicationHistoryContent
                  key={`${application.id}:${historyVisit}`}
                  application={application}
                  history={entries}
                  hasMore={hasMore}
                  initialFromVersion={historyFrom}
                />
              )}
            </PagedContent>
          )}
        </RemotePagedContent>
      );
  }
};

const ApplicationWorkPane = ({
  editor,
  editorCloseAction,
  application,
  round,
  content,
  locked,
  recommendationAction,
  review,
  state,
}: ApplicationLayoutProps) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  const { changeReference } = state;
  const active = Boolean(editor) || review.active;
  return (
    <WorkPane
      label={t("workspace.title")}
      fill={Boolean(editor) || review.fill}
      title={active && (editor ? t("applications.recommendation") : review.editorTitle)}
      titleActions={editor ? editorCloseAction : review.editorCloseAction}
    >
      <ApplicationTaskContent editor={editor} review={review} notice={content.notice} />
      {!active && (
        <ApplicationWorkOverview
          application={application}
          manager={round.manager}
          onInspectVersion={state.inspectHistory}
          overview={content.overview}
          readOnly={locked}
          recommendationAction={recommendationAction}
          actions={review.actions}
          onShowAll={() => {
            review.reading.showAll();
            changeReference("reviews");
          }}
          onSelect={(id) => {
            changeReference("reviews", false);
            review.reading.openReview(id);
          }}
          triggerRef={review.reading.registerTrigger}
        />
      )}
    </WorkPane>
  );
};

const ApplicationTaskContent = ({
  editor,
  review,
  notice,
}: {
  editor?: ReactNode;
  review: ReviewWorkspace;
  notice: ReactNode;
}) => (
  <>
    {notice && <div className={styles.workspaceNotice}>{notice}</div>}
    {editor && <div className={styles.recommendation}>{editor}</div>}
    <div
      hidden={Boolean(editor) || !review.active}
      className={review.fill ? styles.recommendation : undefined}
    >
      {review.editor}
    </div>
  </>
);

const ApplicationWorkOverview = ({
  application,
  manager,
  overview,
  readOnly,
  recommendationAction,
  onShowAll,
  onSelect,
  triggerRef,
  actions,
  onInspectVersion,
}: ComponentProps<typeof ReviewOverview> & {
  manager: ApplicationRoundContext["manager"];
  overview: ReactNode;
  readOnly: boolean;
  recommendationAction?: ReactNode;
  onInspectVersion: (version: number) => void;
}) => (
  <div className={styles.context}>
    {overview}
    {application.intakeStatus !== "in_preparation" || application.managerRecommendation ? (
      <ApplicationRecommendationSummary
        application={application}
        manager={manager}
        action={!readOnly && recommendationAction}
        onInspectVersion={onInspectVersion}
      />
    ) : null}
    <ReviewOverview
      application={application}
      onShowAll={onShowAll}
      onSelect={onSelect}
      triggerRef={triggerRef}
      actions={actions}
    />
    {application.intakeStatus === "in_preparation" &&
      !application.managerRecommendation &&
      !readOnly &&
      recommendationAction}
  </div>
);

const ApplicationHistoryContent = (props: ComponentProps<typeof ApplicationHistory>) => {
  const [inspectingAudit, setInspectingAudit] = useState(false);
  return (
    <>
      <div hidden={inspectingAudit}>
        <ApplicationHistory {...props} />
      </div>
      {Boolean(props.history.length) && (
        <ApplicationAuditHistory history={props.history} onInspect={setInspectingAudit} />
      )}
    </>
  );
};
