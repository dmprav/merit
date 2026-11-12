import type { ReactNode } from "react";

import styles from "./description-list.module.css";

export const DescriptionList = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => <dl className={`${styles.list} ${className}`}>{children}</dl>;

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
