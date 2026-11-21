import type { ReactNode } from "react";

import styles from "./page-header.module.css";

/**
 * The page's title, context, and its one main action. Put further commands in an icon-only
 * "More actions" menu beside it; Storybook rejects a second labelled action.
 */
export const PageHeader = ({
  title,
  status,
  kicker,
  description,
  actions,
  density = "comfortable",
}: {
  title: ReactNode;
  status?: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  density?: "comfortable" | "compact";
}) => (
  <header className={styles.header} data-density={density}>
    <div className={styles.context}>
      {kicker && <p className={styles.kicker}>{kicker}</p>}
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        {status}
      </div>
      {description && <div className={styles.description}>{description}</div>}
    </div>
    {actions && (
      <div className={styles.actions} data-page-actions>
        {actions}
      </div>
    )}
  </header>
);
