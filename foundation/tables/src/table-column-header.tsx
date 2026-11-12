import type { CSSProperties } from "react";

import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";

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
        <Button className={styles.sortButton} variant="quiet" size="small" onPress={onSort}>
          <span>{column.header}</span>
          <Icon name={direction ?? "sort"} className={styles.sortIcon} />
        </Button>
      ) : (
        column.header
      )}
    </span>
    <span className={column.layout?.rowActions ? styles.hidden : styles.mobileHeader}>
      {column.header}
    </span>
  </th>
);
