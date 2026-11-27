import { useEffect, useState, type RefObject } from "react";
import { Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components/Tooltip";

import { popoverOffset, popoverSurface } from "../../foundations/popover";
import styles from "./tooltip.module.css";

/** The timing every hint shares, so hovering a cut-off label waits like any other. */
export const TOOLTIP_OPEN_DELAY = 350;
export const TOOLTIP_CLOSE_DELAY = 150;

/** Whether `target` sits in a dialog or menu that does not also hold the tooltip's trigger. */
export const isInExternalOverlay = (target: Element | null, trigger: Element | null) => {
  const overlay = target?.closest('dialog, [role="dialog"], [role="menu"]');
  return Boolean(overlay && trigger && !overlay.contains(trigger));
};

/** Follows a flag after the shared open or close delay, so hover never flickers a hint. */
export const useDelayed = (value: boolean) => {
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
 * too, staying open while the pointer is over the tooltip; keyboard focus opens at once. Escape
 * dismisses it immediately for as long as it was open, wherever the pointer or focus is. Focus
 * moving into a dialog or menu that does not hold the anchor dismisses it too, so it never takes
 * that overlay's Escape.
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
  const [isOverTooltip, setIsOverTooltip] = useState(false);
  const hoverOpen = useDelayed(isHovered || isOverTooltip);
  const [isDismissed, setIsDismissed] = useState(false);
  // The pointer can only be over the tooltip while it shows, so it keeps the tooltip open through
  // a handoff from focus or hover, whatever the delayed hover state says.
  const wanted = isFocused || hoverOpen || isOverTooltip;
  const isOpen = !isDismissed && wanted;

  useEffect(() => {
    if (!isOpen) {
      setIsOverTooltip(false);
    }
  }, [isOpen]);

  // The dismissal lasts until the tooltip would close anyway, then resets for the next time.
  useEffect(() => {
    if (!wanted) {
      setIsDismissed(false);
    }
  }, [wanted]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const anchor = anchorRef.current;
    // Another dialog or menu has taken over; the hint has done its job.
    if (isInExternalOverlay(document.activeElement, anchor)) {
      setIsDismissed(true);
      return;
    }

    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element && isInExternalOverlay(event.target, anchor)) {
        setIsDismissed(true);
      }
    };

    // Escape closes only the tooltip: it is caught first, so a dialog or menu around it stays open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.stopPropagation();
      setIsDismissed(true);
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchorRef, isOpen]);

  return (
    <TooltipTrigger isOpen={isOpen}>
      <AriaTooltip
        className={`${popoverSurface} ${styles.tooltip}`}
        triggerRef={anchorRef}
        placement={placement}
        offset={popoverOffset}
        onPointerEnter={() => setIsOverTooltip(true)}
        onPointerLeave={() => setIsOverTooltip(false)}
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
};
