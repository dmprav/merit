import { useEffect, useState, type RefObject } from "react";
import { Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components/Tooltip";

import styles from "./tooltip.module.css";

/** The timing every hint shares, so hovering a cut-off label waits like any other. */
export const TOOLTIP_OPEN_DELAY = 350;
export const TOOLTIP_CLOSE_DELAY = 150;

const useDelayed = (value: boolean) => {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () => setDelayed(value),
      value ? TOOLTIP_OPEN_DELAY : TOOLTIP_CLOSE_DELAY,
    );
    return () => clearTimeout(timer);
  }, [value]);

  return delayed;
};

/**
 * The same tooltip for a part of a composite control whose own element already handles hover and
 * focus, such as a tab whose label is cut off. For modules inside this package. The caller reports
 * hover and keyboard focus and anchors the tooltip to the part it describes; the control keeps its
 * own full accessible name. Hover opens after the shared delay and closes after the shared delay
 * too, staying open while the pointer is over the tooltip; keyboard focus opens at once. isDismissed
 * closes it immediately, such as on Escape.
 */
export const AnchoredTooltipBase = ({
  anchorRef,
  content,
  isHovered,
  isFocused,
  isDismissed = false,
  placement = "top",
}: {
  anchorRef: RefObject<Element | null>;
  content: string;
  isHovered: boolean;
  isFocused: boolean;
  isDismissed?: boolean;
  placement?: "top" | "bottom";
}) => {
  const [isOverTooltip, setIsOverTooltip] = useState(false);
  const hoverOpen = useDelayed(isHovered || isOverTooltip);
  const isOpen = !isDismissed && (isFocused || hoverOpen);

  useEffect(() => {
    if (!isOpen) {
      setIsOverTooltip(false);
    }
  }, [isOpen]);

  return (
    <TooltipTrigger isOpen={isOpen}>
      <AriaTooltip
        className={styles.tooltip}
        triggerRef={anchorRef}
        placement={placement}
        offset={6}
        onPointerEnter={() => setIsOverTooltip(true)}
        onPointerLeave={() => setIsOverTooltip(false)}
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
};
