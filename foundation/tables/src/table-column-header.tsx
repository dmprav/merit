import type { CSSProperties } from "react";

import { SortButton } from "@merit/ui/sort-button";

import styles from "./data-table.module.css";
import type { TableColumn, TableSort } from "./types";

export const TableColumnHeader = ({
  column,
  direction,
  onSort,
  top,
}: {
  column: Pick<TableColumn<unknown>, "header" | "layout">;
  direction?: NonNullable<TableSort>["direction"];
  onSort?: () => void;
  top?: CSSProperties["top"];
}) => (
  <th
    scope="col"
    style={{ width: column.layout?.width, top }}
    data-align={column.layout?.align}
    data-wrap={column.layout?.wrap}
    aria-sort={direction}
  >
    <span className={column.layout?.rowActions ? styles.visuallyHidden : styles.desktopHeader}>
      {onSort ? (
        <SortButton
          direction={direction}
          align={column.layout?.align === "end" ? "end" : "start"}
          onPress={onSort}
        >
          {column.header}
        </SortButton>
      ) : (
        column.header
      )}
    </span>
    <span className={column.layout?.rowActions ? styles.hidden : styles.mobileHeader}>
      {column.header}
    </span>
  </th>
);
