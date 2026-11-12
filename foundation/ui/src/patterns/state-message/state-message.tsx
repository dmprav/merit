import type { ReactNode } from "react";

import styles from "./state-message.module.css";

export const StateMessage = ({
  title,
  description,
  illustration,
  actions,
  role,
}: {
  title: ReactNode;
  description?: ReactNode;
  illustration?: ReactNode;
  actions?: ReactNode;
  role?: "status";
}) => (
  <div className={styles.state} role={role}>
    {illustration != null && <div className={styles.illustration}>{illustration}</div>}
    <div className={styles.copy}>
      <h1 className={styles.title}>{title}</h1>
      {description != null && <p className={styles.description}>{description}</p>}
    </div>
    {actions != null && <div className={styles.actions}>{actions}</div>}
  </div>
);
