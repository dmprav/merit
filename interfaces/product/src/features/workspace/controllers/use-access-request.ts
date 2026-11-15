import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAnalytics } from "@merit/analytics";
import { useForm, useTranslatedSchema } from "@merit/forms";
import { accessRequestInput } from "@merit/organizations/api";

import type { RequestAccess } from "../contracts";

export const useAccessRequest = (request: RequestAccess) => {
  const analytics = useAnalytics();
  const { t } = useTranslation("onboarding");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
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
      setSaved(true);
      setHasDraft(false);
      form.reset();
      return null;
    },
  });

  return { open, setOpen, saved, setSaved, hasDraft, setHasDraft, form, submission };
};
