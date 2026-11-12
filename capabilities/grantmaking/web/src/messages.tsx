import type { ReactNode } from "react";

import { applicationsMessages } from "@merit/applications-web/messages";
import { en as contacts } from "@merit/contacts-web/messages";
import { MessagesProvider } from "@merit/i18n";
import { recommendationsMessages } from "@merit/recommendations-web/messages";
import { reviewsMessages } from "@merit/reviews-web/messages";
import { roundsMessages } from "@merit/rounds-web/messages";

import { en } from "./messages.en";

export const grantmakingMessages = {
  ...roundsMessages,
  ...applicationsMessages,
  ...recommendationsMessages,
  ...reviewsMessages,
  fundingRounds: en,
  contacts,
};
declare module "@merit/i18n/core" {
  interface Messages {
    fundingRounds: typeof en;
  }
}

export const GrantmakingMessagesProvider = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={grantmakingMessages}>{children}</MessagesProvider>
);
