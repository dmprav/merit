import { createElement, type AriaRole, type ReactNode } from "react";

import styles from "./layout.module.css";

/** Semantics a caller can give the flow; the primitive owns its own presentation. */
type FlowProps = {
  children?: ReactNode;
  id?: string;
  role?: AriaRole;
  hidden?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

type LayoutProps = FlowProps & {
  as?: "div" | "section" | "article" | "ul" | "ol" | "dl";
  /**
   * A step in the shared spacing scale, applied between direct children. 0 suits children that
   * carry their own padding, such as whole-row links.
   */
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
};

type StackProps = LayoutProps & {
  /**
   * Rule off direct children, such as entries in a record list: between puts a rule centered in
   * each gap, after also ends the last entry with one, and around also opens the list with one.
   */
  divided?: "between" | "after" | "around";
};

type InlineProps = LayoutProps & {
  align?: "start" | "center" | "baseline" | "end";
  justify?: "start" | "end" | "between";
};

/** Vertical flow. The caller owns landmarks, headings, and list items. */
export const Stack = ({ as = "div", gap = 4, divided, ...props }: StackProps) =>
  createElement(as, {
    ...props,
    "data-gap": gap,
    "data-divided": divided,
    className: styles.stack,
  });

/** Horizontal flow that wraps in DOM order; alignment applies to each wrapped line. */
export const Inline = ({
  as = "div",
  gap = 2,
  align = "center",
  justify = "start",
  ...props
}: InlineProps) =>
  createElement(as, {
    ...props,
    "data-gap": gap,
    "data-align": align,
    "data-justify": justify,
    className: styles.inline,
  });

/**
 * Constrain prose without narrowing surrounding controls or comparison columns. Reading keeps the
 * line breaks of text people wrote and wraps long unbroken values. It uses reading typography
 * unless prose is false, for prose that sits within a compact summary.
 */
export const Reading = ({
  as = "div",
  prose = true,
  ...props
}: FlowProps & {
  as?: "div" | "section" | "article" | "p";
  prose?: boolean;
}) =>
  createElement(as, {
    ...props,
    "data-prose": prose || undefined,
    className: styles.reading,
  });
