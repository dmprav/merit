import { IconBase, type IconName } from "../icon/icon-base";
import styles from "./avatar.module.css";

/**
 * Decorative initials, or a dashed outline when no person is selected. An icon stands for
 * something that is not a person, such as Merit AI, so it cannot read as one. Pair with visible
 * text.
 */
export const Avatar = ({
  name,
  icon,
  size = "compact",
}: {
  name?: string;
  /** A glyph in place of initials for an author that is not a person. */
  icon?: IconName;
  size?: "compact" | "regular";
}) => (
  <span
    className={styles.avatar}
    aria-hidden="true"
    data-size={size}
    data-empty={(!name && !icon) || undefined}
    data-icon={icon ? "" : undefined}
    data-initials={(icon ? undefined : name)
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0])
      .join("")
      .toUpperCase()}
  >
    {icon && <IconBase name={icon} />}
  </span>
);
