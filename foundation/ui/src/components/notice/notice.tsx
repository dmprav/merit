import type { ComponentProps, ReactNode } from "react";

import { Icon } from "../icon/icon";
import styles from "./notice.module.css";

const icons = {
  danger: "warning",
  warning: "warning",
  success: "check",
  neutral: "info",
} as const;

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
