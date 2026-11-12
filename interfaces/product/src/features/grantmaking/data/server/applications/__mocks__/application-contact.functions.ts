import { fn } from "storybook/test";

import type * as actual from "../application-contact.functions";

export const selectContact = fn<
  (...args: Parameters<typeof actual.selectContact>) => ReturnType<typeof actual.selectContact>
>(async () => {
  throw new Error("Configure selectContact in the story");
});
