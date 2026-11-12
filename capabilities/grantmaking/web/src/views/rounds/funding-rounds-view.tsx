import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RoundSummary } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { DataTable, type TableColumn } from "@merit/tables";
import { Badge } from "@merit/ui/badge";
import { PageHeader } from "@merit/ui/page-header";

import styles from "./funding-rounds-view.module.css";

export const FundingRoundsView = ({
  rounds,
  createAction,
  renderRoundLink,
  renderApplicationsLink,
}: {
  rounds: readonly RoundSummary[];
  createAction?: ReactNode;
  renderRoundLink: (round: RoundSummary) => ReactNode;
  renderApplicationsLink: (round: RoundSummary, children: ReactNode) => ReactNode;
}) => {
  const { t } = useTranslation("fundingRounds");
  const { money, calendarDate } = useFormat();
  const columns: TableColumn<RoundSummary>[] = [
    {
      id: "round",
      header: t("rounds.round"),
      layout: { width: "34%", primary: true },
      cell: (round) => (
        <>
          <div className={styles.title}>{renderRoundLink(round)}</div>
          <p className={styles.organization}>{round.organizationName}</p>
        </>
      ),
    },
    {
      id: "status",
      header: t("round.status"),
      layout: { width: "19%" },
      cell: (round) => <Badge>{round.decisionStatus}</Badge>,
    },
    {
      id: "applications",
      header: t("applications.title"),
      layout: { width: "16%" },
      cell: (round) => (
        <span className={styles.applications}>
          {renderApplicationsLink(
            round,
            t("workspace.applicationCount", { count: round.applicationCount }),
          )}
        </span>
      ),
    },
    {
      id: "committee",
      header: t("round.committeeDate"),
      layout: { width: "19%" },
      cell: (round) => (
        <>
          {round.meetingDate === null
            ? t("preparation.notScheduled")
            : calendarDate(round.meetingDate)}
        </>
      ),
    },
    {
      id: "budget",
      header: t("rounds.budget"),
      layout: { width: "12%", align: "end" },
      cell: (round) => <>{round.budget === null ? t("preparation.notSet") : money(round.budget)}</>,
    },
  ];

  return (
    <>
      <PageHeader title={t("workspace.rounds")} actions={createAction} />
      <DataTable
        data={rounds}
        columns={columns}
        getRowId={(round) => round.publicId}
        label={t("workspace.rounds")}
        emptyMessage={t("rounds.empty")}
      />
    </>
  );
};
