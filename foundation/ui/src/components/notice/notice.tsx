import { createElement, type ComponentProps } from "react";

import styles from "./notice.module.css";

export const Notice = ({
  as = "p",
  tone = "warning",
  className = "",
  ...props
}: ComponentProps<"div"> & {
  as?: "p" | "div" | "ul";
  tone?: "neutral" | "success" | "warning" | "danger";
}) =>
  createElement(as, { ...props, "data-tone": tone, className: `${styles.notice} ${className}` });
