import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type RoundPage, type ApplicationOverview as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { absolute, decodeMoney, isNegative } from "@merit/money";
import { ReviewSummary } from "@merit/reviews-web/work";
import { RoundPreparation, type PreparationSession } from "@merit/rounds-web/work";
import { type TableColumn } from "@merit/tables";
import { Badge } from "@merit/ui/badge";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Divider } from "@merit/ui/divider";
import { Stack } from "@merit/ui/layout";
import { PageHeader } from "@merit/ui/page-header";
import { PropertiesLayout } from "@merit/ui/properties-layout";
import { StatusIndicator, StatusIndicatorSpace } from "@merit/ui/status-indicator";
import { Tabs } from "@merit/ui/tabs";
import { Text } from "@merit/ui/text";

import type { ApplicationList } from "../../contracts/application-list";
import { ApplicationCollection } from "./application-collection";
import { ApplicationDecisionStatus } from "./application-decision-status";
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
          <div className={localStyles.feedback}>{content.feedback}</div>
          <PropertiesLayout
            propertiesLabel={t("round.properties")}
            stackedPlacement={activeSection === "applications" ? "after" : "before"}
            properties={
              <>
                {content.properties}
                {activeSection === "applications" && <RoundBudget round={round} />}
              </>
            }
          >
            <Tabs
              label={t("round.sections")}
              scrollPanels
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
                      action={applicationAction}
                    />
                  ),
                },
              ]}
            />
          </PropertiesLayout>
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
    <div className={localStyles.budget}>
      <Stack as="section" gap={4} aria-label={t("round.summary")}>
        <Divider />
        <Stack gap={2}>
          <div className={localStyles.budgetScope}>
            <Text variant="caption">{t("applications.wholeRound")}</Text>
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
            />
          </div>
          <DescriptionList layout="figures">
            <DescriptionListItem
              label={t(
                round.totals.unknownRequests > 0
                  ? "budget.knownRequests"
                  : "applications.requested",
              )}
            >
              {money(round.totals.requested)}
              {round.totals.unknownRequests > 0 ? (
                <StatusIndicator
                  tone="muted"
                  label={t("budget.unknownRequestsDetails")}
                  explanation={t("budget.unknownRequests", {
                    count: round.totals.unknownRequests,
                  })}
                />
              ) : (
                <StatusIndicatorSpace />
              )}
            </DescriptionListItem>
            <DescriptionListItem label={t("applications.proposed")}>
              {money(round.totals.proposed)}
              <StatusIndicatorSpace />
            </DescriptionListItem>
            <DescriptionListItem label={t(over ? "budget.overIfApproved" : "budget.remaining")}>
              {remaining === null ? (
                t("preparation.budgetUnset")
              ) : over ? (
                <Text variant="attention">{money(absolute(remaining))}</Text>
              ) : (
                money(absolute(remaining))
              )}
              {over ? (
                <StatusIndicator
                  label={t("budget.over")}
                  explanation={t("budget.exceeded", { amount: money(absolute(remaining)) })}
                />
              ) : (
                <StatusIndicatorSpace />
              )}
            </DescriptionListItem>
            <DescriptionListItem label={t("budget.committed")}>
              {money(round.totals.committed)}
              <StatusIndicatorSpace />
            </DescriptionListItem>
            <DescriptionListItem label={t("budget.available")}>
              {round.totals.available === null
                ? t("preparation.budgetUnset")
                : money(round.totals.available)}
              <StatusIndicatorSpace />
            </DescriptionListItem>
            <DescriptionListItem label={t("applications.reviewStatus")}>
              <ReviewSummary reviews={round.totals.reviews} reserveIndicatorSpace />
            </DescriptionListItem>
          </DescriptionList>
        </Stack>
      </Stack>
    </div>
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
      layout: { width: "26%", primary: true },
      cell: (application) => (
        <Stack gap={1}>
          <Text as="div" variant="emphasis">
            <div className={localStyles.title}>
              <span className={localStyles.identity}>
                {renderApplicationLink?.(application) ?? application.title}
              </span>
              <ApplicationStatusLine application={application} />
            </div>
          </Text>
          <Text as="p" variant="caption">
            {application.applicant}
          </Text>
        </Stack>
      ),
    },
    {
      id: "reviews",
      header: t("applications.reviewStatus"),
      layout: { width: "18%" },
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
      layout: { width: "17%" },
      cell: (application) => (
        <div className={localStyles.recommendation}>
          <ApplicationRecommendationStatus recommendation={application.recommendation} />
        </div>
      ),
    },
    {
      id: "decision",
      header: t("applications.decision"),
      layout: { width: "14%" },
      cell: (application) => (
        <div className={localStyles.recommendation}>
          <ApplicationDecisionStatus decision={application.decision} />
        </div>
      ),
    },
    {
      id: "requested",
      header: t("applications.requested"),
      layout: { width: "12%", align: "end" },
      sort: true,
      cell: (application) =>
        application.requested === null ? (
          <span aria-label={t("intake.unknownAmount")}>
            <Text variant="missing">{t("intake.notKnown")}</Text>
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
    return (
      <Badge appearance="plain" tone="neutral">
        {t("applications.withdrawn")}
      </Badge>
    );
  }

  return (
    application.intakeStatus === "in_preparation" && (
      <Badge appearance="plain" tone="warning">
        {t("intake.preparing")}
      </Badge>
    )
  );
};
