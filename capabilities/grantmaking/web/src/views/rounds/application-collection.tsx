import { useEffect, useRef, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { workspaceApplicationsPageSize, type ApplicationOverview } from "@merit/grantmaking/api";
import { DataTable, type TableColumn } from "@merit/tables";
import { Button } from "@merit/ui/button";
import { CollectionRecovery } from "@merit/ui/paged-content";

import type { ApplicationList } from "../../contracts/application-list";
import { ApplicationFilters } from "./application-filters";
import styles from "./applications-overview.module.css";

/** Both application worklists present an already filtered, globally sorted page. */
export const ApplicationCollection = ({
  list,
  columns,
  round,
  emptyScope,
  stickyHeader = false,
}: {
  list: ApplicationList;
  columns: TableColumn<ApplicationOverview>[];
  round?: ComponentProps<typeof ApplicationFilters>["round"];
  emptyScope: "round" | "workspace";
  stickyHeader?: boolean;
}) => {
  const { t } = useTranslation("fundingRounds");
  const { applications, pagination, query, filter, sorting } = list;
  const filtered = Boolean(query.trim()) || Object.values(filter).some(Boolean);
  const { tableStart, onPrevious, onNext, onRetry } = usePageNavigation(
    pagination,
    JSON.stringify({ round: round?.value, query, filter, sorting }),
  );
  return (
    <>
      <ApplicationFilters
        round={round}
        query={query}
        filter={filter}
        onChange={({ query, filter }) => {
          list.onQueryChange(query);
          list.onFilterChange(filter);
        }}
        summary={<OverviewSummary pagination={pagination} />}
      />
      <div ref={tableStart} tabIndex={-1} role="group" aria-label={t("applications.title")}>
        <DataTable
          data={applications}
          density="compact"
          columns={columns}
          getRowId={(row) => row.id}
          stickyHeader={stickyHeader ? { mode: "page" } : undefined}
          label={t("applications.title")}
          emptyMessage={t(
            filtered
              ? "applications.noMatches"
              : emptyScope === "round"
                ? "applications.empty"
                : "overview.empty",
          )}
          state={overviewTableState(pagination)}
          sorting={{
            manual: true,
            value: sorting,
            onChange: list.onSortingChange,
            labels: {
              by: t("applications.sortBy"),
              original: t("applications.originalOrder"),
              ascending: t("applications.ascending"),
              descending: t("applications.descending"),
            },
          }}
        />
      </div>
      <OverviewRecovery pagination={pagination} onRetry={onRetry} />
      <OverviewPagination
        pagination={pagination}
        onPrevious={onPrevious}
        onNext={onNext}
        count={applications.length}
      />
    </>
  );
};

type Pagination = ApplicationList["pagination"];

const OverviewRecovery = ({
  pagination,
  onRetry,
}: {
  pagination: Pagination;
  onRetry: () => void;
}) => {
  const { t } = useTranslation("fundingRounds");
  if (!pagination.failed && !pagination.retrying) {
    return null;
  }
  return (
    <CollectionRecovery
      message={t(pagination.loading ? "overview.loading" : "overview.failed")}
      retryLabel={t("overview.retry")}
      onRetry={onRetry}
      isPending={pagination.loading}
    />
  );
};

const overviewTableState = (pagination: Pagination) => {
  if (pagination.loading) {
    return { type: "loading" as const };
  }
  if (pagination.failed) {
    return { type: "error" as const };
  }
  return undefined;
};

const OverviewSummary = ({ pagination }: { pagination: Pagination }) => {
  const { t } = useTranslation("fundingRounds");
  if (pagination.loading && pagination.total === 0) {
    return t("overview.loading");
  }
  return t("applications.filtered", { count: pagination.matching, total: pagination.total });
};

const ownsPageFocus = (previous: Element | null) => {
  if (document.activeElement === previous) {
    return true;
  }
  // Finishing on the first/last page disables the pressed button and returns focus to body.
  return (
    document.activeElement === document.body &&
    previous instanceof HTMLButtonElement &&
    (previous.disabled || !previous.isConnected)
  );
};

const usePageNavigation = (pagination: Pagination, scope: string) => {
  const tableStart = useRef<HTMLDivElement>(null);
  const pending = useRef<{ offset: number; scope: string; focus: Element | null }>(undefined);

  const navigate = (action: () => void) => {
    pending.current = { offset: pagination.offset, scope, focus: document.activeElement };
    action();
  };

  useEffect(() => {
    const request = pending.current;
    if (!request || pagination.loading) {
      return;
    }
    if (pagination.failed || request.scope !== scope) {
      pending.current = undefined;
      return;
    }
    if (pagination.offset === request.offset) {
      return;
    }
    if (ownsPageFocus(request.focus)) {
      tableStart.current?.focus({ preventScroll: true });
      tableStart.current?.scrollIntoView({ block: "start" });
    }
    pending.current = undefined;
  }, [pagination.loading, pagination.failed, pagination.offset, scope]);
  return {
    tableStart,
    onPrevious: () => navigate(pagination.onPrevious),
    onNext: () => navigate(pagination.onNext),
    onRetry: () => navigate(pagination.onRetry),
  };
};

const OverviewPagination = ({
  pagination,
  count,
  onPrevious,
  onNext,
}: {
  pagination: Pagination;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
}) => {
  const { t } = useTranslation("fundingRounds");
  if (pagination.offset === 0 && pagination.matching <= workspaceApplicationsPageSize) {
    return null;
  }
  return (
    <div className={styles.pagination}>
      <span>
        {t("overview.range", {
          start: count ? pagination.offset + 1 : 0,
          end: pagination.offset + count,
          count: pagination.matching,
        })}
      </span>
      <div className={styles.pageActions}>
        <Button
          variant="quiet"
          size="small"
          onPress={onPrevious}
          isPending={pagination.loading}
          isDisabled={pagination.offset === 0}
        >
          {t("overview.previous")}
        </Button>
        <Button
          variant="quiet"
          size="small"
          onPress={onNext}
          isPending={pagination.loading}
          isDisabled={pagination.offset + count >= pagination.matching}
        >
          {t("overview.next")}
        </Button>
      </div>
    </div>
  );
};
