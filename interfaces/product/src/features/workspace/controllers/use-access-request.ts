import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAnalytics } from "@merit/analytics";
import { useForm, useTranslatedSchema } from "@merit/forms";
import { accessRequestInput } from "@merit/organizations/api";

import type { RequestAccess } from "../contracts";

/** A saved request closes the dialog; onSubmitted confirms it outside the dialog. */
export const useAccessRequest = (request: RequestAccess, onSubmitted: () => void) => {
  const analytics = useAnalytics();
  const { t } = useTranslation("onboarding");
  const [open, setOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const { form, submission } = useForm({
    defaultValues: { email: "" },
    schema: useTranslatedSchema(accessRequestInput),
    onChange: ({ email }) => setHasDraft(Boolean(email)),
    submitErrorMessage: t("request.error"),
    onSubmit: async (value) => {
      const result = await request(value);
      if (result.status !== "ok") {
        return t(result.status === "limited" ? "request.limited" : "request.error");
      }

      analytics.track("access_request_submitted");
      setHasDraft(false);
      form.reset();
      setOpen(false);
      onSubmitted();
      return null;
    },
  });

  return { open, setOpen, hasDraft, setHasDraft, form, submission };
};
