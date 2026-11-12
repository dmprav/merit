import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Notice } from "@merit/ui/notice";
import { StateMessage } from "@merit/ui/state-message";

import { ContactDraftProvider, useContactDrafts } from "./controllers/drafts";

const Recovery = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation("contacts");
  const { unavailable, ready, status } = useContactDrafts();
  return (
    <>
      {unavailable && (
        <Notice tone="warning">
          {t(status === "conflict" ? "draftRecoveryConflict" : "draftRecoveryUnavailable")}
        </Notice>
      )}
      {ready ? children : <StateMessage title={t("draftsRestoring")} role="status" />}
    </>
  );
};

export const ContactDrafts = ({ children, scope }: { children: ReactNode; scope?: string }) => (
  <ContactDraftProvider scope={scope}>
    <Recovery>{children}</Recovery>
  </ContactDraftProvider>
);
