import { useId, type ReactNode } from "react";

import { Button } from "../../components/button/button";
import { ButtonBase } from "../../components/button/button-base";
import { DialogContent } from "../../components/dialog/dialog";
import { FramedDialog } from "../../components/dialog/framed-dialog";
import { Inline } from "../../components/layout/layout";
import { Notice } from "../../components/notice/notice";
import { StatusMessage } from "../status-message/status-message";
import styles from "./confirmation-dialog.module.css";

type ConfirmationDialogProps = {
  title: string;
  description: string;
  /** Supporting consequences shown between the summary and confirmation actions. */
  children?: ReactNode;
  /** Defaults to the shared “Close dialog” message. */
  closeLabel?: string;
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
    <FramedDialog
      frame="center"
      width="narrow"
      title={title}
      closeLabel={closeLabel}
      trigger={trigger}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissDisabled={isPending}
      aria-describedby={descriptionId}
    >
      <DialogContent
        feedback={
          error && (
            <Notice appearance="inline" tone="danger" role="alert">
              {error}
            </Notice>
          )
        }
        footer={
          <Inline justify="end" gap={3}>
            <Button
              variant="secondary"
              autoFocus
              isDisabled={isPending}
              onPress={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <ConfirmAction
              intent={intent}
              label={confirmLabel}
              pendingLabel={pendingLabel}
              pending={isPending}
              onConfirm={onConfirm}
            />
          </Inline>
        }
      >
        <div className={styles.content}>
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
          {children}
        </div>
      </DialogContent>
    </FramedDialog>
  );
};

const ConfirmAction = ({
  intent,
  label,
  pendingLabel,
  pending,
  onConfirm,
}: {
  intent: "default" | "destructive";
  label: string;
  pendingLabel?: string;
  pending: boolean;
  onConfirm: () => void;
}) => {
  const pendingMessage = pending ? (pendingLabel ?? label) : null;
  return (
    <>
      <ButtonBase
        size="small"
        variant={intent === "destructive" ? "destructive" : "primary"}
        aria-busy={pending}
        aria-disabled={pending}
        onPress={pending ? undefined : onConfirm}
      >
        {pendingMessage ?? label}
      </ButtonBase>
      {/* A local text announcement closes with the dialog, even when its button disappears. */}
      <StatusMessage message={pendingMessage} eventId={label} />
    </>
  );
};
