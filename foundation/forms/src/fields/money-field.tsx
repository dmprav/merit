import type { ComponentProps } from "react";

import { MoneyField } from "@merit/ui/money-field";

import type { StringField } from "./field";
import { useFieldProps } from "./use-field-props";

type FormMoneyFieldProps = Omit<
  ComponentProps<typeof MoneyField>,
  "name" | "value" | "onChange" | "onBlur" | "isInvalid" | "errorMessage" | "validationBehavior"
> & { field: StringField };

export const FormMoneyField = ({ field, isDisabled, ...props }: FormMoneyFieldProps) => {
  const fieldProps = useFieldProps(field.state.meta, isDisabled);
  return (
    <MoneyField
      {...props}
      value={field.state.value}
      name={field.name}
      onChange={field.handleChange}
      onBlur={field.handleBlur}
      {...fieldProps}
    />
  );
};
