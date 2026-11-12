import { fn } from "storybook/test";

import type * as actual from "../funding-round.functions";

// Fail closed: each story supplies its own read outcomes.
export const readFundingRounds = fn<
  (
    ...args: Parameters<typeof actual.readFundingRounds>
  ) => ReturnType<typeof actual.readFundingRounds>
>(async () => {
  throw new Error("Configure readFundingRounds in the story");
});
export const readFundingRoundPage = fn<
  (
    ...args: Parameters<typeof actual.readFundingRoundPage>
  ) => ReturnType<typeof actual.readFundingRoundPage>
>(async () => {
  throw new Error("Configure readFundingRoundPage in the story");
});
export const readFundingApplicationPage = fn<
  (
    ...args: Parameters<typeof actual.readFundingApplicationPage>
  ) => ReturnType<typeof actual.readFundingApplicationPage>
>(async () => {
  throw new Error("Configure readFundingApplicationPage in the story");
});

export const readWorkspaceApplications = fn<
  (
    ...args: Parameters<typeof actual.readWorkspaceApplications>
  ) => ReturnType<typeof actual.readWorkspaceApplications>
>(async () => {
  throw new Error("Configure readWorkspaceApplications in the story");
});
