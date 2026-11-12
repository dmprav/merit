import type { ReactNode, ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import type { IntakeState } from "@merit/applications-web/contracts";
import { ApplicationIntake, type IntakeSession } from "@merit/applications-web/work";
import type {
  ApplicationRoundContext,
  ApplicationView as Application,
} from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { ApplicationRecommendationSummary } from "@merit/recommendations-web/work";
import type { ReviewData } from "@merit/reviews-web/contracts";
import { ReviewWork, ReviewOverview } from "@merit/reviews-web/work";
import { ActionMenu } from "@merit/ui/action-menu";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { PageHeader } from "@merit/ui/page-header";
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
  const state = useApplicationNavigation({ tab, onTabChange, editorOpen: Boolean(editor) });
  const { inspectHistory, revealIntake } = state;
  const history = intake?.data.state.history ?? intakeState?.history ?? [];

  const work = (selected?: string) => (
    <ReviewWork
      application={application}
      round={round}
      data={readOnly ? null : reviewData}
      selectedId={selected}
      onInspectVersion={inspectHistory}
      availableApplicationVersions={
        intake || intakeState
          ? history.flatMap((entry) =>
              [entry.before?.version, entry.after?.version].filter(
                (version) => version !== undefined,
              ),
            )
          : undefined
      }
    />
  );

  return (
    <ApplicationIntake application={application} session={intake} onReveal={revealIntake}>
      {(content) => (
        <ApplicationLayout
          {...props}
          readOnly={readOnly}
          content={content}
          state={state}
          history={history}
          work={work}
        />
      )}
    </ApplicationIntake>
  );
};

type ApplicationLayoutProps = ApplicationViewProps & {
  content: Parameters<ComponentProps<typeof ApplicationIntake>["children"]>[0];
  state: ReturnType<typeof useApplicationNavigation>;
  history: NonNullable<IntakeState["history"]>;
  work: (selected?: string) => ReactNode;
};

const ApplicationLayout = (props: ApplicationLayoutProps) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  const { editor, content } = props;
  const labels: Record<ApplicationReference, string> = {
    evidence: t("workspace.submission"),
    reviews: t("workspace.assessments"),
    history: t("workspace.history"),
    details: t("workspace.details"),
  };

  return (
    <div className={styles.view}>
      <ReferenceWorkspace
        header={<ApplicationHeader {...props} />}
        toWorkLabel={t(editor ? "workspace.toEditor" : "workspace.toOverview")}
        toReferenceLabel={t("workspace.browseReference")}
        after={content.feedback}
      >
        <ApplicationReferencePane {...props} labels={labels} />
        <ApplicationWorkPane {...props} />
      </ReferenceWorkspace>
    </div>
  );
};

const ApplicationHeader = ({
  application,
  content,
  readOnly,
  navigation,
  state,
}: ApplicationLayoutProps) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  const { money } = useFormat();
  const { inspectHistory, changeReference } = state;
  return (
    <PageHeader
      density="compact"
      title={content.title}
      description={
        <div className={styles.headerMeta}>
          {application.submission?.organization && (
            <span>{application.submission.organization}</span>
          )}
          <strong>
            {application.requested === null
              ? t("intake.unknownAmount")
              : t("applications.requestAmount", { amount: money(application.requested) })}
          </strong>
          <span>{t("workspace.version", { version: application.version })}</span>
          <Button variant="quiet" size="small" onPress={() => inspectHistory()}>
            {t("workspace.viewHistory")}
            <Icon name="right" />
          </Button>
        </div>
      }
      actions={
        <>
          {readOnly && <Badge>{t("mode.readOnly")}</Badge>}
          {navigation}
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
            items={[...content.menu.items, { id: "reviews", label: t("workspace.allReviews") }]}
            onAction={(action) =>
              action === "reviews" ? changeReference("reviews") : content.menu.onAction(action)
            }
          />
        </>
      }
    />
  );
};

const ApplicationReferencePane = ({
  labels,
  application,
  editor,
  content,
  state,
  history,
  work,
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
        editor && (
          <ReferenceSwitcher
            label={t("workspace.reference")}
            triggerLabel={t("workspace.referenceLabel", { name: labels[reference] })}
            options={labels}
            selected={reference}
            onChange={changeReference}
            triggerRef={referenceMenu}
          />
        )
      }
    >
      {Object.keys(labels).map((key) => (
        <div
          key={key}
          role={key === "reviews" || key === "history" ? undefined : "region"}
          aria-label={
            key === "reviews" || key === "history" ? undefined : labels[key as ApplicationReference]
          }
          hidden={reference !== key}
        >
          {key !== "evidence" && !editor && (
            <div className={styles.historyHeading}>
              <Button variant="quiet" size="small" onPress={() => changeReference("evidence")}>
                <Icon name="left" />
                {t("workspace.backApplication")}
              </Button>
              {key !== "reviews" && (
                <h2 ref={key === "history" ? historyHeading : undefined} tabIndex={-1}>
                  {labels[key as ApplicationReference]}
                </h2>
              )}
            </div>
          )}
          {key === "evidence" ? (
            content.evidence
          ) : key === "reviews" ? (
            work()
          ) : key === "details" ? (
            content.details
          ) : (
            <>
              <ApplicationHistory
                key={`${application.id}:${historyVisit}`}
                application={application}
                history={history}
                initialFromVersion={historyFrom}
              />
              {Boolean(history.length) && <ApplicationAuditHistory history={history} />}
            </>
          )}
        </div>
      ))}
    </ReferencePane>
  );
};

const ApplicationWorkPane = ({
  editor,
  editorCloseAction,
  application,
  round,
  content,
  readOnly = false,
  recommendationAction,
  work,
  state,
}: ApplicationLayoutProps) => {
  const { t } = useTranslation(["fundingRounds", "reviews"]);
  const {
    selectedId,
    selectedHeading,
    back,
    changeReference,
    selectReview,
    registerReviewTrigger,
  } = state;
  return (
    <WorkPane
      label={t("workspace.title")}
      fill={Boolean(editor)}
      title={
        (editor || selectedId) && t(editor ? "applications.recommendation" : "workspace.assessment")
      }
      titleRef={selectedHeading}
      titleActions={
        editor ? (
          editorCloseAction
        ) : (
          <Button variant="quiet" size="small" onPress={back}>
            <Icon name="left" />
            {t("workspace.backOverview")}
          </Button>
        )
      }
    >
      {editor ? (
        <div className={styles.recommendation}>{editor}</div>
      ) : selectedId ? (
        work(selectedId)
      ) : (
        <ApplicationWorkOverview
          application={application}
          manager={round.manager}
          overview={content.overview}
          readOnly={readOnly}
          recommendationAction={recommendationAction}
          onShowAll={() => changeReference("reviews")}
          onSelect={selectReview}
          triggerRef={registerReviewTrigger}
        />
      )}
    </WorkPane>
  );
};

const ApplicationWorkOverview = ({
  application,
  manager,
  overview,
  readOnly,
  recommendationAction,
  onShowAll,
  onSelect,
  triggerRef,
}: ComponentProps<typeof ReviewOverview> & {
  manager: ApplicationRoundContext["manager"];
  overview: ReactNode;
  readOnly: boolean;
  recommendationAction?: ReactNode;
}) => (
  <div className={styles.context}>
    {overview}
    {application.intakeStatus !== "in_preparation" || application.managerRecommendation ? (
      <ApplicationRecommendationSummary
        application={application}
        manager={manager}
        action={!readOnly && recommendationAction}
      />
    ) : null}
    <ReviewOverview
      application={application}
      onShowAll={onShowAll}
      onSelect={onSelect}
      triggerRef={triggerRef}
    />
    {application.intakeStatus === "in_preparation" &&
      !application.managerRecommendation &&
      !readOnly &&
      recommendationAction}
  </div>
);
