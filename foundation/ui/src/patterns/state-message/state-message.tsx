import type { ReactNode } from "react";

import styles from "./state-message.module.css";

/**
 * A centered message in place of content that is missing, empty, loading, or failed.
 * `page` fills a page with its own h1. `compact` sits inside a surface such as a dialog
 * or search box: its title is not a heading, a small icon replaces an illustration, and its
 * actions are quiet so the message, not the recovery, leads.
 */
export const StateMessage = ({
  title,
  description,
  illustration,
  actions,
  role,
  size = "page",
  tone = "neutral",
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A decorative illustration, or a small icon for the compact size. */
  illustration?: ReactNode;
  actions?: ReactNode;
  role?: "status";
  size?: "page" | "compact";
  /** Colors the compact icon for a failure; the text stays neutral. */
  tone?: "neutral" | "danger";
}) => {
  const Title = size === "page" ? "h1" : "p";
  return (
    <div className={styles.state} role={role} data-size={size} data-tone={tone}>
      {illustration != null && <div className={styles.illustration}>{illustration}</div>}
      <div className={styles.copy}>
        <Title className={styles.title}>{title}</Title>
        {description != null && <p className={styles.description}>{description}</p>}
      </div>
      {actions != null && (
        <div className={styles.actions} data-compact-actions={size === "compact" || undefined}>
          {actions}
        </div>
      )}
    </div>
  );
};
