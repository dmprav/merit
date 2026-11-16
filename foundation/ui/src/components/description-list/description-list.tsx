import type { ReactNode } from "react";

import styles from "./description-list.module.css";

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
