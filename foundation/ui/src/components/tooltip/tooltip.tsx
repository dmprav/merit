import { useContext, useEffect, type ComponentProps } from "react";
import {
  Tooltip as AriaTooltip,
  TooltipContext,
  TooltipTrigger,
  TooltipTriggerStateContext,
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

const isInExternalOverlay = (target: Element | null, trigger: Element | null) => {
  const overlay = target?.closest('[role="dialog"], [role="menu"]');
  return Boolean(overlay && trigger && !overlay.contains(trigger));
};

// React Aria intercepts Escape in a document capture listener whenever any tooltip is open.
// Close tooltips anchored outside a focused dialog or menu so they cannot swallow its Escape.
const TooltipOverlayGuard = () => {
  const state = useContext(TooltipTriggerStateContext);
  const context = useContext(TooltipContext);
  const triggerRef = context && "triggerRef" in context ? context.triggerRef : undefined;
  const isOpen = state?.isOpen ?? false;

  useEffect(() => {
    if (!state || !isOpen) {
      return;
    }

    const trigger = triggerRef?.current ?? null;

    // A trigger that opens its own menu or popover hands over to it; the hint has done its job.
    if (
      isInExternalOverlay(document.activeElement, trigger) ||
      trigger?.getAttribute("aria-expanded") === "true"
    ) {
      state.close(true);
      return;
    }

    const expanded = new MutationObserver(() => {
      if (trigger?.getAttribute("aria-expanded") === "true") {
        state.close(true);
      }
    });
    if (trigger) {
      expanded.observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"] });
    }

    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element && isInExternalOverlay(event.target, trigger)) {
        state.close(true);
      }
    };

    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      expanded.disconnect();
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [isOpen, state, triggerRef]);

  return null;
};

/**
 * Answer a brief, optional question about a control that keeps its own clear label. The child must
 * be a focusable React Aria control, or a link with `customTrigger`; `content` is plain text. Keep
 * requirements, consequences, and recovery visible beside the task instead.
 */
export const Tooltip = ({
  children,
  content,
  placement = "top",
  isDisabled = false,
  customTrigger = false,
}: TooltipProps) => (
  <TooltipTrigger delay={350} closeDelay={150} isDisabled={isDisabled}>
    {customTrigger ? <Focusable>{children}</Focusable> : children}
    <TooltipOverlayGuard />
    <AriaTooltip className={styles.tooltip} placement={placement} offset={6}>
      {content}
    </AriaTooltip>
  </TooltipTrigger>
);
