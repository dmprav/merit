import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type RoundView, type ApplicationView as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { absolute, compare, isNegative } from "@merit/money";
import { recommendationPositionKeys } from "@merit/recommendations-web/work";
import { reviewStatusText } from "@merit/reviews-web/work";
import { summarizeAssessments } from "@merit/reviews/domain";
import { RoundPreparation, type PreparationSession } from "@merit/rounds-web/work";
import { DataTable, type TableColumn, type TableSort } from "@merit/tables";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { Inline } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { Select } from "@merit/ui/select";
import { Tabs } from "@merit/ui/tabs";
import { TextField } from "@merit/ui/text-field";

import {
  applicationFilters,
  matchesApplicationFilter,
  matchesApplicationSearch,
  type ApplicationFilter,
} from "../../controllers/rounds/application-list-filter";
import localStyles from "./funding-round-view.module.css";

type FundingRoundViewProps = {
  applicationAction?: ReactNode;
  applicationList?: {
    query: string;
    filter: ApplicationFilter;
    onFilterChange: (value: { query: string; filter: ApplicationFilter }) => void;
    sorting: TableSort;
    onSortingChange: (sorting: TableSort) => void;
  };
  preparation?: PreparationSession;
  section?: "applications" | "overview";
  onSectionChange?: (section: "applications" | "overview") => void;
  round: RoundView;
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
  const [sorting, setSorting] = useState<TableSort>(null);
  const [localFilters, setLocalFilters] = useState<{ query: string; filter: ApplicationFilter }>({
    query: "",
    filter: "all",
  });

  const { query, filter } = applicationList ?? localFilters;
  const changeFilters = applicationList?.onFilterChange ?? setLocalFilters;
  const filtered = query.trim() !== "" || filter !== "all";
  const applications = round.applications.filter(
    (application) =>
      matchesApplicationSearch(application, query) && matchesApplicationFilter(application, filter),
  );

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
          <div className={localStyles.workspace}>
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
                    count: round.applications.length,
                    content: (
                      <>
                        <RoundBudget round={round} />
                        {round.applications.length > 0 && (
                          <>
                            <ApplicationFilters
                              query={query}
                              filter={filter}
                              changeFilters={changeFilters}
                              count={applications.length}
                              total={round.applications.length}
                            />
                          </>
                        )}

                        <RoundApplicationsTable
                          applications={applications}
                          columns={columns}
                          filtered={filtered}
                          sorting={applicationList ? applicationList.sorting : sorting}
                          onSortingChange={applicationList?.onSortingChange ?? setSorting}
                        />
                      </>
                    ),
                  },
                ]}
              />
            </div>
            <aside className={localStyles.propertiesPanel} aria-label={t("round.properties")}>
              {content.properties}
            </aside>
          </div>
        </>
      )}
    </RoundPreparation>
  );
};

const RoundBudget = ({ round }: { round: RoundView }) => {
  const { t } = useTranslation("fundingRounds");
  const { money } = useFormat();
  const remaining = round.totals.remaining;
  const over = remaining !== null && isNegative(remaining);

  return (
    <section className={localStyles.budget} aria-label={t("round.summary")}>
      <p className={localStyles.budgetScope}>{t("applications.wholeRound")}</p>
      <dl className={localStyles.budgetLine}>
        <Inline align="baseline">
          <dt>
            {t(
              round.totals.unknownRequests > 0 ? "budget.knownRequests" : "applications.requested",
            )}
          </dt>
          <dd>{money(round.totals.requested)}</dd>
        </Inline>
        <Inline align="baseline">
          <dt>{t("applications.proposed")}</dt>
          <dd>{money(round.totals.proposed)}</dd>
        </Inline>
        <Inline align="baseline" className={over ? localStyles.warning : undefined}>
          <dt>{t(over ? "budget.overIfApproved" : "budget.remaining")}</dt>
          <dd>{remaining === null ? t("preparation.budgetUnset") : money(absolute(remaining))}</dd>
        </Inline>
      </dl>
      {round.totals.unknownRequests > 0 && (
        <p className={localStyles.summaryNote}>
          {t("budget.unknownRequests", { count: round.totals.unknownRequests })}
        </p>
      )}
      <p className={localStyles.reviewLine}>{reviewStatusText(t, round.totals.reviews)}</p>
      {over && (
        <Notice tone="warning" className={localStyles.notice}>
          {t("budget.exceeded", { amount: money(remaining === null ? null : absolute(remaining)) })}
        </Notice>
      )}
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
      sort: {
        value: (application) => application.title,
        compare: (left, right) => left.title.localeCompare(right.title, "en"),
      },
      layout: { width: "28%", primary: true },
      cell: (application) => (
        <>
          <div className={localStyles.title}>
            {renderApplicationLink?.(application) ?? application.title}
          </div>
          <p className={localStyles.applicant}>{application.submission?.organization}</p>
          {application.intakeStatus === "in_preparation" && (
            <p className={localStyles.preparing}>{t("intake.preparing")}</p>
          )}
        </>
      ),
    },
    {
      id: "reviews",
      header: t("applications.reviewStatus"),
      layout: { width: "22%" },
      cell: (application) => {
        const reviews = summarizeAssessments(application.assessments);
        const progress = reviewStatusText(t, reviews);
        const criteriaChanged = application.assessments.some((review) => review.criteriaChanged);
        const reviewStatus = criteriaChanged
          ? `${progress}. ${t("reviews.criteriaChanged")}`
          : progress;

        return (
          <div
            className={`${localStyles.reviewColumn} ${reviews.outdated > 0 || criteriaChanged ? localStyles.warning : localStyles.muted}`}
          >
            <span>{renderReviewLink?.(application, reviewStatus) ?? reviewStatus}</span>
          </div>
        );
      },
    },
    {
      id: "recommendation",
      header: t("applications.recommendation"),
      layout: { width: "24%" },
      cell: (application) => <ApplicationRecommendationCell application={application} />,
    },
    {
      id: "requested",
      header: t("applications.requested"),
      layout: { width: "13%", align: "end" },
      sort: {
        value: (application) => application.requested,
        compare: (left, right) =>
          left.requested !== null && right.requested !== null
            ? compare(left.requested, right.requested)
            : 0,
      },
      cell: (application) =>
        application.requested === null ? (
          <span className={localStyles.muted} aria-label={t("intake.unknownAmount")}>
            {t("intake.notKnown")}
          </span>
        ) : (
          money(application.requested)
        ),
    },
    {
      id: "proposed",
      header: t("applications.proposed"),
      layout: { width: "13%", align: "end" },
      sort: {
        value: (application) => application.managerRecommendation?.allocation,
        compare: (left, right) => {
          const a = left.managerRecommendation;
          const b = right.managerRecommendation;
          return a && b ? compare(a.allocation, b.allocation) : 0;
        },
      },
      cell: (application) => (
        <div>
          <span>
            {application.managerRecommendation
              ? money(application.managerRecommendation.allocation)
              : "—"}
          </span>
        </div>
      ),
    },
  ];

  return columns;
};

const ApplicationRecommendationCell = ({ application }: { application: Application }) => {
  const { t } = useTranslation("fundingRounds");
  return (
    <div>
      <div>
        {application.managerRecommendation ? (
          <>
            <span>{t(recommendationPositionKeys[application.managerRecommendation.position])}</span>
            {application.managerRecommendation.recorded &&
              application.managerRecommendation.recorded.applicationVersion !==
                application.version && (
                <p className={localStyles.earlier}>{t("intake.outdatedShort")}</p>
              )}
          </>
        ) : (
          <span className={localStyles.muted}>{t("applications.notRecommended")}</span>
        )}
      </div>
    </div>
  );
};

const ApplicationFilters = ({
  query,
  filter,
  changeFilters,
  count,
  total,
}: {
  query: string;
  filter: ApplicationFilter;
  changeFilters: (value: { query: string; filter: ApplicationFilter }) => void;
  count: number;
  total: number;
}) => {
  const { t } = useTranslation("fundingRounds");
  const filtered = query.trim() !== "" || filter !== "all";
  return (
    <>
      <div className={localStyles.listControls}>
        <TextField
          label={t("applications.search")}
          placeholder={t("applications.searchPlaceholder")}
          type="search"
          value={query}
          onChange={(query) => changeFilters({ query, filter })}
        />
        <Select
          label={t("applications.show")}
          selectedKey={filter}
          onSelectionChange={(filter) => changeFilters({ query, filter })}
          items={applicationFilters.map((id) => ({
            id,
            label: t(`applications.filters.${id}`),
          }))}
        />
      </div>
      {filtered && (
        <div className={localStyles.filterSummary}>
          <span role="status">
            {t("applications.filtered", {
              count: count,
              total,
            })}
          </span>
          <Button
            variant="quiet"
            size="small"
            onPress={() => changeFilters({ query: "", filter: "all" })}
          >
            {t("applications.clearFilters")}
          </Button>
        </div>
      )}
    </>
  );
};

const RoundApplicationsTable = ({
  applications,
  columns,
  filtered,
  sorting,
  onSortingChange,
}: {
  applications: Application[];
  columns: TableColumn<Application>[];
  filtered: boolean;
  sorting: TableSort;
  onSortingChange: (value: TableSort) => void;
}) => {
  const { t } = useTranslation("fundingRounds");
  return (
    <DataTable
      data={applications}
      density="compact"
      stickyHeader={{ mode: "page" }}
      columns={columns}
      getRowId={(application) => application.id}
      label={t("applications.title")}
      emptyMessage={t(filtered ? "applications.noMatches" : "applications.empty")}
      sorting={{
        value: sorting,
        onChange: onSortingChange,
        labels: {
          by: t("applications.sortBy"),
          original: t("applications.originalOrder"),
          ascending: t("applications.ascending"),
          descending: t("applications.descending"),
        },
      }}
    />
  );
};
