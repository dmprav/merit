import { useTranslation } from "react-i18next";
import type { z } from "zod";

import { useTranslatedSchema } from "@merit/forms";

export const useOrganizationSchema = <Output, Input>(schema: z.ZodType<Output, Input>) => {
  const { t } = useTranslation("administration");

  return useTranslatedSchema(schema, (issue) => {
    if (issue.code === "too_small" && issue.path?.[0] === "name") {
      return t("validation.nameRequired");
    }
    if (issue.code === "invalid_format" && issue.path?.[0] === "slug") {
      return t("validation.addressFormat");
    }
    if (issue.code === "custom" && issue.params?.reason === "reserved_workspace_slug") {
      return t("validation.addressReserved");
    }
    return undefined;
  });
};
