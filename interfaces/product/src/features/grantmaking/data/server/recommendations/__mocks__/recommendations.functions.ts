import { fn } from "storybook/test";

import type * as actual from "../recommendations.functions";

// Fail closed: each story supplies its mutation outcomes.
export const saveRecommendation = fn<
  (
    ...args: Parameters<typeof actual.saveRecommendation>
  ) => ReturnType<typeof actual.saveRecommendation>
>(async () => {
  throw new Error("Configure saveRecommendation in the story");
});
