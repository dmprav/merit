import type { ComponentProps, ReactNode } from "react";

import { Icon } from "../icon/icon";
import styles from "./notice.module.css";

const icons = {
  danger: "warning",
  warning: "warning",
  success: "check",
  neutral: "info",
} as const;

/**
 * Notice provides persistent feedback beside the work it concerns. Choose neutral for information,
 * success for a completed action, warning for something needing attention, and danger for a
 * failure. Every notice states its tone. State the meaning and next step in text; color is
 * supplementary. Keep short messages to one sentence. Every tone shows an icon. By default the
 * message sits on a light tinted surface so it stands apart from nearby content; use
 * appearance=inline for quiet icon-and-text feedback inside a task surface. Use title and actions
 * for structured recovery feedback, as="div" for paragraphs, or as="ul" for a list. Notice spaces
 * direct blocks; use Inline for a wrapping action group. Tone controls appearance only: callers
 * choose role and aria-live when an update needs announcing. Use StatusMessage for transient
 * confirmations.
 */
export const Notice = ({
  as = "p",
  tone,
  appearance = "default",
  className = "",
  title,
  actions,
  children,
  "aria-label": label,
  ...props
}: ComponentProps<"div"> & {
  /** Element for the message: a sentence, paragraphs, or a list. */
  as?: "p" | "div" | "ul";
  tone: "neutral" | "success" | "warning" | "danger";
  /** Quiet icon-and-text feedback within an existing task surface. */
  appearance?: "default" | "inline";
  title?: string;
  actions?: ReactNode;
}) => {
  const Content = as;

  return (
    <div
      {...props}
      aria-label={as === "ul" ? undefined : label}
      data-tone={tone}
      data-appearance={appearance}
      className={`${styles.notice} ${className}`}
    >
      <Icon className={styles.icon} name={icons[tone]} />
      <div className={styles.body}>
        <div className={styles.message}>
          {title && <p className={styles.title}>{title}</p>}
          <Content className={styles.content} aria-label={as === "ul" ? label : undefined}>
            {children}
          </Content>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
};
