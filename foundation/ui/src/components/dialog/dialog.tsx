import { useSyncExternalStore, type ReactNode } from "react";
import { Dialog, DialogTrigger, Heading } from "react-aria-components/Dialog";
import { Popover, type PopoverProps } from "react-aria-components/Popover";
import { useTranslation } from "react-i18next";

import motion from "../../foundations/motion.module.css";
import scrollStyles from "../../foundations/scroll-area.module.css";
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { DialogContent, DialogFrameContext } from "./dialog-content";
import styles from "./dialog.module.css";
import { FramedDialog, type FramedDialogProps } from "./framed-dialog";
import { RetainedDialogContent } from "./modal-frame";

export { DialogContent, DialogSection } from "./dialog-content";

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
  children: ReactNode | ((props: { close: () => void; closeButton: ReactNode }) => ReactNode);
}) => {
  const { t } = useTranslation("common");
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
        // Pickers can open nested overlays before their entrance finishes, so they only fade.
        className={`${styles.popover} ${scrollStyles.scrollArea} ${motion.fadeOut} ${picker ? motion.fadeIn : ""}`}
        data-appearance={appearance}
        data-has-footer={footer ? true : undefined}
        placement={compact ? "bottom end" : (placement ?? "right bottom")}
        offset={8}
        containerPadding={16}
        maxHeight={560}
        getTargetRect={picker ? pixelAlignedTriggerRect : undefined}
        // Pickers lock background scrolling so nested forms do not dismiss their parent.
        isNonModal={!compact && !picker}
        isKeyboardDismissDisabled={isDismissDisabled}
        shouldCloseOnInteractOutside={() => !isDismissDisabled}
      >
        {({ isExiting }) => (
          <RetainedDialogContent isOpen={!isExiting}>
            <Dialog className={styles.dialog} aria-label={picker ? title : undefined}>
              {({ close }) => {
                const closeButton = (
                  <Button
                    slot={null}
                    variant="quiet"
                    size="small"
                    iconOnly
                    aria-label={closeLabel ?? t("closeDialog")}
                    onPress={close}
                    isDisabled={isDismissDisabled}
                  >
                    <Icon name="close" />
                  </Button>
                );
                const content =
                  typeof children === "function" ? children({ close, closeButton }) : children;

                return (
                  <DialogFrameContext value={{ framed: !picker, title }}>
                    {picker ? (
                      content
                    ) : (
                      <>
                        <div
                          className={`${styles.header} ${footer ? "" : scrollStyles.dividerAfterStart}`}
                        >
                          <Heading slot="title" className={styles.title}>
                            {title}
                          </Heading>
                          <div className={styles.headerActions}>
                            {headerActions}
                            {closeButton}
                          </div>
                        </div>
                        <DialogContent>{content}</DialogContent>
                        {footer && <div className={styles.footer}>{footer}</div>}
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
 * A picker or small filter panel that places the supplied `closeButton` beside its own
 * first row. The title names the dialog without a decorative header.
 */
export const PickerPopover = (
  props: FloatingDialogProps & {
    children: ReactNode | ((props: { close: () => void; closeButton: ReactNode }) => ReactNode);
  },
) => <FloatingDialog {...props} appearance="picker" />;
