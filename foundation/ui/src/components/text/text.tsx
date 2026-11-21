import { createElement, type ReactNode } from "react";

import styles from "./text.module.css";

/**
 * Text gives a run of copy one of the shared text roles; everything else inherits from its
 * surroundings. supporting is secondary information, such as a description or the line under a
 * title. caption is a small note, such as a hint near a form or a count. missing marks a value or
 * list that has nothing to show yet. emphasis lifts a figure or name within a line, and attention
 * marks a figure that needs a decision, such as an amount over budget; state its meaning in words
 * too. Headings, labels, attribution, and status belong to SectionHeader, DescriptionList,
 * Attribution, Notice, and their peers.
 */
export const Text = ({
  as = "span",
  variant,
  id,
  children,
}: {
  as?: "span" | "p" | "div" | "strong" | "small" | "dd" | "li" | "summary" | "legend";
  variant: "supporting" | "caption" | "missing" | "emphasis" | "attention";
  id?: string;
  children: ReactNode;
}) => createElement(as, { id, className: styles.text, "data-variant": variant }, children);
