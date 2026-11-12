export type StringField<Value extends string = string> = {
  name: string;
  state: {
    value: Value;
    meta: {
      isTouched: boolean;
      isValid: boolean;
      errors: readonly ({ message: string } | string | undefined)[];
    };
  };
  handleChange: (value: Value) => void;
  handleBlur: () => void;
};
