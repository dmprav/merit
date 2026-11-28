import type { ReactNode } from "react";

import { IconBase, type IconName } from "../../components/icon/icon-base";
import styles from "./meta-item.module.css";

/**
 * One quiet fact beside a title or in a metadata row, such as a due date: a small icon and muted
 * text. Use it for dates, counts of time, and other metadata; use Badge only for a status, and
 * Attribution for who recorded something. The icon is decorative, so say what the fact is in the
 * text, or in visually hidden text where the icon and value make it obvious to sighted readers.
 */
export const MetaItem = ({ icon, children }: { icon: IconName; children: ReactNode }) => (
  <span className={styles.meta}>
    <IconBase name={icon} />
    {children}
  </span>
);
