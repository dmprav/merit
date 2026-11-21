import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ApplicationOverview } from "@merit/grantmaking/api";
import { ReviewSummary } from "@merit/reviews-web/work";
import type { TableColumn } from "@merit/tables";
import { Text } from "@merit/ui/text";

import type { ApplicationList } from "../../contracts/application-list";
import { ApplicationCollection } from "./application-collection";
import { ApplicationRecommendationStatus } from "./application-recommendation-status";
import styles from "./applications-overview.module.css";

type ApplicationsOverviewProps = ApplicationList & {
  rounds: readonly { id: string; title: string }[];
  roundId: string;
  onRoundChange: (roundId: string) => void;
  renderApplicationLink: (
    application: ApplicationOverview,
    label: ReactNode,
    reviews?: boolean,
  ) => ReactNode;
  renderRoundLink: (application: ApplicationOverview) => ReactNode;
};

export const ApplicationsOverview = (props: ApplicationsOverviewProps) => (
  <ApplicationCollection
    list={props}
    columns={useOverviewColumns(props)}
    round={{ choices: props.rounds, value: props.roundId, onChange: props.onRoundChange }}
    emptyScope={props.roundId ? "round" : "workspace"}
  />
);

const useOverviewColumns = ({
  renderApplicationLink,
  renderRoundLink,
}: Pick<ApplicationsOverviewProps, "renderApplicationLink" | "renderRoundLink">) => {
  const { t } = useTranslation(["fundingRounds", "common"]);

  const intakeLabel = (row: ApplicationOverview) =>
    row.withdrawn
      ? t("applications.withdrawn")
      : t(row.intakeStatus === "ready" ? "overview.ready" : "intake.preparing");

  return [
    {
      id: "application",
      header: t("applications.application"),
      layout: { width: "20%", primary: true },
      sort: true,
      cell: (row) => (
        <span className={styles.identity}>{renderApplicationLink(row, row.title)}</span>
      ),
    },
    {
      id: "applicant",
      header: t("intake.applicant"),
      layout: { width: "16%" },
      sort: true,
      cell: (row) => row.applicant || <Text variant="missing">{t("intake.notKnown")}</Text>,
    },
    {
      id: "round",
      header: t("rounds.round"),
      layout: { width: "16%" },
      sort: true,
      cell: (row) => <span className={styles.identity}>{renderRoundLink(row)}</span>,
    },
    {
      id: "intake",
      header: t("overview.intake"),
      layout: { width: "10%" },
      sort: true,
      cell: (row) => intakeLabel(row),
    },
    {
      id: "reviews",
      header: t("applications.reviewStatus"),
      layout: { width: "22%" },
      cell: (row) => (
        <ReviewSummary
          reviews={row.reviews}
          criteriaChanged={row.criteriaChanged}
          applicationTitle={row.title}
          renderReviewLink={(label) => renderApplicationLink(row, label, true)}
        />
      ),
    },
    {
      id: "recommendation",
      header: t("applications.recommendation"),
      layout: { width: "16%" },
      cell: (row) => (
        <span className={styles.recommendation}>
          <ApplicationRecommendationStatus recommendation={row.recommendation} />
        </span>
      ),
    },
  ] satisfies TableColumn<ApplicationOverview>[];
};
