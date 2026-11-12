import type { ReactNode } from "react";
import { Label, FieldError, type FieldErrorProps } from "react-aria-components/TextField";

import styles from "./field.module.css";

export type FieldPresentationProps = {
  label: string;
  description?: string;
  errorMessage?: FieldErrorProps["children"];
};

export const FieldLabel = ({
  children,
  required,
  requiredId,
}: {
  children: ReactNode;
  required?: boolean;
  requiredId?: string;
}) => (
  <Label className={styles.label}>
    {children}
    {required && (
      <span id={requiredId} aria-hidden="true" className={styles.required}>
        Required
      </span>
    )}
  </Label>
);

export const FieldFeedback = ({
  description,
  descriptionId,
  errorMessage,
}: Pick<FieldPresentationProps, "description" | "errorMessage"> & {
  descriptionId: string;
}) => (
  // Helpers and errors share space; fields without feedback leave no empty row.
  <div className={styles.feedback}>
    {description && (
      <p id={descriptionId} className={styles.description}>
        {description}
      </p>
    )}
    <FieldError className={styles.error}>{errorMessage}</FieldError>
  </div>
);
