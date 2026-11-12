import { fn } from "storybook/test";

import type * as actual from "../contacts.functions";

export const readContacts = fn<
  (...args: Parameters<typeof actual.readContacts>) => ReturnType<typeof actual.readContacts>
>(async () => {
  throw new Error("Configure readContacts in the story");
});
export const saveContact = fn<
  (...args: Parameters<typeof actual.saveContact>) => ReturnType<typeof actual.saveContact>
>(async () => {
  throw new Error("Configure saveContact in the story");
});
