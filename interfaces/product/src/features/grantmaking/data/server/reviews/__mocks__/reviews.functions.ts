import { fn } from "storybook/test";

import type * as actual from "../reviews.functions";

export const saveReview = fn<
  (...args: Parameters<typeof actual.saveReview>) => ReturnType<typeof actual.saveReview>
>(async () => {
  throw new Error("Configure saveReview in the story");
});
