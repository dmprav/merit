import type { ComponentProps } from "react";

import { DateField } from "@merit/ui/date-field";

import type { StringField } from "./field";
import { useFieldProps } from "./use-field-props";

type FormDateFieldProps = Omit<
  ComponentProps<typeof DateField>,
  | "name"
  | "value"
  | "onChange"
  | "onBlur"
  | "isInvalid"
  | "errorMessage"
  | "validationBehavior"
  | "showCalendar"
> & { field: StringField };

/** Inherits Form’s pending state, including an open calendar. */
export const FormDateField = ({ field, isDisabled, ...props }: FormDateFieldProps) => {
  const { value, meta } = field.state;
  const fieldProps = useFieldProps(meta, isDisabled);

  return (
    <DateField
      {...props}
      value={value}
      name={field.name}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      {...fieldProps}
    />
  );
};
