import { fn } from "storybook/test";

import type * as actual from "../activity.functions";

// Fail closed: each story supplies its own read outcomes.
export const readWorkspaceActivity = fn<
  (
    ...args: Parameters<typeof actual.readWorkspaceActivity>
  ) => ReturnType<typeof actual.readWorkspaceActivity>
>(async () => {
  throw new Error("Configure readWorkspaceActivity in the story");
});
