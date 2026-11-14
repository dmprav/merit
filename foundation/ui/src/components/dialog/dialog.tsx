import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog, DialogTrigger, Heading, type DialogProps } from "react-aria-components/Dialog";
import { Modal, ModalOverlay, type ModalOverlayProps } from "react-aria-components/Modal";
import { Popover, type PopoverProps } from "react-aria-components/Popover";

import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { DialogContent, DialogLayoutContext } from "./dialog-content";
import styles from "./dialog.module.css";

export { DialogContent } from "./dialog-content";

type ModalDialogProps = Omit<ModalOverlayProps, "children" | "className"> & {
  title: string;
  /** Fixed parent context that orients the task. */
  context?: string;
  /** Localized relationship label, such as “Round”. */
  contextLabel?: string;
  closeLabel: string;
  trigger: ReactNode;
  children: DialogProps["children"];
  "aria-describedby"?: string;
  isDismissDisabled?: boolean;
  size?: "default" | "wide";
} & (
    | {
        appearance?: "default";
        placement?: "center" | "start";
      }
    | {
        /** Shared form frame with a stable desktop position and tinted footer. */
        appearance: "form";
        placement?: never;
      }
    | {
        /**
         * A search box near the top of the page with no visible title bar and a small close
         * control; the title names the dialog for assistive technology and fills the screen
         * on compact viewports. Dismisses on outside press unless `isDismissable` is false.
         */
        appearance: "search";
        placement?: never;
      }
  );

// Keep the last open content while callers clear their state during dismissal.
const RetainedDialogContent = ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => {
  const [content, setContent] = useState(children);
  if (isOpen && content !== children) {
    setContent(children);
  }
  return isOpen ? children : content;
};

const compactQuery = "(max-width: 600px)";

const subscribeViewport = (onChange: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const isCompactViewport = () => window.matchMedia(compactQuery).matches;

/** Supplies a persistent heading and a keyboard-scrollable body around the content. */
export const PopoverDialog = ({
  title,
  closeLabel,
  trigger,
  children,
  footer,
  isOpen,
  onOpenChange,
  headerActions,
  placement,
  appearance = "default",
  isDismissDisabled = false,
}: Pick<
  ModalDialogProps,
  "title" | "closeLabel" | "trigger" | "isOpen" | "onOpenChange" | "isDismissDisabled"
> & {
  headerActions?: ReactNode;
  /** Utility content below the standard appearance's body. */
  footer?: ReactNode;
  placement?: PopoverProps["placement"];
  /** Compact pickers render the supplied closeButton alongside their own heading. */
  appearance?: "default" | "compact";
  children: ReactNode | ((props: { close: () => void; closeButton: ReactNode }) => ReactNode);
}) => {
  const compact = useSyncExternalStore(subscribeViewport, isCompactViewport, () => false);

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
        className={styles.popover}
        data-appearance={appearance}
        data-has-footer={footer ? true : undefined}
        placement={compact ? "bottom end" : (placement ?? "right bottom")}
        offset={8}
        containerPadding={16}
        maxHeight={560}
        // Compact pickers lock background scrolling so nested forms do not dismiss their parent.
        isNonModal={!compact}
        isKeyboardDismissDisabled={isDismissDisabled}
        shouldCloseOnInteractOutside={() => !isDismissDisabled}
      >
        {({ isExiting }) => (
          <RetainedDialogContent isOpen={!isExiting}>
            <Dialog
              className={styles.dialog}
              aria-label={appearance === "compact" ? title : undefined}
            >
              {({ close }) => {
                const closeButton = (
                  <Button
                    slot={null}
                    variant="quiet"
                    size="small"
                    iconOnly
                    aria-label={closeLabel}
                    onPress={close}
                    isDisabled={isDismissDisabled}
                  >
                    <Icon name="close" />
                  </Button>
                );
                const content =
                  typeof children === "function" ? children({ close, closeButton }) : children;

                return (
                  <DialogLayoutContext value="default">
                    {appearance === "default" && (
                      <div className={styles.popoverHeader}>
                        <Heading slot="title" className={styles.popoverTitle}>
                          {title}
                        </Heading>
                        <div className={styles.headerActions}>
                          {headerActions}
                          {closeButton}
                        </div>
                      </div>
                    )}
                    {appearance === "default" ? (
                      <>
                        <DialogContent label={title}>{content}</DialogContent>
                        {footer && <div className={styles.popoverFooter}>{footer}</div>}
                      </>
                    ) : (
                      content
                    )}
                  </DialogLayoutContext>
                );
              }}
            </Dialog>
          </RetainedDialogContent>
        )}
      </Popover>
    </DialogTrigger>
  );
};

const ModalDialogHeader = ({
  title,
  context,
  contextLabel,
  closeLabel,
  isDismissDisabled,
  close,
}: Pick<
  ModalDialogProps,
  "title" | "context" | "contextLabel" | "closeLabel" | "isDismissDisabled"
> & { close: () => void }) => (
  <div className={styles.header} data-dialog-header>
    <div className={styles.heading}>
      <Heading slot="title" className={styles.title}>
        {title}
      </Heading>
      {context && (
        <span className={styles.context}>
          {contextLabel && (
            <>
              <span>{contextLabel}:</span>{" "}
            </>
          )}
          <span>{context}</span>
        </span>
      )}
    </div>
    <Button
      variant="quiet"
      iconOnly
      aria-label={closeLabel}
      isDisabled={isDismissDisabled}
      onPress={close}
      className={styles.close}
    >
      <Icon name="close" />
    </Button>
  </div>
);

const ModalDialogOverlay = ({
  title,
  appearance = "default",
  context,
  contextLabel,
  closeLabel,
  children,
  isDismissDisabled,
  placement = "center",
  size = "default",
  isDismissable,
  isKeyboardDismissDisabled,
  "aria-describedby": descriptionId,
  ...props
}: Omit<ModalDialogProps, "trigger">) => (
  <ModalOverlay
    {...props}
    isDismissable={!isDismissDisabled && (isDismissable ?? appearance === "search")}
    isKeyboardDismissDisabled={isDismissDisabled || isKeyboardDismissDisabled}
    className={styles.overlay}
    data-placement={placement}
    data-appearance={appearance}
  >
    {({ state }) => (
      <RetainedDialogContent isOpen={state.isOpen}>
        <Modal className={styles.modal} data-size={size} data-appearance={appearance}>
          <Dialog
            className={styles.dialog}
            aria-label={appearance === "search" ? title : undefined}
            aria-describedby={descriptionId}
            data-modal-dialog={placement}
          >
            {({ close }) => (
              <DialogLayoutContext value={appearance === "form" ? "form" : "default"}>
                {appearance === "search" ? (
                  <Button
                    variant="quiet"
                    size="small"
                    iconOnly
                    aria-label={closeLabel}
                    isDisabled={isDismissDisabled}
                    onPress={close}
                    className={styles.searchClose}
                  >
                    <Icon name="close" />
                  </Button>
                ) : (
                  <ModalDialogHeader
                    title={title}
                    context={context}
                    contextLabel={contextLabel}
                    closeLabel={closeLabel}
                    isDismissDisabled={isDismissDisabled}
                    close={close}
                  />
                )}
                {typeof children === "function" ? children({ close }) : children}
              </DialogLayoutContext>
            )}
          </Dialog>
        </Modal>
      </RetainedDialogContent>
    )}
  </ModalOverlay>
);

export const ModalDialog = ({
  trigger,
  isOpen,
  defaultOpen,
  onOpenChange,
  isDismissDisabled = false,
  ...props
}: ModalDialogProps) => {
  const handleOpenChange = (open: boolean) => {
    if (open || !isDismissDisabled) {
      onOpenChange?.(open);
    }
  };

  const overlayState =
    trigger == null ? { isOpen, defaultOpen, onOpenChange: handleOpenChange } : {};
  const overlay = (
    <ModalDialogOverlay {...props} {...overlayState} isDismissDisabled={isDismissDisabled} />
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
