import type { ReactNode } from "react";

import { applicationsMessages } from "@merit/applications-web/messages";
import { en as contacts } from "@merit/contacts-web/messages";
import { MessagesProvider } from "@merit/i18n";

import { en } from "./messages.en";
import { en as reviewer } from "./views/reviewer/messages.en";
import { en as reviews } from "./views/reviews/messages.en";

export const reviewsMessages = {
  ...applicationsMessages,
  reviewGrant: en,
  contacts,
  reviews,
  reviewer,
};
declare module "@merit/i18n/core" {
  interface Messages {
    reviewGrant: typeof en;
    reviews: typeof reviews;
    reviewer: typeof reviewer;
  }
}

export const Messages = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={reviewsMessages}>{children}</MessagesProvider>
);
