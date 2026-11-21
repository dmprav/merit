import { useEffect, useState } from "react";

import styles from "./status-message.module.css";

/**
 * Announce an update to assistive technology without showing it, such as a reordered list or
 * a loaded demo. Keep mounted so the live region exists before a message arrives. Change
 * eventId for each new event, even when its message is unchanged; keep its value stable between
 * events. Null messages clear the announcement. Use showToast for a visible outcome.
 */
export const StatusMessage = ({
  message,
  eventId,
}: {
  message: string | null;
  eventId: string | number;
}) => {
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

  return (
    <span role="status" aria-atomic="true" className={styles.visuallyHidden}>
      {announcement}
    </span>
  );
};
