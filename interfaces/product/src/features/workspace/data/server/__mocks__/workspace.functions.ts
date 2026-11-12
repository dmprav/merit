import { fn } from "storybook/test";

import type * as actual from "../workspace.functions";

// Fail closed: each story supplies its own read and mutation outcomes.
export const readWorkspace = fn<
  (...args: Parameters<typeof actual.readWorkspace>) => ReturnType<typeof actual.readWorkspace>
>(async () => {
  throw new Error("Configure readWorkspace in the story");
});
