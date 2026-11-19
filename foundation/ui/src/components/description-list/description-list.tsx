import type { ReactNode } from "react";

import styles from "./description-list.module.css";

/**
 * DescriptionList and DescriptionListItem present label/value pairs with native dl, dt, and dd
 * semantics. They own typography, item spacing, and wrapping. Values share a 32px minimum row, with
 * text, identities, and controls vertically centered; long content can grow. Use the default
 * stacked layout for descriptive facts and layout='rows' for compact property panels with labels
 * beside values. Rows return to stacked labels in containers narrower than 17rem. Features supply
 * labels, values, formatting, and conditional items. Use the list's className for placement and
 * responsive columns; keep surrounding panels and their accessible labels in the feature.
 */
export const DescriptionList = ({
  children,
  className = "",
  layout = "stacked",
}: {
  children: ReactNode;
  className?: string;
  /** Compact rows put labels beside values, stacking again when their container is too narrow. */
  layout?: "stacked" | "rows";
}) => (
  <dl className={`${styles.list} ${className}`} data-layout={layout}>
    {children}
  </dl>
);

export const DescriptionListItem = ({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) => (
  <div className={styles.item}>
    <dt className={styles.label}>{label}</dt>
    <dd className={styles.value}>{children}</dd>
  </div>
);
