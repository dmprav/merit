import { useSyncExternalStore, type ReactNode } from "react";
import { Dialog, DialogTrigger } from "react-aria-components/Dialog";
import { Popover, type PopoverProps } from "react-aria-components/Popover";

import {
  popoverContainerPadding,
  popoverMaxHeight,
  popoverOffset,
  popoverSurface,
} from "../../foundations/popover";
import { DialogContent, DialogFrameContext } from "./dialog-content";
import styles from "./dialog.module.css";
import { FrameHeader, frameRoot } from "./frame";
import { FramedDialog, type FramedDialogProps } from "./framed-dialog";
import { RetainedDialogContent } from "./modal-frame";

export { DialogContent, DialogSection } from "./dialog-content";
export { FrameFooter } from "./frame";

/** A centered dialog for a bounded task: a short form, a decision, or reference reading. */
export const ModalDialog = (props: FramedDialogProps) => <FramedDialog {...props} frame="center" />;

/** Records related to a row, in a full-height panel at the end edge. */
export const SidePanel = (props: FramedDialogProps) => <FramedDialog {...props} frame="end" />;

const compactQuery = "(max-width: 600px)";

const subscribeViewport = (onChange: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const isCompactViewport = () => window.matchMedia(compactQuery).matches;

const pixelAlignedTriggerRect = (target: Element) => {
  const rect = target.getBoundingClientRect();
  // Positioning rounds to CSS pixels; matching bounds prevents a fractional
  // fit from flipping and resizing the picker inside its ResizeObserver.
  const top = Math.floor(rect.top);
  return new DOMRect(rect.x, top, rect.width, Math.ceil(rect.bottom) - top);
};

type FloatingDialogProps = {
  title: string;
  /** Defaults to the shared “Close dialog” message. */
  closeLabel?: string;
  trigger: ReactNode;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  isDismissDisabled?: boolean;
  placement?: PopoverProps["placement"];
};

const FloatingDialog = ({
  title,
  closeLabel,
  trigger,
  children,
  footer,
  isOpen,
  onOpenChange,
  headerActions,
  placement,
  appearance,
  isDismissDisabled = false,
}: FloatingDialogProps & {
  headerActions?: ReactNode;
  footer?: ReactNode;
  appearance: "reference" | "picker";
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
}) => {
  const compact = useSyncExternalStore(subscribeViewport, isCompactViewport, () => false);
  const picker = appearance === "picker";

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open || !isDismissDisabled) {
          onOpenChange?.(open);
        }
      }}
    >
      {trigger}
      <Popover
        className={`${popoverSurface} ${styles.popover}`}
        data-appearance={appearance}
        placement={compact ? "bottom end" : (placement ?? "right bottom")}
        offset={popoverOffset}
        containerPadding={popoverContainerPadding}
        maxHeight={popoverMaxHeight}
        getTargetRect={picker ? pixelAlignedTriggerRect : undefined}
        // Pickers lock background scrolling so nested forms do not dismiss their parent.
        isNonModal={!compact && !picker}
        isKeyboardDismissDisabled={isDismissDisabled}
        shouldCloseOnInteractOutside={() => !isDismissDisabled}
      >
        {({ isExiting }) => (
          <RetainedDialogContent isOpen={!isExiting}>
            <Dialog
              {...(picker ? { className: styles.dialog } : frameRoot("popover", styles.dialog))}
              aria-label={picker ? title : undefined}
            >
              {({ close }) => {
                const content = typeof children === "function" ? children({ close }) : children;

                return (
                  <DialogFrameContext value={{ framed: !picker, title }}>
                    {picker ? (
                      content
                    ) : (
                      <>
                        <FrameHeader
                          title={title}
                          closeLabel={closeLabel}
                          isDismissDisabled={isDismissDisabled}
                          close={close}
                          actions={headerActions}
                        />
                        <DialogContent footer={footer}>{content}</DialogContent>
                      </>
                    )}
                  </DialogFrameContext>
                );
              }}
            </Dialog>
          </RetainedDialogContent>
        )}
      </Popover>
    </DialogTrigger>
  );
};

/**
 * Reference material beside a value: a persistent heading and close control above a
 * keyboard-scrollable body, with optional utilities in a tinted footer.
 */
export const PopoverDialog = (
  props: FloatingDialogProps & {
    headerActions?: ReactNode;
    /** Utility content below the body. */
    footer?: ReactNode;
    children: ReactNode | ((props: { close: () => void }) => ReactNode);
  },
) => <FloatingDialog {...props} appearance="reference" />;

/**
 * A picker or small filter panel. The title names the dialog without a decorative header, and
 * there is no visible close control: it dismisses with Escape or a press outside, and React Aria
 * adds a hidden dismiss button for screen readers.
 */
export const PickerPopover = (
  props: Omit<FloatingDialogProps, "closeLabel"> & {
    children: ReactNode | ((props: { close: () => void }) => ReactNode);
  },
) => <FloatingDialog {...props} appearance="picker" />;
