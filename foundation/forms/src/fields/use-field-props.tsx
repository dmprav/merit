import { useContext } from "react";

import { FormPendingContext } from "../form/pending-context";
import type { StringField } from "./field";

export const useFieldProps = (meta: StringField["state"]["meta"], isDisabled?: boolean) => {
  const isSubmitting = useContext(FormPendingContext);

  return {
    isDisabled: isSubmitting || isDisabled,
    validationBehavior: "aria" as const,
    isInvalid: meta.isTouched && !meta.isValid,
    errorMessage: (
      <span role="alert">
        {meta.errors.map((error) => (typeof error === "string" ? error : error?.message)).join(" ")}
      </span>
    ),
  };
};
