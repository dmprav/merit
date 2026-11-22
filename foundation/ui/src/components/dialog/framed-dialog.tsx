import type { DialogProps } from "react-aria-components/Dialog";

import { DialogFrameContext } from "./dialog-content";
import styles from "./framed-dialog.module.css";
import { FramedHeader } from "./framed-header";
import { ModalFrame, type ModalFrameProps } from "./modal-frame";

export type FramedDialogProps = Pick<
  ModalFrameProps,
  | "isOpen"
  | "defaultOpen"
  | "onOpenChange"
  | "isDismissable"
  | "isDismissDisabled"
  | "trigger"
  | "aria-describedby"
> & {
  title: string;
  /** Fixed parent context that orients the task. */
  context?: string;
  /** Localized relationship label, such as “Round”. */
  contextLabel?: string;
  /** Defaults to the shared “Close dialog” message. */
  closeLabel?: string;
  children: DialogProps["children"];
};

/**
 * The titled frame shared by centered dialogs and side panels: a header with optional
 * context, then `DialogContent` with its gutters and footer.
 */
export const FramedDialog = ({
  frame,
  width = "default",
  title,
  context,
  contextLabel,
  closeLabel,
  isDismissDisabled,
  children,
  ...props
}: FramedDialogProps & {
  frame: "center" | "end";
  /** Confirmations use a narrower centered frame suited to a short decision. */
  width?: "default" | "narrow";
}) => (
  <ModalFrame
    {...props}
    isDismissDisabled={isDismissDisabled}
    frame={frame}
    classNames={{
      overlay: frame === "end" ? styles.sidePanelOverlay : styles.centeredOverlay,
      modal:
        frame === "end"
          ? styles.sidePanel
          : `${styles.centered} ${width === "narrow" ? (styles.narrow ?? "") : ""}`,
      dialog: styles.dialog,
    }}
  >
    {(close) => (
      <DialogFrameContext value={{ framed: true, title }}>
        <FramedHeader
          title={title}
          context={context}
          contextLabel={contextLabel}
          closeLabel={closeLabel}
          isDismissDisabled={isDismissDisabled}
          close={close}
        />
        {typeof children === "function" ? children({ close }) : children}
      </DialogFrameContext>
    )}
  </ModalFrame>
);
