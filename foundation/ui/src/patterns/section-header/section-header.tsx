import type { ReactNode } from "react";

import { Inline } from "../../components/layout/layout";
import styles from "./section-header.module.css";

export const SectionHeader = ({
  title,
  id,
  count,
  aside,
  className = "",
}: {
  title: ReactNode;
  id?: string;
  count?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) => (
  <Inline gap={3} justify="between" className={`${styles.header} ${className}`}>
    <h2 id={id} className={styles.title}>
      {title}
      {count != null && <span className={styles.count}> {count}</span>}
    </h2>
    {aside}
  </Inline>
);
