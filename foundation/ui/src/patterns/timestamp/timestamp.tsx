import { useFormat } from "@merit/i18n/format";

import styles from "./timestamp.module.css";

/** A local timestamp retaining its machine-readable instant. */
export const Timestamp = ({ value }: { value: string }) => {
  const { timestamp } = useFormat();
  return (
    <time className={styles.timestamp} dateTime={value}>
      {timestamp(value)}
    </time>
  );
};
