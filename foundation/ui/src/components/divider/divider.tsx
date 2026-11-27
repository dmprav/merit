import styles from "./divider.module.css";

type DividerProps = {
  /** Subtle separates content inside a surface; edge draws the full border of a surface. */
  strength?: "subtle" | "edge";
  /** Space above and below the rule, as a space token, whatever gap the parent Stack adds. */
  spacing?: 0 | 2 | 3 | 4 | 5 | 6 | 8;
};

/**
 * A decorative rule between blocks of content, such as above a page's secondary actions. It
 * spaces itself: spacing sets the visible distance on both sides, net of the parent Stack's gap.
 * Use Stack's divided option for rules between list entries.
 */
export const Divider = ({ strength = "subtle", spacing = 6 }: DividerProps) => (
  <hr
    aria-hidden="true"
    className={styles.divider}
    data-strength={strength}
    data-spacing={spacing}
  />
);
