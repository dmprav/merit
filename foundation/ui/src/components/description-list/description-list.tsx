import type { ReactNode } from "react";

import styles from "./description-list.module.css";

/**
 * DescriptionList and DescriptionListItem present label/value pairs with native dl, dt, and dd
 * semantics. They own typography, item spacing, and wrapping. Each value sits close to its own label
 * and has no minimum height; a control that needs one brings it. Choose the layout by
 * how people read the facts:
 *
 * - stacked: descriptive facts, labels above values.
 * - rows: compact property panels, labels beside values in a fixed column; rows stack again in containers narrower
 *   than 17rem.
 * - columns: a short summary of separate facts, side by side where there is room.
 * - figures: amounts to compare, with values aligned at the end in tabular figures.
 *
 * divided rules off each item, for a record people edit row by row. Features supply labels,
 * values, formatting, and conditional items, and keep the list's width and surrounding panels.
 */
export const DescriptionList = ({
  children,
  layout = "stacked",
  divided = false,
}: {
  children: ReactNode;
  layout?: "stacked" | "rows" | "columns" | "figures";
  divided?: boolean;
}) => (
  <dl className={styles.list} data-layout={layout} data-divided={divided || undefined}>
    {children}
  </dl>
);

export const DescriptionListItem = ({
  label,
  labelId,
  children,
}: {
  label: ReactNode;
  /** Names the label so a control in the value can refer to it. */
  labelId?: string;
  children: ReactNode;
}) => (
  <div className={styles.item}>
    <dt id={labelId} className={styles.label}>
      {label}
    </dt>
    <dd className={styles.value}>{children}</dd>
  </div>
);
