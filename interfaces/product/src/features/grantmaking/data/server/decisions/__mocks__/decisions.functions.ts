import { fn } from "storybook/test";

import type * as actual from "../decisions.functions";

// Fail closed: each story supplies its mutation outcomes.
export const recordDecision = fn<
  (...args: Parameters<typeof actual.recordDecision>) => ReturnType<typeof actual.recordDecision>
>(async () => {
  throw new Error("Configure recordDecision in the story");
});
