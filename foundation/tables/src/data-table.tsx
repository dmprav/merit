import {
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import type { CSSProperties, ReactNode } from "react";

import styles from "./data-table.module.css";
import { MobileSortControl } from "./mobile-sort-control";
import { TableColumnHeader } from "./table-column-header";
import type { TableColumn, TableSorting, TableState } from "./types";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

type StickyHeader =
  | { mode: "page"; top?: CSSProperties["top"] }
  | { mode: "table"; maxHeight: CSSProperties["maxHeight"] };

const TableScrollArea = ({
  stickyHeader,
  label,
  children,
}: {
  stickyHeader?: StickyHeader;
  label: string;
  children: ReactNode;
}) => (
  <div
    className={styles.scrollArea}
    data-scroll={stickyHeader?.mode}
    style={stickyHeader?.mode === "table" ? { maxHeight: stickyHeader.maxHeight } : undefined}
    role={stickyHeader?.mode === "table" ? "region" : undefined}
    aria-label={stickyHeader?.mode === "table" ? label : undefined}
    tabIndex={stickyHeader?.mode === "table" ? 0 : undefined}
  >
    {children}
  </div>
);

type DataTableProps<T extends object> = {
  /** Desktop row spacing. Mobile keeps room for touch interaction. */
  density?: "comfortable" | "compact";
  /**
   * Page mode requires columns that fit and ancestors that permit page scrolling;
   * top offsets the header below fixed navigation (default zero). Table mode owns
   * both scroll axes in a named, focusable region. Stacked layouts disable stickiness.
   */
  stickyHeader?: StickyHeader;
  data: readonly T[];
  columns: readonly TableColumn<T>[];
  getRowId: (row: T) => string;
  label: string;
  emptyMessage: string;
  state?: TableState;
  sorting?: TableSorting;
};

/**
 * Renders a complete, already-loaded collection with stable, unique row IDs.
 * Supply sorting to enable controlled single-column ordering. Missing values sort
 * last in either direction; clearing sorting restores source order without mutation.
 * A selection for an absent or display-only column uses source order until valid again.
 * State messages are informational; callers own loading, recovery and toolbar
 * actions. Keep data during refresh or recoverable errors. Use emptyMessage for
 * both an empty collection and no matching results. Mark at most one column as
 * primary and render a real link in its cell to preserve native navigation.
 */
export const DataTable = <T extends object>({
  data,
  columns,
  getRowId,
  label,
  emptyMessage,
  state,
  sorting,
  density = "comfortable",
  stickyHeader,
}: DataTableProps<T>) => {
  const sortableColumns = columns.filter((column) => column.sort);
  const activeSort = sortableColumns.some((column) => column.id === sorting?.value?.columnId)
    ? (sorting?.value ?? null)
    : null;
  const tableSorting: SortingState = activeSort
    ? [{ id: activeSort.columnId, desc: activeSort.direction === "descending" }]
    : [];
  const tableColumns: ColumnDef<typeof features, T>[] = columns.map(({ id, sort }) => ({
    id,
    accessorFn: sort ? (record) => sort.value(record) ?? undefined : undefined,
    sortFn: sort ? (left, right) => sort.compare(left.original, right.original) : undefined,
    enableSorting: Boolean(sorting && sort),
  }));
  const table = useTable({
    features,
    data,
    columns: tableColumns,
    getRowId,
    state: { sorting: tableSorting },
    onSortingChange: (update) => {
      const next = (typeof update === "function" ? update(tableSorting) : update)[0];
      sorting?.onChange(
        next ? { columnId: next.id, direction: next.desc ? "descending" : "ascending" } : null,
      );
    },
    enableMultiSort: false,
    defaultColumn: { sortDescFirst: false, sortUndefined: "last" },
  });

  return (
    <div className={styles.container}>
      {state && (
        <p className={styles.message} role={state.type === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      )}
      {data.length > 0 && sortableColumns.length > 0 && sorting && (
        <MobileSortControl columns={sortableColumns} {...sorting} value={activeSort} />
      )}
      <TableScrollArea stickyHeader={stickyHeader} label={label}>
        <table
          className={styles.table}
          data-density={density}
          data-sticky={stickyHeader ? true : undefined}
          aria-label={label}
          aria-busy={state?.type === "loading" || undefined}
        >
          <thead>
            <tr>
              {columns.map((column) => (
                <TableColumnHeader
                  key={column.id}
                  column={column}
                  direction={activeSort?.columnId === column.id ? activeSort.direction : undefined}
                  top={stickyHeader?.mode === "page" ? stickyHeader.top : undefined}
                  onSort={
                    data.length > 0 && sorting && column.sort
                      ? () => table.getColumn(column.id)?.toggleSorting()
                      : undefined
                  }
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {!state && data.length === 0 && (
              <tr className={styles.emptyRow}>
                <td className={styles.emptyCell} colSpan={columns.length}>
                  <p className={styles.message} role="status">
                    {emptyMessage}
                  </p>
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column, index) => (
                  <TableCell key={column.id} column={column} index={index} record={row.original} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollArea>
    </div>
  );
};

const TableCell = <T extends object>({
  column,
  index,
  record,
}: {
  column: TableColumn<T>;
  index: number;
  record: T;
}) => (
  <td
    data-align={column.layout?.align}
    data-wrap={column.layout?.wrap}
    data-primary={column.layout?.primary || undefined}
    data-identity={index === 0 || undefined}
    data-row-actions={column.layout?.rowActions || undefined}
  >
    {index > 0 && !column.layout?.rowActions && (
      <span className={styles.mobileLabel} aria-hidden="true">
        {column.header}
      </span>
    )}
    <div className={styles.cellContent}>{column.cell(record)}</div>
  </td>
);
