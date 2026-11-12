import { fn } from "storybook/test";

import type * as actual from "../creation.functions";

// Fail closed: each story supplies its mutation outcomes.
export const createRound = fn<
  (...args: Parameters<typeof actual.createRound>) => ReturnType<typeof actual.createRound>
>(async () => {
  throw new Error("Configure createRound in the story");
});
export const createApplication = fn<
  (
    ...args: Parameters<typeof actual.createApplication>
  ) => ReturnType<typeof actual.createApplication>
>(async () => {
  throw new Error("Configure createApplication in the story");
});
