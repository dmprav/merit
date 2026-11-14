import { createElement, type ComponentProps, type ReactNode } from "react";

import { Icon } from "../icon/icon";
import styles from "./notice.module.css";

export const Notice = ({
  as = "p",
  tone = "warning",
  appearance = "default",
  className = "",
  title,
  actions,
  children,
  ...props
}: ComponentProps<"div"> & {
  as?: "p" | "div" | "ul";
  tone?: "neutral" | "success" | "warning" | "danger";
  /** Quiet icon-and-text feedback within an existing task surface. */
  appearance?: "default" | "inline";
  title?: string;
  actions?: ReactNode;
}) => {
  const structured = title || actions || appearance === "inline";
  const icon = {
    danger: "warning",
    warning: "warning",
    success: "check",
    neutral: "info",
  } as const;

  return createElement(
    structured ? "div" : as,
    {
      ...props,
      "data-tone": tone,
      "data-appearance": appearance,
      className: `${styles.notice} ${className}`,
    },
    structured ? (
      <div className={styles.layout}>
        {appearance === "inline" && <Icon className={styles.icon} name={icon[tone]} />}
        <div className={styles.message}>
          {title && <p className={styles.title}>{title}</p>}
          <div>{children}</div>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    ) : (
      children
    ),
  );
};
