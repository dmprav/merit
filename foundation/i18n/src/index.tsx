import type { ResourceLanguage } from "i18next";
import { useMemo, type ReactNode } from "react";
import { I18nProvider } from "react-aria-components/I18nProvider";

import { createMessages, type LocaleSettings } from "./core";
import { ServerMessagesProvider, useLocaleSettings } from "./server";

export { createMessages, defaultLocale, type LocaleSettings } from "./core";
export { useLocaleSettings } from "./server";

export const MessagesProvider = ({
  messages,
  locale,
  children,
}: {
  messages: ResourceLanguage;
  locale?: LocaleSettings;
  children: ReactNode;
}) => {
  // Local resources initialize synchronously for SSR and hydration; no global instance.
  const inheritedLocale = useLocaleSettings();
  const settings = locale ?? inheritedLocale;
  const instance = useMemo(() => createMessages(messages, settings), [messages, settings]);
  return (
    <ServerMessagesProvider instance={instance} locale={settings}>
      <I18nProvider locale={settings.formatLocale}>{children}</I18nProvider>
    </ServerMessagesProvider>
  );
};
