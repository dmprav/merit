import type { ComponentProps } from "react";
import {
  Tooltip as AriaTooltip,
  TooltipTrigger,
  Focusable,
  type TooltipProps as AriaTooltipProps,
} from "react-aria-components/Tooltip";

import styles from "./tooltip.module.css";

type TooltipProps = {
  /** A focusable React Aria control with its own accessible name. */
  children: ComponentProps<typeof Focusable>["children"];
  content: string;
  placement?: AriaTooltipProps["placement"];
  isDisabled?: boolean;
  /** Connect a real DOM link or a ref-forwarding router link to the tooltip. */
  customTrigger?: boolean;
};

export const Tooltip = ({
  children,
  content,
  placement = "top",
  isDisabled = false,
  customTrigger = false,
}: TooltipProps) => (
  <TooltipTrigger delay={350} closeDelay={150} isDisabled={isDisabled}>
    {customTrigger ? <Focusable>{children}</Focusable> : children}
    <AriaTooltip className={styles.tooltip} placement={placement} offset={6}>
      {content}
    </AriaTooltip>
  </TooltipTrigger>
);
