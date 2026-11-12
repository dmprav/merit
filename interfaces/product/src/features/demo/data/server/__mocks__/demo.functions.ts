import { fn } from "storybook/test";

import type * as actual from "../demo.functions";

export const readDemo = fn<
  (...args: Parameters<typeof actual.readDemo>) => ReturnType<typeof actual.readDemo>
>(async () => {
  throw new Error("Configure readDemo in the story");
});
export const startDemo = fn<
  (...args: Parameters<typeof actual.startDemo>) => ReturnType<typeof actual.startDemo>
>(async () => {
  throw new Error("Configure startDemo in the story");
});
