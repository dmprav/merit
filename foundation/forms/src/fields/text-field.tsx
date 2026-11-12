import type { ComponentProps } from "react";

import { TextField } from "@merit/ui/text-field";

import type { StringField } from "./field";
import { useFieldProps } from "./use-field-props";

type FormTextFieldProps = Omit<
  ComponentProps<typeof TextField>,
  | "name"
  | "value"
  | "defaultValue"
  | "onChange"
  | "isInvalid"
  | "errorMessage"
  | "validationBehavior"
> & { field: StringField };

export const FormTextField = ({ field, onBlur, isDisabled, ...props }: FormTextFieldProps) => {
  const { value, meta } = field.state;
  const fieldProps = useFieldProps(meta, isDisabled);

  return (
    <TextField
      {...props}
      value={value}
      name={field.name}
      onChange={field.handleChange}
      onBlur={(event) => {
        onBlur?.(event);
        field.handleBlur();
      }}
      {...fieldProps}
    />
  );
};
