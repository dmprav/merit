import { IconBase } from "./icon-base";
import styles from "./icon.module.css";

/**
 * The shared spinner for modules inside this package. Features use LoadingIcon.
 * It turns steadily and holds still for people who ask
 * for reduced motion. It is hidden from assistive technology, so say what is loading in text;
 * className places it within the control that owns it.
 */
export const LoadingIconBase = ({ className }: { className?: string }) => (
  <IconBase name="loading" className={`${styles.spinning} ${className ?? ""}`} />
);
