import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type RoundPage, type ApplicationOverview as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { absolute, decodeMoney, isNegative } from "@merit/money";
import { ReviewSummary } from "@merit/reviews-web/work";
import { RoundPreparation, type PreparationSession } from "@merit/rounds-web/work";
import { type TableColumn } from "@merit/tables";
import { Badge } from "@merit/ui/badge";
import { PageHeader } from "@merit/ui/page-header";
import { StatusIndicator } from "@merit/ui/status-indicator";
import { Tabs } from "@merit/ui/tabs";

import type { ApplicationList } from "../../contracts/application-list";
import { ApplicationCollection } from "./application-collection";
import { ApplicationRecommendationStatus } from "./application-recommendation-status";
import localStyles from "./funding-round-view.module.css";

type FundingRoundViewProps = {
  applicationAction?: ReactNode;
  applicationList: ApplicationList;
  preparation?: PreparationSession;
  section?: "applications" | "overview";
  onSectionChange?: (section: "applications" | "overview") => void;
  round: RoundPage;
  readOnly?: boolean;
  renderApplicationLink?: (application: Application) => ReactNode;
  renderReviewLink?: (application: Application, children: ReactNode) => ReactNode;
};

export const FundingRoundView = ({
  round,
  readOnly = false,
  renderApplicationLink,
  renderReviewLink,
  section = "overview",
  onSectionChange,
  preparation,
  applicationList,
  applicationAction,
}: FundingRoundViewProps) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const [localSection, setLocalSection] = useState(section);
  const activeSection = onSectionChange ? section : localSection;
  const columns = useApplicationColumns({ renderApplicationLink, renderReviewLink });

  return (
    <RoundPreparation round={round} session={preparation}>
      {(content) => (
        <>
          <PageHeader
            title={content.title}
            actions={content.actions ?? (readOnly && <Badge>{t("mode.readOnly")}</Badge>)}
          />
          {content.feedback}
          <div className={localStyles.workspace} data-section={activeSection}>
            <div className={localStyles.main}>
              <Tabs
                label={t("round.sections")}
                actions={activeSection === "applications" ? applicationAction : undefined}
                selectedKey={activeSection}
                onSelectionChange={(next) => {
                  setLocalSection(next);
                  onSectionChange?.(next);
                }}
                scrollBackwardLabel={t("common:scrollTabsBackward")}
                scrollForwardLabel={t("common:scrollTabsForward")}
                items={[
                  {
                    id: "overview",
                    label: t("round.overview"),
                    content: content.overview,
                  },
                  {
                    id: "applications",
                    label: t("applications.title"),
                    count: round.applicationCount,
                    content: (
                      <ApplicationCollection
                        list={{
                          ...applicationList,
                          pagination: {
                            ...applicationList.pagination,
                            total: round.applicationCount,
                          },
                        }}
                        columns={columns}
                        emptyScope="round"
                        stickyHeader
                      />
                    ),
                  },
                ]}
              />
            </div>
            <aside className={localStyles.propertiesPanel} aria-label={t("round.properties")}>
              {content.properties}
              {activeSection === "applications" && <RoundBudget round={round} />}
            </aside>
          </div>
        </>
      )}
    </RoundPreparation>
  );
};

const RoundBudget = ({ round }: { round: RoundPage }) => {
  const { t } = useTranslation("fundingRounds");
  const { money } = useFormat();
  const remaining = round.totals.remaining;
  const over = remaining !== null && isNegative(remaining);

  return (
    <section className={localStyles.budget} aria-label={t("round.summary")}>
      <div className={localStyles.budgetScope}>
        <span>{t("applications.wholeRound")}</span>
        <StatusIndicator
          tone="muted"
          label={t("budget.scope")}
          explanation={
            round.totals.withdrawnApplications > 0
              ? `${t("budget.scopeExplanation")} ${t("budget.withdrawnApplications", {
                  count: round.totals.withdrawnApplications,
                })}`
              : t("budget.scopeExplanation")
          }
          closeLabel={t("budget.closeDetails")}
        />
      </div>
      <dl className={localStyles.budgetLine}>
        <div>
          <dt>
            {t(
              round.totals.unknownRequests > 0 ? "budget.knownRequests" : "applications.requested",
            )}
          </dt>
          <dd>
            {money(round.totals.requested)}
            {round.totals.unknownRequests > 0 && (
              <StatusIndicator
                tone="muted"
                label={t("budget.unknownRequestsDetails")}
                explanation={t("budget.unknownRequests", { count: round.totals.unknownRequests })}
                closeLabel={t("budget.closeDetails")}
              />
            )}
          </dd>
        </div>
        <div>
          <dt>{t("applications.proposed")}</dt>
          <dd>{money(round.totals.proposed)}</dd>
        </div>
        <div>
          <dt>{t(over ? "budget.overIfApproved" : "budget.remaining")}</dt>
          <dd className={over ? localStyles.warning : undefined}>
            {remaining === null ? t("preparation.budgetUnset") : money(absolute(remaining))}
            {over && (
              <StatusIndicator
                label={t("budget.over")}
                explanation={t("budget.exceeded", { amount: money(absolute(remaining)) })}
                closeLabel={t("budget.closeDetails")}
              />
            )}
          </dd>
        </div>
        <div>
          <dt>{t("applications.reviewStatus")}</dt>
          <dd>
            <ReviewSummary reviews={round.totals.reviews} />
          </dd>
        </div>
      </dl>
    </section>
  );
};

const useApplicationColumns = ({
  renderApplicationLink,
  renderReviewLink,
}: Pick<FundingRoundViewProps, "renderApplicationLink" | "renderReviewLink">) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const { money } = useFormat();
  const columns: TableColumn<Application>[] = [
    {
      id: "application",
      header: t("applications.application"),
      sort: true,
      layout: { width: "28%", primary: true },
      cell: (application) => (
        <>
          <div className={localStyles.title}>
            <span className={localStyles.identity}>
              {renderApplicationLink?.(application) ?? application.title}
            </span>
            <ApplicationStatusLine application={application} />
          </div>
          <p className={localStyles.applicant}>{application.applicant}</p>
        </>
      ),
    },
    {
      id: "reviews",
      header: t("applications.reviewStatus"),
      layout: { width: "22%" },
      cell: (application) => {
        return (
          <ReviewSummary
            reviews={application.reviews}
            criteriaChanged={application.criteriaChanged}
            applicationTitle={application.title}
            renderReviewLink={
              renderReviewLink ? (label) => renderReviewLink(application, label) : undefined
            }
          />
        );
      },
    },
    {
      id: "recommendation",
      header: t("applications.recommendation"),
      layout: { width: "24%" },
      cell: (application) => (
        <div className={localStyles.recommendation}>
          <ApplicationRecommendationStatus recommendation={application.recommendation} />
        </div>
      ),
    },
    {
      id: "requested",
      header: t("applications.requested"),
      layout: { width: "13%", align: "end" },
      sort: true,
      cell: (application) =>
        application.requested === null ? (
          <span className={localStyles.muted} aria-label={t("intake.unknownAmount")}>
            {t("intake.notKnown")}
          </span>
        ) : (
          money(decodeMoney(application.requested))
        ),
    },
    {
      id: "proposed",
      header: t("applications.proposed"),
      layout: { width: "13%", align: "end" },
      sort: true,
      cell: (application) => (
        <div>
          <span>
            {application.recommendation
              ? money(decodeMoney(application.recommendation.allocation))
              : "—"}
          </span>
        </div>
      ),
    },
  ];

  return columns;
};

const ApplicationStatusLine = ({ application }: { application: Application }) => {
  const { t } = useTranslation("fundingRounds");
  if (application.withdrawn) {
    return <span className={localStyles.withdrawn}>{t("applications.withdrawn")}</span>;
  }

  return (
    application.intakeStatus === "in_preparation" && (
      <span className={localStyles.preparing}>{t("intake.preparing")}</span>
    )
  );
};
