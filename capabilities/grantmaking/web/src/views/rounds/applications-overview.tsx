import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ApplicationOverview } from "@merit/grantmaking/api";
import { recommendationPositionKeys } from "@merit/recommendations-web/work";
import { reviewStatusText } from "@merit/reviews-web/work";
import { DataTable, type TableColumn, type TableSort } from "@merit/tables";
import { Button } from "@merit/ui/button";
import { Select } from "@merit/ui/select";
import { TextField } from "@merit/ui/text-field";

import {
  applicationFilters,
  matchesApplicationFilter,
  matchesApplicationSearch,
  type ApplicationFilter,
} from "../../controllers/rounds/application-list-filter";
import styles from "./applications-overview.module.css";

type ApplicationsOverviewProps = {
  applications: readonly ApplicationOverview[];
  rounds: readonly { id: string; title: string }[];
  roundId: string;
  onRoundChange: (roundId: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  filter?: ApplicationFilter;
  onFilterChange?: (filter: ApplicationFilter) => void;
  sorting: TableSort;
  onSortingChange: (sorting: TableSort) => void;
  renderApplicationLink: (
    application: ApplicationOverview,
    label: ReactNode,
    reviews?: boolean,
  ) => ReactNode;
  renderRoundLink: (application: ApplicationOverview) => ReactNode;
};

export const ApplicationsOverview = ({
  applications,
  rounds,
  roundId,
  onRoundChange,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sorting,
  onSortingChange,
  renderApplicationLink,
  renderRoundLink,
}: ApplicationsOverviewProps) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const filterState = useOverviewFilterState({ query, onQueryChange, filter, onFilterChange });
  const searchOrFilterActive = filterState.query.trim() !== "" || filterState.filter !== "all";
  const shown = applications.filter((application) =>
    matchesOverviewRow(application, roundId, filterState.query, filterState.filter),
  );
  const columns = useOverviewColumns({ renderApplicationLink, renderRoundLink });

  return (
    <>
      <OverviewFilters
        rounds={rounds}
        roundId={roundId}
        onRoundChange={onRoundChange}
        query={filterState.query}
        onQueryChange={filterState.onQueryChange}
        filter={filterState.filter}
        onFilterChange={filterState.onFilterChange}
        count={shown.length}
        total={applications.length}
      />
      <DataTable
        data={shown}
        columns={columns}
        getRowId={(row) => row.id}
        label={t("applications.title")}
        emptyMessage={t(emptyMessageKey(searchOrFilterActive, roundId))}
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
    </>
  );
};

const useOverviewFilterState = ({
  query,
  onQueryChange,
  filter,
  onFilterChange,
}: Pick<ApplicationsOverviewProps, "query" | "onQueryChange" | "filter" | "onFilterChange">) => {
  const [localQuery, setLocalQuery] = useState(query ?? "");
  const [localFilter, setLocalFilter] = useState<ApplicationFilter>(filter ?? "all");

  return {
    query: onQueryChange ? (query ?? "") : localQuery,
    filter: onFilterChange ? (filter ?? "all") : localFilter,
    onQueryChange: (next: string) => {
      setLocalQuery(next);
      onQueryChange?.(next);
    },
    onFilterChange: (next: ApplicationFilter) => {
      setLocalFilter(next);
      onFilterChange?.(next);
    },
  };
};

const matchesOverviewRow = (
  application: ApplicationOverview,
  roundId: string,
  query: string,
  filter: ApplicationFilter,
) =>
  (!roundId || application.roundId === roundId) &&
  matchesApplicationSearch(application, query) &&
  matchesApplicationFilter(application, filter);

const emptyMessageKey = (searchOrFilterActive: boolean, roundId: string) => {
  if (searchOrFilterActive) {
    return "applications.noMatches";
  }
  return roundId ? "applications.empty" : "overview.empty";
};

const OverviewFilters = ({
  rounds,
  roundId,
  onRoundChange,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  count,
  total,
}: {
  rounds: readonly { id: string; title: string }[];
  roundId: string;
  onRoundChange: (roundId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filter: ApplicationFilter;
  onFilterChange: (filter: ApplicationFilter) => void;
  count: number;
  total: number;
}) => {
  const { t } = useTranslation("fundingRounds");
  const filtered = Boolean(roundId) || query.trim() !== "" || filter !== "all";
  const unavailableRound = roundId && !rounds.some((round) => round.id === roundId);

  return (
    <>
      <div className={styles.controls}>
        <TextField
          label={t("applications.search")}
          placeholder={t("applications.searchPlaceholder")}
          type="search"
          value={query}
          onChange={onQueryChange}
        />
        <Select
          label={t("rounds.round")}
          selectedKey={roundId || "all"}
          onSelectionChange={(id) => onRoundChange(id === "all" ? "" : id)}
          items={[
            { id: "all", label: t("overview.allRounds") },
            ...(unavailableRound ? [{ id: roundId, label: t("overview.unavailableRound") }] : []),
            ...rounds.map((round) => ({ id: round.id, label: round.title })),
          ]}
        />
        <Select
          label={t("applications.show")}
          selectedKey={filter}
          onSelectionChange={onFilterChange}
          items={applicationFilters.map((id) => ({
            id,
            label: t(`applications.filters.${id}`),
          }))}
        />
      </div>
      <div className={styles.filterSummary}>
        <span role="status">{t("applications.filtered", { count, total })}</span>
        {filtered && (
          <Button
            variant="quiet"
            size="small"
            onPress={() => {
              onRoundChange("");
              onQueryChange("");
              onFilterChange("all");
            }}
          >
            {t("applications.clearFilters")}
          </Button>
        )}
      </div>
    </>
  );
};

const useOverviewColumns = ({
  renderApplicationLink,
  renderRoundLink,
}: Pick<ApplicationsOverviewProps, "renderApplicationLink" | "renderRoundLink">) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  return [
    {
      id: "application",
      header: t("applications.application"),
      layout: { width: "22%", primary: true },
      sort: { value: (row) => row.title, compare: (a, b) => a.title.localeCompare(b.title, "en") },
      cell: (row) => renderApplicationLink(row, row.title),
    },
    {
      id: "applicant",
      header: t("intake.applicant"),
      layout: { width: "18%" },
      sort: {
        value: (row) => row.applicant || null,
        compare: (a, b) => (a.applicant ?? "").localeCompare(b.applicant ?? "", "en"),
      },
      cell: (row) => row.applicant || <span className={styles.muted}>{t("intake.notKnown")}</span>,
    },
    {
      id: "round",
      header: t("rounds.round"),
      layout: { width: "18%" },
      sort: {
        value: (row) => row.roundTitle,
        compare: (a, b) => a.roundTitle.localeCompare(b.roundTitle, "en"),
      },
      cell: renderRoundLink,
    },
    {
      id: "intake",
      header: t("overview.intake"),
      layout: { width: "12%" },
      sort: {
        value: (row) => row.intakeStatus,
        compare: (a, b) => a.intakeStatus.localeCompare(b.intakeStatus, "en"),
      },
      cell: (row) => t(row.intakeStatus === "ready" ? "overview.ready" : "intake.preparing"),
    },
    {
      id: "reviews",
      header: t("applications.reviewStatus"),
      layout: { width: "18%" },
      cell: (row) => (
        <div className={row.reviews.outdated || row.criteriaChanged ? styles.warning : undefined}>
          {renderApplicationLink(row, reviewStatusText(t, row.reviews), true)}
          {row.criteriaChanged && <p>{t("reviews.criteriaChanged")}</p>}
        </div>
      ),
    },
    {
      id: "recommendation",
      header: t("applications.recommendation"),
      layout: { width: "12%" },
      cell: (row) => (
        <>
          {row.recommendation ? (
            t(recommendationPositionKeys[row.recommendation.position])
          ) : (
            <span className={styles.muted}>{t("applications.notRecommended")}</span>
          )}
          {row.recommendation?.outdated && (
            <p className={styles.warning}>{t("intake.outdatedShort")}</p>
          )}
        </>
      ),
    },
  ] satisfies TableColumn<ApplicationOverview>[];
};
