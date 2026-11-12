import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AcceptedWorkspace, InvitationData } from "../contracts";

export const useInvitation = (
  data: InvitationData,
  onAccepted: (workspace: AcceptedWorkspace) => Promise<void>,
) => {
  const { t } = useTranslation("onboarding");
  const mutation = useMutation({ mutationFn: data.accept });
  const [error, setError] = useState("");

  const accept = async () => {
    setError("");

    try {
      const outcome = await mutation.mutateAsync();
      if (outcome.status !== "ok") {
        setError(t(`errors.${outcome.status}`));
      } else {
        await data.refreshAccess();
        await onAccepted(outcome.value);
      }
    } catch {
      setError(t("errors.unavailable"));
    }
  };

  return { pending: mutation.isPending, error, accept };
};
