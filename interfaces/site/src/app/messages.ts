import { createMessages, type LocaleSettings } from "@merit/i18n";
import { accessRequest } from "@merit/organizations-web/access-request-messages";

import { en } from "./messages.en";

export const siteMessages = { site: en, accessRequest };

export const siteTranslator = (locale: LocaleSettings) =>
  createMessages(siteMessages, locale).getFixedT(locale.language, ["site", "common"]);

declare module "@merit/i18n/core" {
  interface Messages {
    site: typeof en;
  }
}
