import type { ReactNode } from "react";

import { createMessages, MessagesProvider, type LocaleSettings } from "@merit/i18n";

import { en } from "./messages.en";

const adminMessages = { administration: en };

export const adminTranslator = (locale: LocaleSettings) =>
  createMessages(adminMessages, locale).getFixedT(locale.language, ["administration", "common"]);

declare module "@merit/i18n/core" {
  interface Messages {
    administration: typeof en;
  }
}

export const AdminMessages = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={adminMessages}>{children}</MessagesProvider>
);
