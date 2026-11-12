import { useId } from "react";
import { composeRenderProps } from "react-aria-components/composeRenderProps";
import {
  TextField as AriaTextField,
  Input,
  TextArea,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components/TextField";

import { FieldLabel, FieldFeedback, type FieldPresentationProps } from "../field-parts";
import fieldStyles from "../field.module.css";
import inputStyles from "../input.module.css";
import styles from "./text-field.module.css";

type TextFieldProps = Omit<AriaTextFieldProps, "children"> &
  FieldPresentationProps & {
    placeholder?: string;
    /** Fixed text inside a single-line input. isHidden hides it visually while retaining its accessible description and input focus. */
    prefix?: { text: string; label: string; isHidden?: boolean };
    multiline?: boolean;
    rows?: number;
  };

export const TextField = ({
  label,
  description,
  errorMessage,
  placeholder,
  prefix,
  multiline = false,
  rows = 5,
  className,
  ...props
}: TextFieldProps) => {
  const descriptionId = useId();
  const prefixId = useId();
  const generatedInputId = useId();
  const inputId = props.id ?? generatedInputId;
  const inputPrefix = multiline ? undefined : prefix;

  return (
    <AriaTextField
      {...props}
      aria-describedby={
        [
          props["aria-describedby"],
          inputPrefix ? prefixId : undefined,
          description ? descriptionId : undefined,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      className={composeRenderProps(
        className,
        (className) => `${fieldStyles.field} ${className ?? ""}`,
      )}
    >
      {({ isInvalid }) => (
        <>
          <FieldLabel required={props.isRequired && !props.isReadOnly && !props.isDisabled}>
            {label}
          </FieldLabel>
          {multiline ? (
            <TextArea
              data-invalid-focus-target={isInvalid || undefined}
              rows={rows}
              placeholder={placeholder}
              className={`${inputStyles.input} ${styles.multiline}`}
            />
          ) : inputPrefix ? (
            <div
              className={`${inputStyles.inputGroup} ${styles.prefixGroup}`}
              data-prefix-hidden={inputPrefix.isHidden || undefined}
            >
              <label
                htmlFor={inputId}
                aria-hidden="true"
                hidden={inputPrefix.isHidden}
                className={styles.prefix}
              >
                {inputPrefix.text}
              </label>
              <span id={prefixId} hidden>
                {inputPrefix.label}
              </span>
              <Input
                id={inputId}
                data-invalid-focus-target={isInvalid || undefined}
                placeholder={placeholder}
                className={inputStyles.input}
              />
            </div>
          ) : (
            <Input
              data-invalid-focus-target={isInvalid || undefined}
              placeholder={placeholder}
              className={inputStyles.input}
            />
          )}
          <FieldFeedback
            description={description}
            descriptionId={descriptionId}
            errorMessage={errorMessage}
          />
        </>
      )}
    </AriaTextField>
  );
};
