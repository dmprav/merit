import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Notice } from "@merit/ui/notice";

import { ContactDraftProvider, useContactDrafts } from "./controllers/drafts";

const Recovery = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation("contacts");
  const { unavailable, status } = useContactDrafts();
  return (
    <>
      {unavailable && (
        <Notice tone="warning">
          {t(status === "conflict" ? "draftRecoveryConflict" : "draftRecoveryUnavailable")}
        </Notice>
      )}
      {children}
    </>
  );
};

export const ContactDrafts = ({ children, scope }: { children: ReactNode; scope?: string }) => (
  <ContactDraftProvider scope={scope}>
    <Recovery>{children}</Recovery>
  </ContactDraftProvider>
);
