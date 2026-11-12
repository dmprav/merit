import { fn } from "storybook/test";

import type * as actual from "../preparation.functions";

// Fail closed: each story supplies its mutation outcomes.
export const editRound = fn<
  (...args: Parameters<typeof actual.editRound>) => ReturnType<typeof actual.editRound>
>(async () => {
  throw new Error("Configure editRound in the story");
});
export const deleteRound = fn<
  (...args: Parameters<typeof actual.deleteRound>) => ReturnType<typeof actual.deleteRound>
>(async () => {
  throw new Error("Configure deleteRound in the story");
});
