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
import { Text } from "@merit/ui/text";

import localStyles from "./form.module.css";
import { FormPendingContext } from "./pending-context";
import type { Submission } from "./use-form";
import { useFormFocus } from "./use-form-focus";

const FormDialogContext = createContext(false);

/**
 * Frames a bounded editing task. The contained Form inherits scrolling, persistent
 * actions, and Cmd/Ctrl+Enter submission within the shared centered dialog. Features
 * own drafts and the pending dismissal guard; nested forms do not inherit these
 * conventions.
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
> & {
  children: ReactNode;
}) => (
  <ModalDialog {...props}>
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
  children,
  actions,
  layout = "stacked",
  stickyActions = false,
  scrollFields: requestedScrollFields = false,
  submitOnModEnter: requestedSubmitOnModEnter = false,
}: {
  submission: Submission;
  label: string;
  children: ReactNode;
  actions: ReactNode;
  /** inline puts a single field's actions beside it, such as renaming in place. */
  layout?: "stacked" | "inline";
  /**
   * Keep the actions in view at the bottom of a long form that scrolls with its pane. Fields
   * scrolled into view stay above them.
   */
  stickyActions?: boolean;
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
          noValidate
          aria-label={label}
          aria-busy={submission.isSubmitting}
          className={`${localStyles.form} ${scrollFields ? localStyles.scrollFields : ""}`}
          data-layout={layout}
          data-sticky-actions={stickyActions || undefined}
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
  submitLabel,
  submittingLabel,
  isSubmitDisabled = false,
  discard,
  status,
}: {
  submission: Submission;
  onCancel: () => void;
  cancelLabel: string;
  submitLabel: string;
  submittingLabel: string;
  isSubmitDisabled?: boolean;
  discard?: { label: string; onPress: () => void };
  /**
   * The draft or save state, announced politely at the footer's leading side beside Discard.
   * Pass `null` while there is nothing to report so later states are announced.
   */
  status?: ReactNode;
}) => (
  <div className={localStyles.actions}>
    {(status !== undefined || discard) && (
      <div className={localStyles.leading}>
        {status !== undefined && (
          <span role="status" className={localStyles.status}>
            {status && <Text variant="supporting">{status}</Text>}
          </span>
        )}
        {discard && (
          <Button variant="quiet" isDisabled={submission.isSubmitting} onPress={discard.onPress}>
            {discard.label}
          </Button>
        )}
      </div>
    )}
    <Button variant="secondary" isDisabled={submission.isSubmitting} onPress={onCancel}>
      {cancelLabel}
    </Button>
    <Button type="submit" isDisabled={submission.isSubmitting || isSubmitDisabled}>
      {submission.isSubmitting ? submittingLabel : submitLabel}
    </Button>
  </div>
);
