import styles from "./avatar.module.css";

/** Decorative initials; pair with the person's visible name. */
export const Avatar = ({
  name,
  size = "compact",
}: {
  name: string;
  size?: "compact" | "regular";
}) => (
  <span
    className={styles.avatar}
    aria-hidden="true"
    data-size={size}
    data-initials={name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0])
      .join("")
      .toUpperCase()}
  />
);
