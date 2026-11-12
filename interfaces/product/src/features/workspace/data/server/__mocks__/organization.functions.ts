import { fn } from "storybook/test";

import type * as actual from "../organization.functions";

// Fail closed: each story supplies its own read and mutation outcomes.
export const readWorkspaces = fn<
  (...args: Parameters<typeof actual.readWorkspaces>) => ReturnType<typeof actual.readWorkspaces>
>(async () => {
  throw new Error("Configure readWorkspaces in the story");
});
export const readInvitation = fn<
  (...args: Parameters<typeof actual.readInvitation>) => ReturnType<typeof actual.readInvitation>
>(async () => {
  throw new Error("Configure readInvitation in the story");
});
export const acceptInvitation = fn<
  (
    ...args: Parameters<typeof actual.acceptInvitation>
  ) => ReturnType<typeof actual.acceptInvitation>
>(async () => {
  throw new Error("Configure acceptInvitation in the story");
});
