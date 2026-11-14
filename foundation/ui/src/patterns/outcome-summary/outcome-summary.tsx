import styles from "./outcome-summary.module.css";

/** Presentational summary pairing a stated position with a secondary detail such as an amount. */
export const OutcomeSummary = ({ title, detail }: { title: string; detail?: string }) => (
  <div className={styles.outcome}>
    <p className={styles.outcomeTitle}>{title}</p>
    {detail && <p className={styles.detail}>{detail}</p>}
  </div>
);
