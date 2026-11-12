import { useMemo, type ReactNode } from "react";

import { createMessages, defaultLocale, type LocaleSettings } from "@merit/i18n/core";
import { ServerMessagesProvider } from "@merit/i18n/server";

import { en } from "./messages.en";

export const emailMessages = { invitationEmail: en };

declare module "@merit/i18n/core" {
  interface Messages {
    invitationEmail: typeof en;
  }
}

export const EmailMessagesProvider = ({
  children,
  locale = defaultLocale,
}: {
  children: ReactNode;
  locale?: LocaleSettings;
}) => {
  const instance = useMemo(() => createMessages(emailMessages, locale), [locale]);
  return (
    <ServerMessagesProvider instance={instance} locale={locale}>
      {children}
    </ServerMessagesProvider>
  );
};
