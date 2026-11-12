import type { ReactNode } from "react";

type ColumnLayout = {
  /** Preferred CSS width. Omit on the main text column to use remaining space. */
  width?: string;
  align?: "end";
  /** Keep short values on one line on desktop; mobile content always wraps. */
  wrap?: boolean;
  /** Marks the column containing the row's primary native link; does not make the row clickable. */
  primary?: boolean;
  /** Hide the visible heading and place row actions beside the first cell on mobile. */
  rowActions?: boolean;
};

/** Flat columns with unique IDs and text headings. */
export type TableColumn<T> = {
  id: string;
  header: string;
  /** Render the record's content. Return a component for cells that use hooks. */
  cell: (record: T) => ReactNode;
  layout?: ColumnLayout;
  /** Omit for display-only columns. Comparisons use records, never formatted labels. */
  sort?: {
    /** The value being ordered; null and undefined sort last in either direction. */
    value: (record: T) => unknown;
    /** Compare two records in ascending order. Called only when both values are present. */
    compare: (left: T, right: T) => number;
  };
};

/** One column and direction, or null to preserve source order. */
export type TableSort = { columnId: string; direction: "ascending" | "descending" } | null;

export type TableSorting = {
  value: TableSort;
  /** Receives the next selection, including null when sorting is cleared. */
  onChange: (value: TableSort) => void;
  labels: { by: string; original: string; ascending: string; descending: string };
};

export type TableState = { type: "loading" | "error"; message: string };
