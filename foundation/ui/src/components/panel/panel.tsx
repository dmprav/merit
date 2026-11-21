import { createElement, type ReactNode } from "react";

import styles from "./panel.module.css";

/**
 * A bordered region that groups related content or fields apart from the page around it, such as
 * one criterion's fields or a reviewer's invitation. As a fieldset, its legend sits on the border.
 * padding is a step in the shared spacing scale; arrange the content inside with Stack.
 */
export const Panel = ({
  as = "div",
  padding = 4,
  children,
  ...props
}: {
  as?: "div" | "section" | "fieldset";
  padding?: 4 | 5 | 6;
  children: ReactNode;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) => createElement(as, { ...props, className: styles.panel, "data-padding": padding }, children);
