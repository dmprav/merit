import type { ReactNode } from "react";

import { en as contacts } from "@merit/contacts-web/messages";
import { MessagesProvider } from "@merit/i18n";

import { en } from "./messages.en";

export const recommendationsMessages = { fundingRecommendations: en, contacts };
declare module "@merit/i18n/core" {
  interface Messages {
    fundingRecommendations: typeof en;
  }
}

export const Messages = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={recommendationsMessages}>{children}</MessagesProvider>
);
