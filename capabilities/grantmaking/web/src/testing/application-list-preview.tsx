import { useState, type ComponentProps } from "react";

import { isWithdrawn } from "@merit/applications/domain";
import {
  matchesApplicationCriteria,
  workspaceApplicationsPageSize,
  type ApplicationOverview,
  type RoundView,
} from "@merit/grantmaking/api";
import { encodeMoney } from "@merit/money";
import { summarizeAssessments } from "@merit/reviews/domain";
import type { TableSort } from "@merit/tables";

import type { ApplicationList } from "../contracts/application-list";
import { ApplicationsOverview } from "../views/rounds/applications-overview";
import { FundingRoundView } from "../views/rounds/funding-round-view";

export const applicationOverviewForPreview = (
  round: RoundView,
  application: RoundView["applications"][number],
): ApplicationOverview => ({
  id: application.id,
  title: application.title,
  applicant: application.submission?.organization ?? null,
  roundId: round.id,
  roundTitle: round.title,
  withdrawn: isWithdrawn(application),
  intakeStatus: application.intakeStatus,
  requested: application.requested === null ? null : encodeMoney(application.requested),
  reviews: summarizeAssessments(application.assessments),
  criteriaChanged: application.assessments.some((review) => review.criteriaChanged),
  recommendation: application.managerRecommendation
    ? {
        position: application.managerRecommendation.position,
        allocation: encodeMoney(application.managerRecommendation.allocation),
        outdated: Boolean(
          application.managerRecommendation.recorded &&
          application.managerRecommendation.recorded.applicationVersion !== application.version,
        ),
      }
    : null,
});

const sortValue = (row: ApplicationOverview, column: string) => {
  switch (column) {
    case "application":
      return row.title;
    case "applicant":
      return row.applicant;
    case "round":
      return row.roundTitle;
    case "intake":
      return row.withdrawn
        ? "Withdrawn"
        : row.intakeStatus === "ready"
          ? "Ready"
          : "In preparation";
    case "requested":
      return row.requested ? BigInt(row.requested.minorUnits) : null;
    case "proposed":
      return row.recommendation ? BigInt(row.recommendation.allocation.minorUnits) : null;
    default:
      return null;
  }
};

/** Local fake pages keep examples interactive without adding modes to production views. */
const useApplicationListPreview = (
  props: Partial<ApplicationList> & {
    applications: readonly ApplicationOverview[];
    roundId?: string;
  },
): ApplicationList => {
  const [query, onQueryChange] = useState(props.query ?? "");
  const [filter, onFilterChange] = useState(props.filter ?? {});
  const [localSorting, setSorting] = useState<TableSort>(props.sorting ?? null);
  const [offset, setOffset] = useState(0);
  const sorting = props.onSortingChange ? (props.sorting ?? null) : localSorting;
  const shown = props.applications.filter(
    (row) =>
      (!props.roundId || row.roundId === props.roundId) &&
      `${row.title} ${row.applicant ?? ""}`
        .toLocaleLowerCase("en")
        .includes(query.trim().toLocaleLowerCase("en")) &&
      matchesApplicationCriteria(row, filter),
  );
  if (sorting) {
    shown.sort((left, right) => {
      const a = sortValue(left, sorting.columnId),
        b = sortValue(right, sorting.columnId);
      if (a === null || b === null) {
        return a === b ? 0 : a === null ? 1 : -1;
      }
      const order =
        typeof a === "string" && typeof b === "string"
          ? a.localeCompare(b, "en")
          : a < b
            ? -1
            : a > b
              ? 1
              : 0;
      return sorting.direction === "ascending" ? order : -order;
    });
  }
  return {
    query,
    filter,
    sorting,
    onQueryChange: (value) => {
      onQueryChange(value);
      setOffset(0);
    },
    onFilterChange: (value) => {
      onFilterChange(value);
      setOffset(0);
    },
    onSortingChange: props.onSortingChange ?? setSorting,
    applications: props.pagination
      ? props.applications
      : shown.slice(offset, offset + workspaceApplicationsPageSize),
    pagination: props.pagination ?? {
      total: props.applications.length,
      matching: shown.length,
      offset,
      loading: false,
      failed: false,
      retrying: false,
      onPrevious: () => setOffset(Math.max(0, offset - workspaceApplicationsPageSize)),
      onNext: () => setOffset(offset + workspaceApplicationsPageSize),
      onRetry: () => {},
    },
  };
};

type OverviewProps = Omit<ComponentProps<typeof ApplicationsOverview>, keyof ApplicationList> &
  Omit<Partial<ApplicationList>, "pagination"> & {
    applications: readonly ApplicationOverview[];
    pagination?: Omit<ApplicationList["pagination"], "retrying"> & { retrying?: boolean };
  };

export const ApplicationsOverviewPreview = (props: OverviewProps) => {
  const list = useApplicationListPreview({
    ...props,
    pagination: props.pagination && { retrying: false, ...props.pagination },
  });
  return <ApplicationsOverview {...props} {...list} />;
};

export const FundingRoundPreview = ({
  round,
  ...props
}: Omit<ComponentProps<typeof FundingRoundView>, "round" | "applicationList"> & {
  round: RoundView;
}) => {
  const list = useApplicationListPreview({
    applications: round.applications.map((application) =>
      applicationOverviewForPreview(round, application),
    ),
  });
  return <FundingRoundView {...props} round={round} applicationList={list} />;
};
