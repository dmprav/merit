import type { ReactNode } from "react";

import { MessagesProvider } from "@merit/i18n";

import { en } from "./messages.en";

export { en } from "./messages.en";
const messages = { contacts: en };
declare module "@merit/i18n/core" {
  interface Messages {
    contacts: typeof en;
  }
}

export const ContactsMessagesProvider = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={messages}>{children}</MessagesProvider>
);
