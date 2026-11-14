import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
  type SubmitEvent,
} from "react";

import { Button } from "@merit/ui/button";
import { DialogContent, ModalDialog } from "@merit/ui/dialog";
import { Notice } from "@merit/ui/notice";

import localStyles from "./form.module.css";
import { FormPendingContext } from "./pending-context";
import type { Submission } from "./use-form";
import { useFormFocus } from "./use-form-focus";

const FormDialogContext = createContext(false);

/**
 * Frames a bounded editing task. The contained Form inherits scrolling, persistent
 * actions, and Cmd/Ctrl+Enter submission. All sizes share the context header,
 * tinted footer, and desktop position. Features own drafts and the pending
 * dismissal guard; nested forms do not inherit these conventions.
 */
export const FormDialog = ({
  children,
  ...props
}: Pick<
  ComponentProps<typeof ModalDialog>,
  | "title"
  | "context"
  | "contextLabel"
  | "closeLabel"
  | "trigger"
  | "isOpen"
  | "defaultOpen"
  | "onOpenChange"
  | "isDismissDisabled"
  | "size"
> & {
  children: ReactNode;
}) => (
  <ModalDialog {...props} appearance="form">
    <FormDialogContext value={true}>{children}</FormDialogContext>
  </ModalDialog>
);

/**
 * Names the form, announces save errors, and disables its fields and their popups while saving.
 * After validation, focuses the first enabled invalid control. Failed saves restore
 * lost focus to the submitting control so keyboard users can retry.
 */
export const Form = ({
  submission,
  label,
  className,
  children,
  actions,
  scrollFields: requestedScrollFields = false,
  submitOnModEnter: requestedSubmitOnModEnter = false,
}: {
  submission: Submission;
  label: string;
  className?: string;
  children: ReactNode;
  actions: ReactNode;
  /** Scroll fields within a bounded parent while keeping errors and actions visible. */
  scrollFields?: boolean;
  /** Submit from any field with Cmd/Ctrl+Enter, using ordinary validation. */
  submitOnModEnter?: boolean;
}) => {
  const inDialog = useContext(FormDialogContext);
  const scrollFields = inDialog || requestedScrollFields;
  const submitOnModEnter = inDialog || requestedSubmitOnModEnter;
  const { formRef, rememberSubmitFocus, completeSubmission } = useFormFocus(submission.error);

  const handleKeyDown: ComponentProps<"form">["onKeyDownCapture"] = (event) => {
    if (
      submitOnModEnter &&
      event.target instanceof Element &&
      event.target.closest("form") === event.currentTarget &&
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!submission.isSubmitting) {
        event.currentTarget.requestSubmit();
      }
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    // Portaled child editors submit their own work, never the surrounding form.
    if (event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    if (submission.isSubmitting) {
      return;
    }

    rememberSubmitFocus();
    await submission.submit();
    completeSubmission();
  };

  const fields = (
    <fieldset disabled={submission.isSubmitting} className={localStyles.fields}>
      {children}
    </fieldset>
  );
  const footer = (
    <fieldset
      disabled={submission.isSubmitting}
      className={`${localStyles.footer} ${scrollFields ? "" : localStyles.inlineFooter}`}
    >
      {actions}
    </fieldset>
  );
  const feedback = submission.error && (
    <Notice appearance="inline" tone="danger" role="alert">
      {submission.error}
    </Notice>
  );

  return (
    <FormPendingContext value={submission.isSubmitting}>
      <FormDialogContext value={false}>
        <form
          ref={formRef}
          data-appearance={inDialog ? "form" : "default"}
          noValidate
          aria-label={label}
          aria-busy={submission.isSubmitting}
          className={`${className ?? ""} ${scrollFields ? localStyles.scrollFields : ""}`}
          onKeyDownCapture={handleKeyDown}
          onSubmit={handleSubmit}
        >
          {scrollFields ? (
            <DialogContent label={label} role="group" feedback={feedback} footer={footer}>
              {fields}
            </DialogContent>
          ) : (
            <>
              {fields}
              {feedback && <div className={localStyles.feedback}>{feedback}</div>}
              {footer}
            </>
          )}
        </form>
      </FormDialogContext>
    </FormPendingContext>
  );
};

export const FormActions = ({
  submission,
  onCancel,
  cancelLabel,
  cancelVariant = "secondary",
  submitLabel,
  submittingLabel,
  isSubmitDisabled = false,
  discard,
}: {
  submission: Submission;
  onCancel: () => void;
  cancelLabel: string;
  cancelVariant?: "secondary" | "quiet";
  submitLabel: string;
  submittingLabel: string;
  isSubmitDisabled?: boolean;
  discard?: { label: string; onPress: () => void };
}) => (
  <div className={localStyles.actions}>
    {discard && (
      <Button
        size="small"
        variant="quiet"
        className={localStyles.discard}
        isDisabled={submission.isSubmitting}
        onPress={discard.onPress}
      >
        {discard.label}
      </Button>
    )}
    <Button
      size="small"
      variant={cancelVariant}
      isDisabled={submission.isSubmitting}
      onPress={onCancel}
    >
      {cancelLabel}
    </Button>
    <Button size="small" type="submit" isDisabled={submission.isSubmitting || isSubmitDisabled}>
      {submission.isSubmitting ? submittingLabel : submitLabel}
    </Button>
  </div>
);
