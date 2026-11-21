import styles from "./divider.module.css";

/**
 * A decorative rule between blocks of content, such as above a page's secondary actions. Layout
 * spaces it from its neighbours. Use Stack's divided option for rules between list entries, and
 * emphasis for the one rule that marks the current or recorded side of a comparison.
 */
export const Divider = ({ tone = "default" }: { tone?: "default" | "emphasis" }) => (
  <hr aria-hidden="true" className={styles.divider} data-tone={tone} />
);
