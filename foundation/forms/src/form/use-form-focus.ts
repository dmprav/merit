import { useEffect, useRef, useState } from "react";

export const useFormFocus = (error: string | null) => {
  const formRef = useRef<HTMLFormElement>(null);
  const submitFocus = useRef<HTMLElement | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Wait for validation feedback and enabled controls to commit before focusing.
  useEffect(() => {
    if (attempt === 0) {
      return;
    }

    // Controls mark their invalid input or trigger so focus follows DOM order.
    const invalid = formRef.current?.querySelector<HTMLElement>(
      "[data-invalid-focus-target]:not(:disabled)",
    );
    if (invalid) {
      invalid.focus();
    } else if (
      error &&
      (document.activeElement === document.body ||
        document.activeElement === formRef.current?.closest('[role="dialog"]')) &&
      submitFocus.current?.isConnected &&
      !submitFocus.current.matches(":disabled")
    ) {
      submitFocus.current.focus();
    }
  }, [attempt, error]);

  return {
    formRef,
    rememberSubmitFocus: () => {
      const focused = document.activeElement;
      submitFocus.current =
        focused instanceof HTMLElement && formRef.current?.contains(focused) ? focused : null;
    },
    completeSubmission: () => setAttempt((value) => value + 1),
  };
};
