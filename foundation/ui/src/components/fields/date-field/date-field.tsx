import { useId, useState, type ReactNode } from "react";
import {
  TextField as AriaTextField,
  Input,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components/TextField";
import { useTranslation } from "react-i18next";

import { calendarDateSchema } from "@merit/dates";

import { ButtonBase } from "../../button/button-base";
import { Calendar } from "../../calendar/calendar";
import { PickerPopover } from "../../dialog/dialog";
import { IconBase } from "../../icon/icon-base";
import { Tooltip } from "../../tooltip/tooltip";
import { FieldLabel, FieldFeedback, type FieldPresentationProps } from "../field-parts";
import fieldStyles from "../field.module.css";
import inputStyles from "../input.module.css";
import styles from "./date-field.module.css";

type DateFieldProps = Pick<
  AriaTextFieldProps,
  | "name"
  | "autoFocus"
  | "onBlur"
  | "onKeyDown"
  | "isRequired"
  | "isReadOnly"
  | "isDisabled"
  | "isInvalid"
  | "validationBehavior"
> &
  FieldPresentationProps & {
    value: string;
    onChange: (value: string) => void;
    /** Hide the popup trigger when composing with a separately displayed Calendar. */
    showCalendar?: boolean;
    /** Inline actions for a standalone date picker, such as Save and Cancel. */
    actions?: ReactNode;
  };

/**
 * Edits a YYYY-MM-DD string, preserving empty, incomplete, and invalid drafts.
 * The caller validates before committing; calendar selections emit valid dates.
 * Pass isDisabled while saving, including for the portaled calendar.
 */
export const DateField = ({
  label,
  isLabelHidden,
  description,
  errorMessage,
  value,
  onChange,
  showCalendar = true,
  actions,
  onKeyDown,
  ...props
}: DateFieldProps) => {
  const { t } = useTranslation("common");
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const calendarLabel = t("date.choose", { label });

  return (
    <AriaTextField
      {...props}
      value={value}
      onChange={onChange}
      aria-describedby={description ? descriptionId : undefined}
      className={fieldStyles.field}
    >
      {({ isInvalid }) => (
        <>
          <FieldLabel
            required={props.isRequired && !props.isReadOnly && !props.isDisabled}
            isHidden={isLabelHidden}
          >
            {label}
          </FieldLabel>
          <div className={`${inputStyles.inputGroup} ${styles.controls}`}>
            <Input
              onKeyDown={onKeyDown}
              data-invalid-focus-target={isInvalid || undefined}
              placeholder="YYYY-MM-DD"
              className={`${inputStyles.input} ${styles.input}`}
            />
            {actions}
            {showCalendar && (
              <PickerPopover
                title={label}
                placement="bottom end"
                isOpen={open}
                onOpenChange={setOpen}
                trigger={
                  <Tooltip content={calendarLabel}>
                    <ButtonBase
                      variant="quiet"
                      iconOnly
                      className={styles.trigger}
                      aria-label={calendarLabel}
                      isDisabled={props.isDisabled || props.isReadOnly}
                    >
                      <IconBase name="calendar" />
                    </ButtonBase>
                  </Tooltip>
                }
              >
                {() => (
                  <Calendar
                    label={label}
                    value={calendarDateSchema.safeParse(value).success ? value : null}
                    isDisabled={props.isDisabled || props.isReadOnly}
                    autoFocus
                    onChange={(date) => {
                      onChange(date);
                      setOpen(false);
                    }}
                  />
                )}
              </PickerPopover>
            )}
          </div>
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
