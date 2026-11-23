import type { ComponentProps } from "react";

import styles from "./link.module.css";

/**
 * Router adapters, such as TanStack Router's createLink, supply navigation and preloading through
 * the click, hover, focus, and touch handlers; features supply the destination and its name.
 */
type LinkProps = Pick<
  ComponentProps<"a">,
  | "children"
  | "href"
  | "target"
  | "rel"
  | "download"
  | "hrefLang"
  | "ref"
  | "id"
  | "onClick"
  | "onFocus"
  | "onBlur"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onTouchStart"
  | "aria-label"
  | "aria-current"
  | "aria-describedby"
> & {
  /**
   * inline underlines a destination within prose; standalone adds a control-sized target for a
   * separate destination; row makes a whole list row the destination, with its title and
   * supporting lines stacked. primary, secondary, and quiet match the adjacent buttons.
   */
  variant?: "inline" | "standalone" | "row" | "primary" | "secondary" | "quiet";
  /** Button-shaped links only: large for a prominent entry point on a public page. */
  size?: "regular" | "large";
};

/**
 * Use Link for destinations: native anchors directly, and router links through the router's
 * adapter, such as TanStack Router's createLink. Links share Button's hover, press, and focus
 * treatments. Keep labels specific to their destination and announce when a link opens a new tab.
 */
export const Link = ({ variant = "inline", size = "regular", children, ...props }: LinkProps) => {
  if (variant === "row") {
    return (
      <a {...props} className={styles.row}>
        {children}
      </a>
    );
  }

  if (variant === "inline" || variant === "standalone") {
    return (
      <a
        {...props}
        className={variant === "standalone" ? `${styles.text} ${styles.standalone}` : styles.text}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      {...props}
      className={styles.button}
      data-variant={variant}
      data-size={size === "large" ? size : undefined}
    >
      {children}
    </a>
  );
};
