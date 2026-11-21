import type { ReactNode } from "react";

import { ButtonBase, type ButtonBaseProps } from "./button-base";

type ButtonProps = Pick<
  ButtonBaseProps,
  | "variant"
  | "size"
  | "iconOnly"
  | "alignment"
  | "ref"
  | "id"
  | "type"
  | "onPress"
  | "isDisabled"
  | "isPending"
  | "autoFocus"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
  | "aria-expanded"
  | "aria-pressed"
  | "aria-haspopup"
  | "aria-controls"
  | "aria-disabled"
> & {
  children: ReactNode;
};

/**
 * Quiet buttons use --button-quiet-background from their surrounding surface for hover and
 * expanded states, and --button-quiet-foreground for their text. Press and keyboard focus retain
 * the shared control treatment. The surrounding layout places a button; its variant, size, and
 * alignment are the supported presentations; small suits most actions in Merit's dense work
 * surfaces, and medium or large give a page's main action more weight. onPress covers mouse,
 * touch, and keyboard alike.
 */
export const Button = ({ size = "small", ...props }: ButtonProps) => (
  <ButtonBase {...props} size={size} />
);
