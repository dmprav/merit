import { Select, type SelectProps } from "@merit/ui/select";

import type { StringField } from "./field";
import { useFieldProps } from "./use-field-props";

type FormSelectProps<Id extends string> = Omit<
  SelectProps<Id>,
  | "name"
  | "selectedKey"
  | "defaultSelectedKey"
  | "onSelectionChange"
  | "onBlur"
  | "isInvalid"
  | "errorMessage"
  | "validationBehavior"
> & { field: StringField<Id> };

/** Connects selection and validation; inherits Form’s pending state, including popup options. */
export const FormSelect = <Id extends string>({
  field,
  isDisabled,
  ...props
}: FormSelectProps<Id>) => {
  const { value, meta } = field.state;
  const fieldProps = useFieldProps(meta, isDisabled);

  return (
    <Select
      {...props}
      name={field.name}
      selectedKey={value}
      onSelectionChange={field.handleChange}
      onBlur={field.handleBlur}
      {...fieldProps}
    />
  );
};
