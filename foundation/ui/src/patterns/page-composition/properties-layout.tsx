import type { ReactNode } from "react";

import styles from "./properties-layout.module.css";

/**
 * A record's main work beside a panel of its properties, such as a funding round's purpose and
 * budget. On narrower screens the panel moves before the work, or after it when the work is a
 * long collection people came to scan; a rule separates them in either arrangement. In a
 * contained page either one may scroll, depending on width, so each carries a stable scroll
 * restoration id: the router returns to a record's position and opens another at the top.
 */
export const PropertiesLayout = ({
  children,
  properties,
  propertiesLabel,
  stackedPlacement = "before",
}: {
  children: ReactNode;
  properties: ReactNode;
  propertiesLabel: string;
  stackedPlacement?: "before" | "after";
}) => {
  // Keep the panel mounted when changing sections moves it across the main content.
  const panel = (
    <aside
      key="properties"
      className={styles.properties}
      aria-label={propertiesLabel}
      data-scroll-restoration-id="properties"
    >
      {properties}
    </aside>
  );
  return (
    <div
      className={styles.layout}
      data-stacked-placement={stackedPlacement}
      data-scroll-restoration-id="properties-layout"
    >
      {stackedPlacement === "before" && panel}
      <div className={styles.main}>{children}</div>
      {stackedPlacement === "after" && panel}
    </div>
  );
};
