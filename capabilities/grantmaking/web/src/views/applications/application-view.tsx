import { useState, type ReactNode, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import type { IntakeState } from "@merit/applications-web/contracts";
import { ApplicationIntake, type IntakeSession } from "@merit/applications-web/work";
import { isWithdrawn } from "@merit/applications/domain";
import { ApplicationDecisionSummary } from "@merit/decisions-web/decisions";
import type { DecisionVersion } from "@merit/decisions/domain";
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
import { PanelSections } from "@merit/ui/panel-section";
import {
  ReferencePane,
  ReferenceSwitcher,
  ReferenceWorkspace,
  WorkPane,
} from "@merit/ui/reference-workspace";
import { SectionHeader } from "@merit/ui/section-header";

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
  reviewData?: ReviewData | null;
  intakeState?: IntakeState;
  recommendationAction?: ReactNode;
  /** The committee's decision versions, newest first, shown above the recommendation. */
  decisionVersions?: readonly DecisionVersion[];
  decisionAction?: ReactNode;
  /** Names the open editor in the work pane; the recommendation unless another is open. */
  editorTitle?: string;
  /** Labels the jump to the open editor; the recommendation's unless another is open. */
  editorJumpLabel?: string;
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
    <ApplicationIntake
      application={application}
      session={
        intake && {
          ...intake,
          activity: {
            hasReviews: Boolean(
              application.reviews.requests.length || application.reviews.assessments.length,
            ),
            hasRecommendation: application.managerRecommendation !== null,
            outstandingReviews: application.reviews.requests.filter(
              (request) => request.status === "outstanding",
            ).length,
          },
        }
      }
      onReveal={state.revealIntake}
    >
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
    reviews: t("workspace.assessments"),
    history: t("workspace.history"),
    details: t("workspace.details"),
  };

  return (
    <ReferenceWorkspace
      header={<ApplicationHeader {...props} />}
      toWorkLabel={
        editor
          ? (props.editorJumpLabel ?? t("workspace.toEditor"))
          : t(review.active ? "workspace.toReviewTask" : "workspace.toOverview")
      }
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
  application,
  content,
  state,
  history,
  intake,
  review,
}: ApplicationLayoutProps & { labels: Record<ApplicationReference, string> }) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  const {
    reference,
    referenceViewport,
    referenceMenu,
    changeReference,
    historyHeading,
    historyFrom,
    historyVisit,
  } = state;
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
      {Object.entries(labels).map(([key, label]) => (
        <div
          key={key}
          role={key === "reviews" || key === "history" ? undefined : "region"}
          aria-label={key === "reviews" || key === "history" ? undefined : label}
          hidden={reference !== key}
        >
          {key === "history" && (
            <SectionHeader title={labels.history} headingRef={historyHeading} />
          )}
          {key === "evidence" ? (
            content.evidence
          ) : key === "reviews" ? (
            review.content(state.inspectHistory)
          ) : key === "details" ? (
            content.details
          ) : (
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
          )}
        </div>
      ))}
    </ReferencePane>
  );
};

const workTitle = (
  active: boolean,
  editing: boolean,
  editorTitle: string,
  review: ReviewWorkspace,
) => active && (editing ? editorTitle : review.editorTitle);

const ApplicationWorkPane = ({
  editor,
  editorCloseAction,
  application,
  round,
  content,
  locked,
  recommendationAction,
  decisionVersions,
  decisionAction,
  editorTitle,
  review,
  state,
}: ApplicationLayoutProps) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  const { changeReference } = state;
  const active = Boolean(editor) || review.active;
  const title = workTitle(
    active,
    Boolean(editor),
    editorTitle ?? t("applications.recommendation"),
    review,
  );
  return (
    <WorkPane
      label={t("workspace.title")}
      fill={Boolean(editor) || review.fill}
      title={title}
      titleActions={editor ? editorCloseAction : review.editorCloseAction}
    >
      <ApplicationTaskContent editor={editor} review={review} />
      {!active && (
        <ApplicationWorkOverview
          application={application}
          manager={round.manager}
          onInspectVersion={state.inspectHistory}
          overview={content.overview}
          readOnly={locked}
          recommendationAction={recommendationAction}
          decisionVersions={decisionVersions}
          decisionAction={decisionAction}
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
}: {
  editor?: ReactNode;
  review: ReviewWorkspace;
}) => (
  <>
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
  decisionVersions,
  decisionAction,
  onShowAll,
  onSelect,
  triggerRef,
  actions,
  onInspectVersion,
}: Omit<ComponentProps<typeof ReviewOverview>, "application"> & {
  application: Application;
  manager: ApplicationRoundContext["manager"];
  overview: ReactNode;
  readOnly: boolean;
  recommendationAction?: ReactNode;
  decisionVersions?: readonly DecisionVersion[];
  decisionAction?: ReactNode;
  onInspectVersion: (version: number) => void;
}) => (
  <PanelSections>
    {overview}
    {decisionVersions && (
      <ApplicationDecisionSummary
        versions={decisionVersions}
        action={!readOnly && decisionAction}
      />
    )}
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
  </PanelSections>
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
