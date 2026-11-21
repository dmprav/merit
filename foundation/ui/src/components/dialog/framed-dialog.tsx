import { Heading, type DialogProps } from "react-aria-components/Dialog";
import { useTranslation } from "react-i18next";

import scrollStyles from "../../foundations/scroll-area.module.css";
import { ButtonBase } from "../button/button-base";
import { IconBase } from "../icon/icon-base";
import { DialogFrameContext } from "./dialog-content";
import styles from "./framed-dialog.module.css";
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

const FramedDialogHeader = ({
  title,
  context,
  contextLabel,
  closeLabel,
  isDismissDisabled,
  close,
}: Pick<FramedDialogProps, "title" | "context" | "contextLabel" | "isDismissDisabled"> & {
  closeLabel: string;
  close: () => void;
}) => (
  <div className={`${styles.header} ${scrollStyles.dividerAfterStart}`} data-dialog-header>
    <div className={styles.heading}>
      <Heading slot="title" className={styles.title}>
        {title}
      </Heading>
      {context && (
        <span className={styles.context} data-dialog-context>
          {contextLabel && <>{contextLabel}: </>}
          {context}
        </span>
      )}
    </div>
    <ButtonBase
      variant="quiet"
      iconOnly
      aria-label={closeLabel}
      isDisabled={isDismissDisabled}
      onPress={close}
      className={styles.close}
    >
      <IconBase name="close" />
    </ButtonBase>
  </div>
);

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
}) => {
  const { t } = useTranslation("common");

  return (
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
          <FramedDialogHeader
            title={title}
            context={context}
            contextLabel={contextLabel}
            closeLabel={closeLabel ?? t("closeDialog")}
            isDismissDisabled={isDismissDisabled}
            close={close}
          />
          {typeof children === "function" ? children({ close }) : children}
        </DialogFrameContext>
      )}
    </ModalFrame>
  );
};
