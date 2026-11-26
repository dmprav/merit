import type { Ref } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components/Button";
import { composeRenderProps } from "react-aria-components/composeRenderProps";

import { LoadingIconBase } from "../icon/loading-icon-base";
import styles from "./button.module.css";

export type ButtonBaseProps = AriaButtonProps & {
  "aria-busy"?: boolean;
  /** inline presents a command within copy, such as opening a dialog; use Link for destinations. */
  variant?: "primary" | "secondary" | "quiet" | "destructive" | "inline";
  /** One size serves product work; large is for a prominent entry point on a public page. */
  size?: "regular" | "large";
  iconOnly?: boolean;
  /**
   * start aligns a quiet action's content with surrounding text, retaining its padded target and
   * own width; end does the same at the trailing edge, for the last action in a row. fill takes the full width with the label starting at the leading edge, for a
   * choice in a list whose text may wrap.
   */
  alignment?: "default" | "start" | "end" | "fill";
  ref?: Ref<HTMLButtonElement>;
};

/**
 * The shared button for modules inside this package. A pattern's className can adapt the button to
 * the control it builds, such as a filter chip or property trigger. Features use Button.
 */
export const ButtonBase = ({
  variant = "primary",
  size = "regular",
  iconOnly = false,
  alignment = "default",
  className,
  children,
  render,
  "aria-busy": busy,
  ...props
}: ButtonBaseProps) => {
  return (
    <AriaButton
      {...props}
      // React Aria filters aria-busy from the host button. Preserve it for a locally announced action.
      render={
        busy
          ? (attributes, state) => {
              const busyAttributes = { ...attributes, "aria-busy": true };
              return render ? render(busyAttributes, state) : <button {...busyAttributes} />;
            }
          : render
      }
      data-variant={variant}
      // A command within copy takes its size from the surrounding text.
      data-size={variant !== "inline" && size === "large" ? size : undefined}
      data-icon-only={iconOnly || undefined}
      data-alignment={alignment === "default" ? undefined : alignment}
      className={composeRenderProps(
        className,
        (className) => `${styles.button} ${className ?? ""}`,
      )}
    >
      {composeRenderProps(children, (children, { isPending }) => (
        <>
          {(isPending || busy) && <LoadingIconBase />}
          {!((isPending || busy) && iconOnly) && children}
        </>
      ))}
    </AriaButton>
  );
};
