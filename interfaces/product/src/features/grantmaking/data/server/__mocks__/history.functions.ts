import { fn } from "storybook/test";

import type * as actual from "../history.functions";

export const readApplicationHistory = fn<
  (
    ...args: Parameters<typeof actual.readApplicationHistory>
  ) => ReturnType<typeof actual.readApplicationHistory>
>(async () => {
  throw new Error("Configure readApplicationHistory in the story");
});

export const readBudgetHistory = fn<
  (
    ...args: Parameters<typeof actual.readBudgetHistory>
  ) => ReturnType<typeof actual.readBudgetHistory>
>(async () => {
  throw new Error("Configure readBudgetHistory in the story");
});
