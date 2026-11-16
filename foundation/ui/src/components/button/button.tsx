import type { Ref } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components/Button";
import { composeRenderProps } from "react-aria-components/composeRenderProps";

import { Icon } from "../icon/icon";
import styles from "./button.module.css";

type ButtonProps = AriaButtonProps & {
  variant?: "primary" | "secondary" | "quiet" | "destructive";
  size?: "small" | "medium" | "large";
  iconOnly?: boolean;
  /** Align a quiet action's content with surrounding text while retaining its padded target. */
  alignment?: "default" | "start";
  ref?: Ref<HTMLButtonElement>;
};

/**
 * Quiet buttons use --button-quiet-background from their surrounding surface for hover and
 * expanded states. Press and keyboard focus retain the shared control treatment.
 */
export const Button = ({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  alignment = "default",
  className,
  children,
  ...props
}: ButtonProps) => {
  return (
    <AriaButton
      {...props}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly || undefined}
      data-alignment={alignment === "start" ? alignment : undefined}
      className={composeRenderProps(
        className,
        (className) => `${styles.button} ${className ?? ""}`,
      )}
    >
      {composeRenderProps(children, (children, { isPending }) => (
        <>
          {isPending && <Icon name="loading" className={styles.spinner} />}
          {!(isPending && iconOnly) && children}
        </>
      ))}
    </AriaButton>
  );
};
