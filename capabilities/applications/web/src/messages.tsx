import type { ReactNode } from "react";

import { en as contacts } from "@merit/contacts-web/messages";
import { MessagesProvider } from "@merit/i18n";

import { en } from "./messages.en";

export const applicationsMessages = { applicationIntake: en, contacts };
declare module "@merit/i18n/core" {
  interface Messages {
    applicationIntake: typeof en;
  }
}

export const Messages = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={applicationsMessages}>{children}</MessagesProvider>
);
