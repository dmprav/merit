import type { i18n } from "i18next";
import { createContext, useContext, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { defaultLocale, type LocaleSettings } from "./core";

export { createMessages, defaultLocale, type LocaleSettings } from "./core";

const LocaleContext = createContext<LocaleSettings>(defaultLocale);

export const useLocaleSettings = () => useContext(LocaleContext);

// The caller owns this instance for one render; no global translation state or browser controls.
export const ServerMessagesProvider = ({
  instance,
  locale,
  children,
}: {
  instance: i18n;
  locale: LocaleSettings;
  children: ReactNode;
}) => (
  <LocaleContext value={locale}>
    <I18nextProvider i18n={instance}>{children}</I18nextProvider>
  </LocaleContext>
);
