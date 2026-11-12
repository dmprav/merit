import { createInstance, type ResourceLanguage } from "i18next";

import { common } from "./en";

// Apps extend this registry with their own catalogs, without runtime dependencies here.
export interface Messages {
  common: typeof common;
}

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: Messages;
    strictKeyChecks: true;
    strictInterpolationChecks: true;
  }
}

export const defaultLocale = { language: "en", formatLocale: "en-GB" } as const;

export type LocaleSettings = {
  readonly language: typeof defaultLocale.language;
  readonly formatLocale: string;
};

export const createMessages = (
  messages: ResourceLanguage,
  locale: LocaleSettings = defaultLocale,
) => {
  const instance = createInstance();
  void instance.init({
    lng: locale.language,
    fallbackLng: "en",
    supportedLngs: ["en"],
    resources: { en: structuredClone({ common, ...messages }) },
    ns: [...Object.keys(messages), "common"],
    defaultNS: "common",
    initAsync: false,
    interpolation: { escapeValue: false }, // React escapes rendered text.
  });

  return instance;
};
