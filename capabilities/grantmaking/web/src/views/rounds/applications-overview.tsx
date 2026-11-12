import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ApplicationOverview } from "@merit/grantmaking/api";
import { recommendationPositionKeys } from "@merit/recommendations-web/work";
import { reviewStatusText } from "@merit/reviews-web/work";
import { DataTable, type TableColumn, type TableSort } from "@merit/tables";
import { Select } from "@merit/ui/select";

import styles from "./applications-overview.module.css";

type ApplicationsOverviewProps = {
  applications: readonly ApplicationOverview[];
  rounds: readonly { id: string; title: string }[];
  roundId: string;
  onRoundChange: (roundId: string) => void;
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
  sorting,
  onSortingChange,
  renderApplicationLink,
  renderRoundLink,
}: ApplicationsOverviewProps) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const shown = applications.filter((application) => !roundId || application.roundId === roundId);
  const columns = useOverviewColumns({ renderApplicationLink, renderRoundLink });

  return (
    <>
      <div className={styles.controls}>
        <Select
          label={t("rounds.round")}
          selectedKey={roundId || "all"}
          onSelectionChange={(id) => onRoundChange(id === "all" ? "" : id)}
          items={[
            { id: "all", label: t("overview.allRounds") },
            ...(roundId && !rounds.some((round) => round.id === roundId)
              ? [{ id: roundId, label: t("overview.unavailableRound") }]
              : []),
            ...rounds.map((round) => ({ id: round.id, label: round.title })),
          ]}
        />
        <span role="status" className={styles.count}>
          {t("applications.filtered", { count: shown.length, total: applications.length })}
        </span>
      </div>
      <DataTable
        data={shown}
        columns={columns}
        getRowId={(row) => row.id}
        label={t("applications.title")}
        emptyMessage={t(roundId ? "applications.empty" : "overview.empty")}
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
