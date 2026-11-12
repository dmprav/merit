import type { ReactElement } from "react";
import {
  Tooltip as AriaTooltip,
  TooltipTrigger,
  type TooltipProps as AriaTooltipProps,
} from "react-aria-components/Tooltip";

import styles from "./tooltip.module.css";

type TooltipProps = {
  /** A focusable React Aria control with its own accessible name. */
  children: ReactElement;
  content: string;
  placement?: AriaTooltipProps["placement"];
  isDisabled?: boolean;
};

export const Tooltip = ({
  children,
  content,
  placement = "top",
  isDisabled = false,
}: TooltipProps) => (
  <TooltipTrigger delay={350} closeDelay={150} isDisabled={isDisabled}>
    {children}
    <AriaTooltip className={styles.tooltip} placement={placement} offset={6}>
      {content}
    </AriaTooltip>
  </TooltipTrigger>
);
