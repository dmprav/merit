import { fn } from "storybook/test";

import type * as actual from "../search.functions";

// Fail closed: each story supplies its own search outcomes.
export const searchWorkspace = fn<
  (...args: Parameters<typeof actual.searchWorkspace>) => ReturnType<typeof actual.searchWorkspace>
>(async () => {
  throw new Error("Configure searchWorkspace in the story");
});
