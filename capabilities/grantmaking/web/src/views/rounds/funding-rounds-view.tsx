import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RoundSummary } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { DataTable, type TableColumn } from "@merit/tables";
import { PageHeader } from "@merit/ui/page-header";
import { PersonIdentity } from "@merit/ui/person-identity";
import { StatusIndicator } from "@merit/ui/status-indicator";
import { Text } from "@merit/ui/text";

import styles from "./funding-rounds-view.module.css";

const ResponsibleManagerCell = ({ round }: { round: RoundSummary }) => {
  const { t } = useTranslation("fundingRounds");
  const manager = round.manager.trim();

  if (!manager) {
    return (
      <PersonIdentity
        name={t(round.managerNeedsReassignment ? "rounds.unassigned" : "preparation.unknownPerson")}
        isPlaceholder
      />
    );
  }

  return (
    <span className={styles.manager}>
      <PersonIdentity name={manager} />
      {round.managerNeedsReassignment && (
        <StatusIndicator
          label={t("rounds.reassignmentNeeded")}
          explanation={t("rounds.reassignmentExplanation")}
        />
      )}
    </span>
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
        <Text as="div" variant="emphasis">
          <div className={styles.title}>{renderRoundLink(round)}</div>
        </Text>
      ),
    },
    {
      id: "status",
      header: t("round.status"),
      layout: { width: "14%" },
      cell: (round) => round.decisionStatus,
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
      cell: (round) =>
        renderApplicationsLink(
          round,
          t("workspace.applicationCount", { count: round.applicationCount }),
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
        density="compact"
        columns={columns}
        getRowId={(round) => round.publicId}
        label={t("workspace.rounds")}
        emptyMessage={t("rounds.empty")}
      />
    </>
  );
};
