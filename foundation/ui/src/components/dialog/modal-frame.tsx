import { useState, type ReactNode } from "react";
import { Dialog, DialogTrigger } from "react-aria-components/Dialog";
import { Modal, ModalOverlay, type ModalOverlayProps } from "react-aria-components/Modal";

import motion from "../../foundations/motion.module.css";
import { frameRoot, type FramePlacement } from "./frame";
import styles from "./modal-frame.module.css";

export type ModalFrameProps = Omit<ModalOverlayProps, "children" | "className" | "style"> & {
  /** Omit for a controlled dialog opened by the feature; focus returns to where it was. */
  trigger?: ReactNode;
  /** Guards the close control, Escape, and outside dismissal together. */
  isDismissDisabled?: boolean;
  "aria-describedby"?: string;
};

// Keep the last open content while callers clear their state during dismissal.
export const RetainedDialogContent = ({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: ReactNode;
}) => {
  const [content, setContent] = useState(children);
  if (isOpen && content !== children) {
    setContent(children);
  }
  return isOpen ? children : content;
};

/**
 * Shared modal behavior for every modal frame: backdrop, focus containment, dismissal,
 * retained exit content, and entrance motion. Each frame owns its own surface and layout.
 */
export const ModalFrame = ({
  trigger,
  isOpen,
  defaultOpen,
  onOpenChange,
  isDismissDisabled = false,
  isDismissable = false,
  isKeyboardDismissDisabled,
  classNames,
  frame,
  scrollsWhole = false,
  "aria-label": ariaLabel,
  "aria-describedby": descriptionId,
  children,
  ...props
}: ModalFrameProps & {
  classNames: { overlay?: string; modal?: string; dialog?: string };
  /** Titled frames take the shared frame anatomy, including the short-viewport scrolling fallback. */
  frame?: Extract<FramePlacement, "center" | "end">;
  /** The whole frame scrolls below 30rem of viewport height; leave off where the footer must stay in view. */
  scrollsWhole?: boolean;
  /** Names a frame without a visible heading. */
  "aria-label"?: string;
  children: (close: () => void) => ReactNode;
}) => {
  const handleOpenChange = (open: boolean) => {
    if (open || !isDismissDisabled) {
      onOpenChange?.(open);
    }
  };

  const dialogClassName = `${styles.dialog} ${classNames.dialog ?? ""}`;
  const root = frame ? frameRoot(frame, dialogClassName) : { className: dialogClassName };
  const overlayState =
    trigger == null ? { isOpen, defaultOpen, onOpenChange: handleOpenChange } : {};
  const overlay = (
    <ModalOverlay
      {...props}
      {...overlayState}
      isDismissable={!isDismissDisabled && isDismissable}
      isKeyboardDismissDisabled={isDismissDisabled || isKeyboardDismissDisabled}
      className={`${styles.overlay} ${motion.fadeIn} ${motion.fadeOut} ${classNames.overlay ?? ""}`}
    >
      {({ state }) => (
        <RetainedDialogContent isOpen={state.isOpen}>
          <Modal className={classNames.modal}>
            <Dialog
              {...root}
              data-frame-scrolls={scrollsWhole || undefined}
              aria-label={ariaLabel}
              aria-describedby={descriptionId}
              data-modal-dialog={frame}
            >
              {({ close }) => children(close)}
            </Dialog>
          </Modal>
        </RetainedDialogContent>
      )}
    </ModalOverlay>
  );

  return trigger == null ? (
    overlay
  ) : (
    <DialogTrigger isOpen={isOpen} defaultOpen={defaultOpen} onOpenChange={handleOpenChange}>
      {trigger}
      {overlay}
    </DialogTrigger>
  );
};
