import type { ReactNode } from "react";

import styles from "./visually-hidden.module.css";

/**
 * Content for assistive technology only, such as a heading that names a region whose purpose is
 * already visible. Prefer visible text; use a field's isLabelHidden for field labels.
 */
export const VisuallyHidden = ({
  as: Element = "span",
  id,
  children,
}: {
  as?: "span" | "div" | "h2" | "h3";
  id?: string;
  children: ReactNode;
}) => (
  <Element id={id} className={styles.hidden}>
    {children}
  </Element>
);
