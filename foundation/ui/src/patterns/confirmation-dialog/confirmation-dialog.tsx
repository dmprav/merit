import { useId, type ReactNode } from "react";

import { Button } from "../../components/button/button";
import { DialogContent, ModalDialog } from "../../components/dialog/dialog";
import { Inline } from "../../components/layout/layout";
import { Notice } from "../../components/notice/notice";
import styles from "./confirmation-dialog.module.css";

type ConfirmationDialogProps = {
  title: string;
  description: string;
  /** Supporting consequences shown between the summary and confirmation actions. */
  children?: ReactNode;
  closeLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel?: string;
  intent?: "default" | "destructive";
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  trigger?: ReactNode;
  isPending?: boolean;
  error?: string | null;
};

/**
 * The feature owns the operation, pending/error state, and closing after success.
 * Keep the dialog open on failure. Supply localized labels and consequence text.
 * Pending prevents confirmation and dismissal; pendingLabel replaces confirmLabel.
 * Triggerless flows restore focus to a useful feature control when it closes.
 */
export const ConfirmationDialog = ({
  title,
  description,
  children,
  closeLabel,
  cancelLabel,
  confirmLabel,
  pendingLabel,
  intent = "default",
  isOpen,
  onOpenChange,
  onConfirm,
  trigger = null,
  isPending = false,
  error,
}: ConfirmationDialogProps) => {
  const descriptionId = useId();

  return (
    <ModalDialog
      appearance="form"
      title={title}
      closeLabel={closeLabel}
      trigger={trigger}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissDisabled={isPending}
      aria-describedby={descriptionId}
    >
      <DialogContent
        label={title}
        feedback={
          error && (
            <Notice appearance="inline" tone="danger" role="alert">
              {error}
            </Notice>
          )
        }
        footer={
          <div className={styles.content}>
            <Inline justify="end" gap={3}>
              <Button
                size="small"
                variant="secondary"
                autoFocus
                isDisabled={isPending}
                onPress={() => onOpenChange(false)}
              >
                {cancelLabel}
              </Button>
              <Button
                size="small"
                variant={intent === "destructive" ? "destructive" : "primary"}
                isPending={isPending}
                onPress={onConfirm}
              >
                {isPending ? (pendingLabel ?? confirmLabel) : confirmLabel}
              </Button>
            </Inline>
          </div>
        }
      >
        <div className={styles.content}>
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
          {children}
        </div>
      </DialogContent>
    </ModalDialog>
  );
};
