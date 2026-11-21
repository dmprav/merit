import type { Ref } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components/Button";
import { composeRenderProps } from "react-aria-components/composeRenderProps";

import { IconBase } from "../icon/icon-base";
import styles from "./button.module.css";

export type ButtonBaseProps = AriaButtonProps & {
  "aria-busy"?: boolean;
  /** inline presents a command within copy, such as opening a dialog; use Link for destinations. */
  variant?: "primary" | "secondary" | "quiet" | "destructive" | "inline";
  size?: "small" | "medium" | "large";
  iconOnly?: boolean;
  /** Align a quiet action's content with surrounding text, retaining its padded target and own width. */
  alignment?: "default" | "start";
  ref?: Ref<HTMLButtonElement>;
};

/**
 * The shared button for modules inside this package. A pattern's className can adapt the button to
 * the control it builds, such as a filter chip or property trigger. Features use Button.
 */
export const ButtonBase = ({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  alignment = "default",
  className,
  children,
  ...props
}: ButtonBaseProps) => {
  const busy = props["aria-busy"] === true;
  return (
    <AriaButton
      {...props}
      data-variant={variant}
      // A command within copy takes its size from the surrounding text.
      data-size={variant === "inline" ? undefined : size}
      data-icon-only={iconOnly || undefined}
      data-alignment={alignment === "start" ? alignment : undefined}
      className={composeRenderProps(
        className,
        (className) => `${styles.button} ${className ?? ""}`,
      )}
    >
      {composeRenderProps(children, (children, { isPending }) => (
        <>
          {(isPending || busy) && <IconBase name="loading" className={styles.spinner} />}
          {!((isPending || busy) && iconOnly) && children}
        </>
      ))}
    </AriaButton>
  );
};
