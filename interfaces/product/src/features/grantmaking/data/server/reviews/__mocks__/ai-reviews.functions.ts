import { fn } from "storybook/test";

import type * as actual from "../ai-reviews.functions";

export const runAiReview = fn<
  (...args: Parameters<typeof actual.runAiReview>) => ReturnType<typeof actual.runAiReview>
>(async () => {
  throw new Error("Configure runAiReview in the story");
});
