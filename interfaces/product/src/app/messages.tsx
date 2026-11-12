import type { ReactNode } from "react";

import { en as contacts } from "@merit/contacts-web/messages";
import { grantmakingMessages } from "@merit/grantmaking-web/messages";
import { createMessages, MessagesProvider, type LocaleSettings } from "@merit/i18n";
import { en as team } from "@merit/organizations-web/messages";

import { en as onboarding } from "../features/workspace/onboarding-messages.en";
import { en as web } from "./messages.en";

export const webMessages = { web, ...grantmakingMessages, onboarding, team, contacts };

export const webTranslator = (locale: LocaleSettings) =>
  createMessages(webMessages, locale).getFixedT(locale.language, [
    "web",
    "common",
    "team",
    "contacts",
    "onboarding",
  ]);

declare module "@merit/i18n/core" {
  interface Messages {
    web: typeof web;
    onboarding: typeof onboarding;
  }
}

export const WebMessagesProvider = ({ children }: { children: ReactNode }) => {
  return <MessagesProvider messages={webMessages}>{children}</MessagesProvider>;
};
