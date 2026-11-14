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
}) =>
  createElement(
    title || actions || appearance === "inline" ? "div" : as,
    {
      ...props,
      "data-tone": tone,
      "data-appearance": appearance,
      className: `${styles.notice} ${className}`,
    },
    title || actions || appearance === "inline" ? (
      <div className={styles.layout}>
        {appearance === "inline" && (
          <Icon
            className={styles.icon}
            name={
              tone === "danger" || tone === "warning"
                ? "warning"
                : tone === "success"
                  ? "check"
                  : "info"
            }
          />
        )}
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
