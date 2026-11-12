import type { ComponentProps } from "react";

import styles from "./badge.module.css";

export const Badge = ({
  tone = "neutral",
  className = "",
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "success" | "warning" | "danger" }) => {
  return <span {...props} data-tone={tone} className={`${styles.badge} ${className}`} />;
};
