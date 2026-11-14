import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RoundSummary } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { DataTable, type TableColumn } from "@merit/tables";
import { Badge } from "@merit/ui/badge";
import { PageHeader } from "@merit/ui/page-header";
import { PersonIdentity } from "@merit/ui/person-identity";

import styles from "./funding-rounds-view.module.css";

const ResponsibleManagerCell = ({ round }: { round: RoundSummary }) => {
  const { t } = useTranslation("fundingRounds");
  const manager = round.manager.trim();

  if (!manager) {
    return round.managerNeedsReassignment ? (
      <Badge tone="warning">{t("rounds.needsAssignment")}</Badge>
    ) : (
      <>{t("preparation.unknownPerson")}</>
    );
  }

  return (
    <PersonIdentity
      name={manager}
      description={
        round.managerNeedsReassignment ? (
          <Badge tone="warning">{t("rounds.reassignmentNeeded")}</Badge>
        ) : undefined
      }
    />
  );
};

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
      layout: { width: "26%", primary: true },
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
      layout: { width: "14%" },
      cell: (round) => <Badge>{round.decisionStatus}</Badge>,
    },
    {
      id: "manager",
      header: t("preparation.responsibleManager"),
      layout: { width: "22%" },
      cell: (round) => <ResponsibleManagerCell round={round} />,
    },
    {
      id: "applications",
      header: t("applications.title"),
      layout: { width: "12%" },
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
      layout: { width: "15%" },
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
      layout: { width: "11%", align: "end" },
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
