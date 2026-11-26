import { useEffect, useState, type RefObject } from "react";
import { Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components/Tooltip";

import styles from "./tooltip.module.css";

// The same timing as Tooltip, so hovering a cut-off label waits like any other hint.
const OPEN_DELAY = 350;
const CLOSE_DELAY = 150;

const useDelayed = (value: boolean) => {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDelayed(value), value ? OPEN_DELAY : CLOSE_DELAY);
    return () => clearTimeout(timer);
  }, [value]);

  return delayed;
};

/**
 * The same tooltip for a part of a composite control whose own element already handles hover and
 * focus, such as a tab whose label is cut off. For modules inside this package. The caller reports
 * hover and keyboard focus and anchors the tooltip to the part it describes; the control keeps its
 * own full accessible name. Hover opens after the shared delay; keyboard focus opens at once.
 */
export const AnchoredTooltipBase = ({
  anchorRef,
  content,
  isHovered,
  isFocused,
  placement = "top",
}: {
  anchorRef: RefObject<Element | null>;
  content: string;
  isHovered: boolean;
  isFocused: boolean;
  placement?: "top" | "bottom";
}) => {
  const hoverOpen = useDelayed(isHovered);

  return (
    <TooltipTrigger isOpen={isFocused || (isHovered && hoverOpen)}>
      <AriaTooltip
        className={styles.tooltip}
        triggerRef={anchorRef}
        placement={placement}
        offset={6}
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
};
