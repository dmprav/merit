import motion from "./motion.module.css";
import styles from "./popover.module.css";

/** The class every popover takes: the shared raised surface and its fade in and out. */
export const popoverSurface = `${styles.surface} ${motion.fadeIn} ${motion.fadeOut}`;

/** The class for a list that scrolls inside a popover. */
export const popoverScroller = styles.scroller;

/** Distance in pixels between a trigger and its popover. */
export const popoverOffset = 6;

/** Distance in pixels a popover keeps from the viewport edge. */
export const popoverContainerPadding = 16;

/** The tallest a reference popover grows, in pixels, before its body scrolls. */
export const popoverMaxHeight = 560;
