import type { StandardSchemaV1 } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import type { z } from "zod";

import type {} from "@merit/i18n";

/** Localize schema issues per form without changing shared rules or global Zod configuration. */
export const useTranslatedSchema = <Output, Input>(
  schema: z.ZodType<Output, Input>,
  message?: z.core.$ZodErrorMap,
): StandardSchemaV1<Input, Output> => {
  const { t } = useTranslation("common");

  const error: z.core.$ZodErrorMap = (issue) => {
    const specific = message?.(issue);
    if (specific != null) {
      return specific;
    }

    if (issue.code === "invalid_format" && issue.format === "email") {
      return t("validation.email");
    }
    if (issue.code === "too_small" && issue.origin === "string") {
      return issue.minimum === 1
        ? t("validation.required")
        : t("validation.minLength", { count: Number(issue.minimum) });
    }
    if (issue.code === "too_big") {
      if (issue.origin === "string") {
        return t("validation.maxLength", { count: Number(issue.maximum) });
      }
      if (issue.origin === "array") {
        return t("validation.maxItems", { count: Number(issue.maximum) });
      }
    }
    return t("validation.invalid");
  };

  return {
    "~standard": {
      version: 1,
      vendor: "merit",
      validate: (value) => {
        const result = schema.safeParse(value, { error });
        return result.success ? { value: result.data } : { issues: result.error.issues };
      },
    },
  };
};
