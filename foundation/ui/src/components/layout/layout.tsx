import { createElement, type HTMLAttributes } from "react";

import styles from "./layout.module.css";

type LayoutProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "ul" | "ol";
  /** A step in the shared spacing scale, applied between direct children. */
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
};

type InlineProps = LayoutProps & {
  align?: "start" | "center" | "baseline";
  justify?: "start" | "end" | "between";
};

/** Vertical flow. The caller owns landmarks, headings, and list items. */
export const Stack = ({ as = "div", gap = 4, className = "", style, ...props }: LayoutProps) =>
  createElement(as, {
    ...props,
    className: `${styles.stack} ${className}`,
    style: { gap: `var(--space-${gap})`, ...style },
  });

/** Horizontal flow that wraps in DOM order; alignment applies to each wrapped line. */
export const Inline = ({
  as = "div",
  gap = 2,
  align = "center",
  justify = "start",
  className = "",
  style,
  ...props
}: InlineProps) =>
  createElement(as, {
    ...props,
    "data-align": align,
    "data-justify": justify,
    className: `${styles.inline} ${className}`,
    style: { gap: `var(--space-${gap})`, ...style },
  });

/** Constrain prose without narrowing surrounding controls or comparison columns. */
export const Reading = ({
  as = "div",
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article" | "p" }) =>
  createElement(as, { ...props, className: `${styles.reading} ${className}` });
