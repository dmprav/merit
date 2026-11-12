import type { ReactNode } from "react";

import styles from "./page-header.module.css";

export const PageHeader = ({
  title,
  status,
  kicker,
  description,
  actions,
  density = "comfortable",
  className = "",
}: {
  title: ReactNode;
  status?: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  density?: "comfortable" | "compact";
  className?: string;
}) => (
  <header className={`${styles.header} ${className}`} data-density={density}>
    <div className={styles.context}>
      {kicker && <p className={styles.kicker}>{kicker}</p>}
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        {status}
      </div>
      {description && <div className={styles.description}>{description}</div>}
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>
);
