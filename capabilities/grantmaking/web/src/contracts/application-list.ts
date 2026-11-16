import type {
  ApplicationFilter,
  ApplicationOverview,
  WorkspaceApplicationsInput,
  WorkspaceApplicationsPage,
} from "@merit/grantmaking/api";
import type { TableSort } from "@merit/tables/contracts";

export type ApplicationListResult =
  | ({ status: "ok" } & WorkspaceApplicationsPage)
  | {
      status: "not_found" | "workspace_not_found" | "signed_out" | "unavailable";
    };

export type ApplicationListSource = {
  scope: (workspaceSlug: string) => readonly unknown[];
  read: (input: WorkspaceApplicationsInput, signal?: AbortSignal) => Promise<ApplicationListResult>;
};

export type ApplicationListOptions = {
  /** Preference identity within the workspace, independent of the selected filters. */
  viewId: string;
  roundId?: string;
  /** Omit to retain sorting in this view's account-session preferences. */
  sorting?: { value: TableSort; onChange: (value: TableSort) => void };
  enabled?: boolean;
};

export type ApplicationList = {
  applications: readonly ApplicationOverview[];
  query: string;
  onQueryChange: (value: string) => void;
  filter: ApplicationFilter;
  onFilterChange: (value: ApplicationFilter) => void;
  sorting: TableSort;
  onSortingChange: (value: TableSort) => void;
  pagination: {
    total: number;
    matching: number;
    offset: number;
    loading: boolean;
    failed: boolean;
    retrying: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onRetry: () => void;
  };
};
