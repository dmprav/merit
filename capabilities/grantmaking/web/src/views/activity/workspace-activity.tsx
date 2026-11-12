import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ActivityEntry, ActivityPerson } from "@merit/grantmaking/api";
import { useLocaleSettings } from "@merit/i18n";
import { DataTable, type TableColumn } from "@merit/tables";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Button } from "@merit/ui/button";
import { Select } from "@merit/ui/select";

import styles from "./workspace-activity.module.css";

export type ActivityFilters = { roundId: string; personId: string };

type ActivityRecord = NonNullable<ActivityEntry["record"]>;

const actionLabels = {
  "application.create": "activity.actions.applicationCreate",
  "application.mark_ready": "activity.actions.applicationMarkReady",
  "application.revision": "activity.actions.applicationRevision",
  "application.correction": "activity.actions.applicationCorrection",
  "application.delete": "activity.actions.applicationDelete",
  "round.create": "activity.actions.roundCreate",
  "round.budget": "activity.actions.roundBudget",
  "round.criteria": "activity.actions.roundCriteria",
  "round.manager": "activity.actions.roundManager",
  "round.delete": "activity.actions.roundDelete",
  "assessment.recorded": "activity.actions.assessmentRecorded",
  "assessment.submitted": "activity.actions.assessmentSubmitted",
  "recommendation.saved": "activity.actions.recommendationSaved",
} as const;

/** Actions recorded by a later release still read sensibly. */
const actionLabel = (action: string) =>
  actionLabels[action as keyof typeof actionLabels] ?? "activity.changed";

type WorkspaceActivityProps = {
  entries: readonly ActivityEntry[];
  people: readonly ActivityPerson[];
  rounds: readonly { id: string; title: string }[];
  filters: ActivityFilters;
  onFiltersChange: (filters: ActivityFilters) => void;
  /** Older entries remain to be shown. */
  hasMore: boolean;
  onShowMore: () => void;
  /** Entries stay visible while a new filter or an older page loads. */
  status?: "ready" | "refreshing" | "loadingMore" | "failed";
  onRetry?: () => void;
  renderRecordLink: (record: ActivityRecord, label: ReactNode) => ReactNode;
};

/** Who changed shared grant work, newest first, with links to the records that changed. */
export const WorkspaceActivity = ({
  entries,
  people,
  rounds,
  filters,
  onFiltersChange,
  hasMore,
  onShowMore,
  status = "ready",
  onRetry,
  renderRecordLink,
}: WorkspaceActivityProps) => {
  const { t } = useTranslation("fundingRounds");
  const columns = useActivityColumns(renderRecordLink);
  const filtered = Boolean(filters.roundId || filters.personId);

  return (
    <>
      <FilterControls
        people={people}
        rounds={rounds}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
      <DataTable
        data={entries}
        columns={columns}
        getRowId={(row) => row.id}
        label={t("activity.title")}
        emptyMessage={t(filtered ? "activity.noMatches" : "activity.empty")}
        state={tableState(status, t)}
      />
      <div className={styles.more}>
        {status === "failed"
          ? onRetry && (
              <Button variant="secondary" onPress={onRetry}>
                {t("activity.retry")}
              </Button>
            )
          : hasMore && (
              <Button
                variant="secondary"
                onPress={onShowMore}
                isPending={status === "loadingMore"}
                isDisabled={status === "refreshing"}
              >
                {t("activity.showOlder")}
              </Button>
            )}
      </div>
    </>
  );
};

const tableState = (
  status: NonNullable<WorkspaceActivityProps["status"]>,
  t: (key: "activity.loading" | "activity.loadError") => string,
): ComponentProps<typeof DataTable>["state"] =>
  status === "refreshing" || status === "loadingMore"
    ? { type: "loading", message: t("activity.loading") }
    : status === "failed"
      ? { type: "error", message: t("activity.loadError") }
      : undefined;

const FilterControls = ({
  people,
  rounds,
  filters,
  onFiltersChange,
}: Pick<WorkspaceActivityProps, "people" | "rounds" | "filters" | "onFiltersChange">) => {
  const { t } = useTranslation("fundingRounds");

  return (
    <div className={styles.controls}>
      <Select
        label={t("rounds.round")}
        selectedKey={filters.roundId || "all"}
        onSelectionChange={(id) => onFiltersChange({ ...filters, roundId: id === "all" ? "" : id })}
        items={[
          { id: "all", label: t("overview.allRounds") },
          ...(filters.roundId && !rounds.some((round) => round.id === filters.roundId)
            ? [{ id: filters.roundId, label: t("overview.unavailableRound") }]
            : []),
          ...rounds.map((round) => ({ id: round.id, label: round.title })),
        ]}
      />
      <Select
        label={t("activity.person")}
        selectedKey={filters.personId || "all"}
        onSelectionChange={(id) =>
          onFiltersChange({ ...filters, personId: id === "all" ? "" : id })
        }
        items={[
          { id: "all", label: t("activity.allPeople") },
          ...people.map((person) => ({
            id: person.id,
            label: person.name || t("activity.unknownPerson"),
          })),
        ]}
      />
      {(filters.roundId || filters.personId) && (
        <Button variant="secondary" onPress={() => onFiltersChange({ roundId: "", personId: "" })}>
          {t("activity.clearFilters")}
        </Button>
      )}
    </div>
  );
};

const useActivityColumns = (renderRecordLink: WorkspaceActivityProps["renderRecordLink"]) => {
  const { t } = useTranslation("fundingRounds");
  const { formatLocale } = useLocaleSettings();

  return [
    {
      id: "when",
      header: t("activity.when"),
      layout: { width: "18%", wrap: false },
      cell: (row) => (
        <time dateTime={row.recordedAt}>
          {new Date(row.recordedAt).toLocaleString(formatLocale, { timeZone: "UTC" })} UTC
        </time>
      ),
    },
    {
      id: "who",
      header: t("activity.who"),
      layout: { width: "24%" },
      cell: (row) => (
        <div className={styles.who}>
          <span className={styles.text}>{row.actor || t("activity.unknownPerson")}</span>
          <ActionProvenance value={row.provenance} />
        </div>
      ),
    },
    {
      id: "what",
      header: t("activity.what"),
      layout: { width: "24%" },
      cell: (row) => t(actionLabel(row.action)),
    },
    {
      id: "record",
      header: t("activity.record"),
      layout: { primary: true },
      cell: (row) =>
        row.record ? (
          <span className={styles.text}>{renderRecordLink(row.record, row.record.title)}</span>
        ) : (
          <span className={styles.muted}>{t("activity.unavailableRecord")}</span>
        ),
    },
  ] satisfies TableColumn<ActivityEntry>[];
};
