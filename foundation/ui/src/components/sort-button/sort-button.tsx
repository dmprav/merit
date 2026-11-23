import type { ReactNode } from "react";

import { ButtonBase } from "../button/button-base";
import { IconBase } from "../icon/icon-base";
import styles from "./sort-button.module.css";

/**
 * A column heading that orders its collection. It keeps the heading's typography, shows the current
 * direction, and reveals a sort cue on hover and keyboard focus for unsorted columns. The table
 * owns aria-sort on its header cell and the order itself.
 */
export const SortButton = ({
  children,
  direction,
  align = "start",
  onPress,
}: {
  children: ReactNode;
  direction?: "ascending" | "descending";
  /** end places the cue before the heading for end-aligned columns. */
  align?: "start" | "end";
  onPress: () => void;
}) => (
  <ButtonBase
    variant="quiet"
    className={styles.sortButton}
    data-direction={direction}
    data-align={align}
    onPress={onPress}
  >
    <span className={styles.label}>{children}</span>
    <IconBase name={direction ?? "sort"} className={styles.icon} />
  </ButtonBase>
);
