import type {} from "@merit/i18n/core";

import { en } from "./messages.en";

export const appMessages = { app: en };

declare module "@merit/i18n/core" {
  interface Messages {
    app: typeof en;
  }
}
