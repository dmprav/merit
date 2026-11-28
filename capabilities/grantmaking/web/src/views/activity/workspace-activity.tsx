import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ActivityEntry, ActivityPerson } from "@merit/grantmaking/api";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Attribution } from "@merit/ui/attribution";
import { Button } from "@merit/ui/button";
import { CollectionFilter, CollectionToolbar } from "@merit/ui/collection-toolbar";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { DialogContent, SidePanel } from "@merit/ui/dialog";
import { Reading, Stack } from "@merit/ui/layout";
import { CollectionRecovery, useCollectionRecovery } from "@merit/ui/paged-content";
import { Text } from "@merit/ui/text";
import { Timeline, TimelineEntry } from "@merit/ui/timeline";
import { Timestamp } from "@merit/ui/timestamp";

import type { ActivityFilters } from "../../contracts/pages";
import styles from "./workspace-activity.module.css";

export type { ActivityFilters };

type ActivityRecord = NonNullable<ActivityEntry["record"]>;

const actionLabelEntries = [
  ["application.material_changed", "activity.actions.applicationMaterial"],
  ["application.summary_changed", "activity.actions.applicationSummary"],
  ["application.contact_changed", "activity.actions.applicationContact"],
  ["application_working_revision.started", "activity.actions.revisionStarted"],
  ["application_working_revision.updated", "activity.actions.revisionUpdated"],
  ["application_working_revision.discarded", "activity.actions.revisionDiscarded"],
  ["round.details_changed", "activity.actions.roundDetails"],
  ["assessment.corrected", "activity.actions.assessmentCorrected"],
  ["assessment.amended", "activity.actions.assessmentAmended"],
  ["review_request.created", "activity.actions.reviewRequested"],
  ["review_request.cancelled", "activity.actions.reviewCancelled"],
  ["review_assignment.invited", "activity.actions.reviewerInvited"],
  ["review_assignment.invitation_renewed", "activity.actions.reviewerRenewed"],
  ["review_assignment.accepted", "activity.actions.reviewerAccepted"],
  ["review_assignment.declined", "activity.actions.reviewerDeclined"],
  ["review_assignment.withdrawn", "activity.actions.reviewerWithdrawn"],
  ["review_assignment.conflict_reported", "activity.actions.reviewerConflict"],
  ["review_assignment.conflict_cleared", "activity.actions.reviewerCleared"],
  ["review_assignment.access_ended", "activity.actions.reviewerEnded"],
  ["review_assignment.reinstated", "activity.actions.reviewerReinstated"],

  ["application.created", "intake.eventCreate"],
  ["application.marked_ready", "intake.eventReady"],
  ["application.revision_recorded", "intake.eventRevision"],
  ["application.correction_recorded", "intake.eventCorrection"],
  ["application.deleted", "activity.actions.applicationDelete"],
  ["application.withdraw", "activity.actions.applicationWithdraw"],
  ["application.reinstate", "activity.actions.applicationReinstate"],
  ["round.created", "activity.actions.roundCreate"],
  ["round.budget_changed", "activity.actions.roundBudget"],
  ["round.criteria_changed", "activity.actions.roundCriteria"],
  ["round.manager_changed", "activity.actions.roundManager"],
  ["round.deleted", "activity.actions.roundDelete"],
  ["assessment.recorded", "activity.actions.assessmentRecorded"],
  ["assessment.submitted", "activity.actions.assessmentSubmitted"],
  ["recommendation.recorded", "activity.actions.recommendationSaved"],
  ["ai_review.recorded", "activity.actions.aiReviewRecorded"],
] as const;

const actionLabels: ReadonlyMap<string, (typeof actionLabelEntries)[number][1]> = new Map(
  actionLabelEntries,
);

/** Actions recorded by a later release still read sensibly. */
const actionLabel = (action: string) => actionLabels.get(action) ?? "activity.changed";

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
  const { t } = useTranslation(["fundingRounds", "contacts"]);
  const filtered = Boolean(filters.roundId || filters.personId);
  const { end, showMore } = useActivityPaging({ entries, filters, status, hasMore, onShowMore });

  const summary = useActivitySummary(status, entries.length, filtered);
  const pending = status === "refreshing" || status === "loadingMore";
  const recovering = useCollectionRecovery(status === "failed", pending);
  const recoveryMessage = t(pending ? "activity.loading" : "activity.loadError");

  return (
    <div className={styles.activity}>
      <FilterControls
        people={people}
        rounds={rounds}
        filters={filters}
        onFiltersChange={onFiltersChange}
        summary={summary}
      />
      <ActivityEvents entries={entries} renderRecordLink={renderRecordLink} />
      {recovering && (
        <CollectionRecovery
          message={recoveryMessage}
          retryLabel={t("activity.retry")}
          isPending={pending}
          onRetry={onRetry}
          showsEntries={entries.length > 0}
        />
      )}
      <div ref={end} className={styles.more}>
        {!recovering && hasMore && (
          <Button
            variant="quiet"
            onPress={showMore}
            isPending={status === "loadingMore"}
            isDisabled={status === "refreshing"}
          >
            {t("activity.showOlder")}
          </Button>
        )}
      </div>
    </div>
  );
};

const ActivityEvents = ({
  entries,
  renderRecordLink,
}: Pick<WorkspaceActivityProps, "entries" | "renderRecordLink">) => {
  const { t } = useTranslation("fundingRounds");
  if (entries.length === 0) {
    return null;
  }
  return (
    <Timeline label={t("activity.title")}>
      {entries.map((entry) => (
        <ActivityEvent key={entry.id} entry={entry} renderRecordLink={renderRecordLink} />
      ))}
    </Timeline>
  );
};

const useActivitySummary = (
  status: WorkspaceActivityProps["status"],
  count: number,
  filtered: boolean,
) => {
  const { t } = useTranslation("fundingRounds");
  if (status === "refreshing" || status === "loadingMore") {
    return t("activity.loading");
  }
  if (count > 0) {
    return t("activity.loaded", { count });
  }
  if (status === "failed") {
    return "";
  }
  return t(filtered ? "activity.noMatches" : "activity.empty");
};

const useActivityPaging = ({
  entries,
  filters,
  status = "ready",
  hasMore,
  onShowMore,
}: Pick<WorkspaceActivityProps, "entries" | "filters" | "status" | "hasMore" | "onShowMore">) => {
  const end = useRef<HTMLDivElement>(null);
  const requestedPage = useRef<string | null>(null);
  const page = JSON.stringify([filters.roundId, filters.personId, entries.at(-1)?.id]);
  const showMore = useCallback(() => {
    if (status !== "ready" || !hasMore || requestedPage.current === page) {
      return;
    }
    requestedPage.current = page;
    onShowMore();
  }, [status, hasMore, page, onShowMore]);

  useEffect(() => {
    requestedPage.current = null;
  }, [page]);

  useEffect(() => {
    if (status !== "ready" || !hasMore || !end.current || !globalThis.IntersectionObserver) {
      return;
    }
    let active = true;
    const observer = new IntersectionObserver(
      (observed) => {
        if (active && observed.some((entry) => entry.isIntersecting)) {
          showMore();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(end.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [status, hasMore, page, showMore]);

  return { end, showMore };
};

const FilterControls = ({
  people,
  rounds,
  filters,
  onFiltersChange,
  summary,
}: Pick<WorkspaceActivityProps, "people" | "rounds" | "filters" | "onFiltersChange"> & {
  summary: string;
}) => {
  const { t } = useTranslation(["fundingRounds", "contacts"]);
  const roundLabel =
    rounds.find((round) => round.id === filters.roundId)?.title || t("rounds.round");
  const personLabel =
    people.find((person) => person.id === filters.personId)?.name || t("contacts:unknownPerson");
  const chips = [
    ...(filters.roundId
      ? [
          {
            id: "round",
            label: roundLabel,
            removeLabel: t("activity.removeRound", { round: roundLabel }),
            onRemove: () => onFiltersChange({ ...filters, roundId: "" }),
          },
        ]
      : []),
    ...(filters.personId
      ? [
          {
            id: "person",
            label: personLabel,
            removeLabel: t("activity.removePerson", { person: personLabel }),
            onRemove: () => onFiltersChange({ ...filters, personId: "" }),
          },
        ]
      : []),
  ];

  return (
    <CollectionToolbar
      filterLabel={t("activity.filter")}
      filterTitle={t("activity.filters")}
      chips={chips}
      summary={summary}
      reset={{
        label: t("activity.clearFilters"),
        onReset: () => onFiltersChange({ roundId: "", personId: "" }),
        isDisabled: chips.length === 0,
      }}
      filters={
        <>
          <CollectionFilter
            label={t("rounds.round")}
            selectedKey={filters.roundId || "all"}
            onSelectionChange={(id) =>
              onFiltersChange({ ...filters, roundId: id === "all" ? "" : id })
            }
            items={[
              { id: "all", label: t("overview.allRounds") },
              ...rounds.map((round) => ({ id: round.id, label: round.title })),
            ]}
          />
          <CollectionFilter
            label={t("activity.person")}
            selectedKey={filters.personId || "all"}
            onSelectionChange={(id) =>
              onFiltersChange({ ...filters, personId: id === "all" ? "" : id })
            }
            items={[
              { id: "all", label: t("activity.allPeople") },
              ...people.map((person) => ({
                id: person.id,
                label: person.name || t("contacts:unknownPerson"),
              })),
            ]}
          />
        </>
      }
    />
  );
};

const ActivityEvent = ({
  entry,
  renderRecordLink,
}: {
  entry: ActivityEntry;
  renderRecordLink: WorkspaceActivityProps["renderRecordLink"];
}) => {
  const { t } = useTranslation(["fundingRounds", "contacts"]);
  const recordTitle = entry.record?.title || entry.subject.name || t("activity.unavailableRecord");
  const action = t(actionLabel(entry.action));
  return (
    <TimelineEntry
      headingLevel={2}
      title={
        <span className={styles.action}>
          <SidePanel
            title={action}
            trigger={
              <Button
                variant="inline"
                aria-label={t("activity.openDetails", { action, record: recordTitle })}
              >
                {action}
              </Button>
            }
          >
            <DialogContent>
              <ActivityDetails entry={entry} renderRecordLink={renderRecordLink} />
            </DialogContent>
          </SidePanel>
          <span className={styles.record}>
            {entry.record ? (
              renderRecordLink(entry.record, recordTitle)
            ) : (
              <Text variant="missing">{recordTitle}</Text>
            )}
          </span>
        </span>
      }
      attribution={
        <Attribution
          actor={entry.actor}
          provenance={entry.provenance}
          recordedAt={entry.recordedAt}
        />
      }
    />
  );
};

const ActivityDetails = ({
  entry,
  renderRecordLink,
}: {
  entry: ActivityEntry;
  renderRecordLink: WorkspaceActivityProps["renderRecordLink"];
}) => {
  const { t } = useTranslation(["fundingRounds", "contacts"]);
  const recordTitle = entry.record?.title || entry.subject.name || t("activity.unavailableRecord");
  return (
    <Stack gap={5}>
      <DescriptionList layout="rows">
        <DescriptionListItem label={t("activity.record")}>
          {entry.record ? renderRecordLink(entry.record, recordTitle) : recordTitle}
          {!entry.record && entry.subject.name && (
            <Text variant="missing">{t("activity.unavailableRecord")}</Text>
          )}
        </DescriptionListItem>
        <DescriptionListItem label={t("activity.person")}>
          {entry.actor || t("contacts:unknownPerson")}
        </DescriptionListItem>
        <DescriptionListItem label={t("activity.recordedAt")}>
          <Timestamp value={entry.recordedAt} />
        </DescriptionListItem>
        <DescriptionListItem label={t("activity.source")}>
          <ActionProvenance value={entry.provenance} detail />
        </DescriptionListItem>
      </DescriptionList>
      {entry.reason && (
        <DescriptionList>
          <DescriptionListItem label={t("activity.reason")}>
            <Reading prose={false} as="p">
              {entry.reason}
            </Reading>
          </DescriptionListItem>
        </DescriptionList>
      )}
    </Stack>
  );
};
