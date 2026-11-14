import type { ComponentProps } from "react";

import styles from "./badge.module.css";

export const Badge = ({
  tone = "neutral",
  appearance = "badge",
  className = "",
  ...props
}: ComponentProps<"span"> & {
  tone?: "neutral" | "success" | "warning" | "danger";
  appearance?: "badge" | "plain";
}) => {
  return (
    <span
      {...props}
      data-tone={tone}
      data-appearance={appearance}
      className={`${styles.badge} ${className}`}
    />
  );
};
