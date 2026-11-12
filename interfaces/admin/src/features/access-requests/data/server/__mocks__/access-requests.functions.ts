import { fn } from "storybook/test";

import type * as actual from "../access-requests.functions";

export const readAccessRequests = fn<
  (
    ...args: Parameters<typeof actual.readAccessRequests>
  ) => ReturnType<typeof actual.readAccessRequests>
>(async () => {
  throw new Error("Configure readAccessRequests in the story");
});

export const reviewAccessRequest = fn<
  (
    ...args: Parameters<typeof actual.reviewAccessRequest>
  ) => ReturnType<typeof actual.reviewAccessRequest>
>(async () => {
  throw new Error("Configure reviewAccessRequest in the story");
});
