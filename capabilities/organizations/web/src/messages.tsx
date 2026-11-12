import type { ReactNode } from "react";

import { MessagesProvider } from "@merit/i18n";

import { en } from "./messages.en";

export { en } from "./messages.en";
const organizationMessages = { team: en };

declare module "@merit/i18n/core" {
  interface Messages {
    team: typeof en;
  }
}

export const OrganizationMessagesProvider = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={organizationMessages}>{children}</MessagesProvider>
);
