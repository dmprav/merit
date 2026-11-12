import { useId, useState, type ReactNode } from "react";
import {
  TextField as AriaTextField,
  Input,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components/TextField";
import { useTranslation } from "react-i18next";

import { calendarDateSchema } from "@merit/dates";

import { Button } from "../../button/button";
import { Calendar } from "../../calendar/calendar";
import { PopoverDialog } from "../../dialog/dialog";
import { Icon } from "../../icon/icon";
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
          <FieldLabel required={props.isRequired && !props.isReadOnly && !props.isDisabled}>
            {label}
          </FieldLabel>
          <div className={`${inputStyles.inputGroup} ${styles.controls}`}>
            <Input
              onKeyDown={onKeyDown}
              data-invalid-focus-target={isInvalid || undefined}
              placeholder="YYYY-MM-DD"
              className={inputStyles.input}
            />
            {actions}
            {showCalendar && (
              <PopoverDialog
                title={label}
                closeLabel={t("closeDialog")}
                placement="bottom end"
                appearance="compact"
                isOpen={open}
                onOpenChange={setOpen}
                trigger={
                  <Tooltip content={calendarLabel}>
                    <Button
                      variant="quiet"
                      size="small"
                      iconOnly
                      className={styles.trigger}
                      aria-label={calendarLabel}
                      isDisabled={props.isDisabled || props.isReadOnly}
                    >
                      <Icon name="round" />
                    </Button>
                  </Tooltip>
                }
              >
                {({ closeButton }) => (
                  <Calendar
                    label={label}
                    value={calendarDateSchema.safeParse(value).success ? value : null}
                    isDisabled={props.isDisabled || props.isReadOnly}
                    autoFocus
                    headerActions={closeButton}
                    onChange={(date) => {
                      onChange(date);
                      setOpen(false);
                    }}
                  />
                )}
              </PopoverDialog>
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
