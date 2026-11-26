import type { ReactNode } from "react";

import { MessagesProvider } from "@merit/i18n";

import { decisionsMessages } from "./views/decisions/messages.en";

export const decisionsAppMessages = { committeeDecisions: decisionsMessages };
declare module "@merit/i18n/core" {
  interface Messages {
    committeeDecisions: typeof decisionsMessages;
  }
}

export const Messages = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={decisionsAppMessages}>{children}</MessagesProvider>
);
