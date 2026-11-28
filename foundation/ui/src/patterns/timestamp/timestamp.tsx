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

/**
 * A calendar date, such as a due date, retaining its machine-readable value. Use it for a date
 * shown as metadata; a date inside a sentence stays part of the sentence.
 */
export const CalendarDate = ({ value }: { value: string }) => {
  const { calendarDate } = useFormat();

  return (
    <time className={styles.timestamp} dateTime={value}>
      {calendarDate(value)}
    </time>
  );
};
