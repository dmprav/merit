import { useEffect, useState } from "react";

import { Icon } from "../../components/icon/icon";
import styles from "./status-message.module.css";

/**
 * Keep mounted so the live region exists before a message arrives. Change
 * eventId for each new event, even when its message is unchanged;
 * keep its value stable between events. Null messages clear feedback.
 * confirmation adds a four-second success confirmation; className positions it.
 * Use a persistent Notice for failures and recovery actions.
 */
export const StatusMessage = ({
  message,
  eventId,
  confirmation = false,
  className = "",
}: {
  message: string | null;
  eventId: string | number;
  confirmation?: boolean;
  className?: string;
}) => {
  const [visible, setVisible] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    setAnnouncement("");
    if (!message) {
      return;
    }

    // Separate removal and insertion so identical messages create a live-region update.
    const timer = setTimeout(() => setAnnouncement(message), 100);
    return () => clearTimeout(timer);
  }, [message, eventId]);

  useEffect(() => {
    setVisible(Boolean(message) && confirmation);
    if (!message || !confirmation) {
      return;
    }
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [message, eventId, confirmation]);

  return (
    <>
      <span role="status" aria-atomic="true" className={styles.visuallyHidden}>
        {announcement}
      </span>
      {visible && message && confirmation && (
        <span aria-hidden="true" className={`${styles.confirmation} ${className}`}>
          <Icon name="check" className={styles.successIcon} />
          {message}
        </span>
      )}
    </>
  );
};
