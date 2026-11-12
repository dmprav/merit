import { createMessages, type LocaleSettings } from "@merit/i18n";

import { en } from "./messages.en";

export const siteMessages = { site: en };

export const siteTranslator = (locale: LocaleSettings) =>
  createMessages(siteMessages, locale).getFixedT(locale.language, ["site", "common"]);

declare module "@merit/i18n/core" {
  interface Messages {
    site: typeof en;
  }
}
