import type { ReactNode } from "react";

import styles from "./count.module.css";

/**
 * Count shows how many items a tab, heading, or disclosure holds, in one small chip: caption size,
 * tabular numerals, muted background. Put it after the label and a space, so the label and the
 * number stay separate words in the accessible name. Use the warning tone only for a count that
 * needs attention and say why in `title`; also state the reason in text, since hover is not
 * available everywhere. Use Badge for a status and MetaItem for other metadata.
 */
export const Count = ({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "warning";
  /** Explains a warning count on hover. */
  title?: string;
}) => (
  <span className={styles.count} data-tone={tone} title={title}>
    {children}
  </span>
);
