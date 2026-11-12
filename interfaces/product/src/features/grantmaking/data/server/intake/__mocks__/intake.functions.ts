import { fn } from "storybook/test";

import type * as actual from "../intake.functions";

// Fail closed: each story supplies its mutation outcomes.
export const editApplication = fn<
  (...args: Parameters<typeof actual.editApplication>) => ReturnType<typeof actual.editApplication>
>(async () => {
  throw new Error("Configure editApplication in the story");
});
