import type { ReactNode } from "react";

import styles from "./badge.module.css";

/**
 * Badge presents short, read-only status or metadata beside the item it describes. Use neutral for
 * routine states, success for confirmed positive outcomes, warning for something needing attention,
 * and danger for failure. Keep funding judgments neutral: a recommendation to fund is not a
 * successful system action. The visible label carries the meaning without color. Use
 * appearance=plain with a decorative icon for a quiet status column; reserve the filled badge for
 * compact metadata that needs a distinct shape. Labels wrap when space or enlarged text requires
 * it. Use a button or link for an action, and Notice for an explanation or recovery step.
 */
export const Badge = ({
  tone = "neutral",
  appearance = "badge",
  children,
  lang,
}: {
  children: ReactNode;
  /** The label's language when it differs from the surrounding text. */
  lang?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  appearance?: "badge" | "plain";
}) => {
  return (
    <span lang={lang} data-tone={tone} data-appearance={appearance} className={styles.badge}>
      {children}
    </span>
  );
};
