import { fn } from "storybook/test";

import type * as actual from "../navigation.functions";

export const readNavigationPins = fn<
  (
    ...args: Parameters<typeof actual.readNavigationPins>
  ) => ReturnType<typeof actual.readNavigationPins>
>(async () => {
  throw new Error("Configure readNavigationPins in the story");
});
export const changeNavigationPin = fn<
  (
    ...args: Parameters<typeof actual.changeNavigationPin>
  ) => ReturnType<typeof actual.changeNavigationPin>
>(async () => {
  throw new Error("Configure changeNavigationPin in the story");
});
