import {
  revalidateLogic,
  useForm as useTanStackForm,
  useStore,
  type StandardSchemaV1,
} from "@tanstack/react-form";
import { useRef, useState } from "react";

type FormOptions<Values> = {
  /** Captured on mount. Remount the form when switching records. */
  defaultValues: Values;
  /** Synchronous validation; transformed output is not used as form values. */
  schema: StandardSchemaV1<Values, unknown>;
  /** Receives draft edits, for example to retain them across navigation. */
  onChange?: (values: Values) => void;
  /**
   * Receives validated draft values. Parse them here to apply schema transformations
   * before saving. Return null on success or a localized failure message.
   */
  onSubmit: (values: Values) => string | null | Promise<string | null>;
  /** Localized fallback when submission throws or rejects. */
  submitErrorMessage: string;
};

export type Submission = {
  submit: () => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
};

/**
 * Validates on the first submit, then on change. Pair the returned submission with
 * Form. Repeated submissions are ignored while saving; failed saves retain values.
 */
export const useForm = <Values>({
  defaultValues: initialValues,
  schema,
  onChange,
  onSubmit,
  submitErrorMessage,
}: FormOptions<Values>) => {
  const [defaultValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  const form = useTanStackForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schema },
    listeners: { onChange: ({ formApi }) => onChange?.(formApi.state.values) },
    onSubmit: async ({ value }) => setError(await onSubmit(value)),
  });

  const issues = useStore(form.store, (state) => state.errorMap.onDynamic?.[""]);
  const submission: Submission = {
    isSubmitting,
    error: error ?? (issues?.map((issue) => issue.message).join(" ") || null),
    submit: async () => {
      // Guard before React renders the pending state, including Enter-key submissions.
      if (submitting.current) {
        return;
      }

      submitting.current = true;
      setIsSubmitting(true);
      setError(null);

      try {
        await form.handleSubmit();
      } catch {
        setError(submitErrorMessage);
      }

      submitting.current = false;
      setIsSubmitting(false);
    },
  };

  return { form, submission };
};
