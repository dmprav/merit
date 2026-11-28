import type { Page } from "@playwright/test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { CapturedStop } from "./judge.ts";
import { baseSnapshot, outlinedSnapshot } from "./snapshot.fixtures.ts";
import { captureFinalBaseline } from "./traversal.ts";

/**
 * A page holding one Tab stop that keeps focus after Tab, as a focus trap does. Its evaluations
 * run here against a stand-in window; `blur` either lets focus go or takes it straight back.
 */
const pageWithTrappedStop = ({ refocusOnBlur }: { refocusOnBlur: boolean }) => {
  let focused = true;
  const button = {
    isConnected: true,
    matches: () => false,
    blur: () => {
      focused = refocusOnBlur;
    },
  };
  vi.stubGlobal("document", { getAnimations: () => [] });
  vi.stubGlobal("window", {
    __meritFocusTracker: {
      stops: [button],
      deepActiveElement: () => (focused ? button : null),
      isFocusable: () => true,
      // The button shows its focus outline only while it has focus.
      captureSnapshot: () => (focused ? outlinedSnapshot() : baseSnapshot()),
    },
  });
  const page = {
    evaluate: async (pageFunction: (arg: unknown) => unknown, arg?: unknown) => pageFunction(arg),
    keyboard: { press: async () => undefined },
  };
  return page as unknown as Page;
};

const trappedStop = (): CapturedStop => ({
  index: 0,
  element: 'button "Close"',
  boundingBox: { width: 80, height: 32 },
  painted: true,
  focused: outlinedSnapshot(),
});

/**
 * A page whose last Tab stop is the first option of an open listbox. Blurring is undone by the
 * listbox, so only an arrow key moves focus, to the second option when `arrowMoves` is true.
 */
const pageWithListOption = ({
  arrowMoves,
  nested = false,
}: {
  arrowMoves: boolean;
  nested?: boolean;
}) => {
  const options: Array<Record<string, unknown>> = [];
  const listbox = { querySelectorAll: () => options };
  // When `nested` is set, the item focus moves to belongs to a nested collection.
  const nestedListbox = { querySelectorAll: () => [] };
  for (let index = 0; index < 2; index += 1) {
    const owner = nested && index === 1 ? nestedListbox : listbox;
    options.push({
      isConnected: true,
      matches: () => true,
      closest: () => owner,
      blur: () => undefined,
    });
  }
  let active = options[0];
  vi.stubGlobal("document", { getAnimations: () => [] });
  vi.stubGlobal("window", {
    __meritFocusTracker: {
      stops: [options[0]],
      deepActiveElement: () => active,
      isFocusable: () => true,
      captureSnapshot: (el: unknown) => (el === active ? outlinedSnapshot() : baseSnapshot()),
    },
  });
  const keys: string[] = [];
  const page = {
    evaluate: async (pageFunction: (arg: unknown) => unknown, arg?: unknown) => pageFunction(arg),
    keyboard: {
      press: async (key: string) => {
        keys.push(key);
        if (key === "ArrowDown" && arrowMoves) {
          active = options[1];
        }
      },
    },
    waitForFunction: async (pageFunction: (arg: unknown) => unknown, arg?: unknown) => {
      if (!pageFunction(arg)) {
        throw new Error("timed out");
      }
    },
  };
  return { page: page as unknown as Page, keys };
};

const optionStop = (): CapturedStop => ({ ...trappedStop(), element: 'div[role=option] "Alpha"' });

describe("capturing a list item's unfocused baseline", () => {
  test("compares the item with how it looks while its sibling has focus", async () => {
    const stop = optionStop();
    const { page, keys } = pageWithListOption({ arrowMoves: true });

    await expect(captureFinalBaseline(page, [stop])).resolves.toBeUndefined();

    expect(keys).toEqual(["Tab", "ArrowDown"]);
    expect(stop.unfocused).toEqual(baseSnapshot());
  });

  test("does not treat an item of a nested collection as a sibling", async () => {
    const stop = optionStop();
    const { page } = pageWithListOption({ arrowMoves: true, nested: true });

    await expect(captureFinalBaseline(page, [stop])).resolves.toBe("siblingFocus");
  });

  test("reports an incomplete comparison when focus does not reach a sibling", async () => {
    const stop = optionStop();
    const { page } = pageWithListOption({ arrowMoves: false });

    await expect(captureFinalBaseline(page, [stop])).resolves.toBe("siblingFocus");

    expect(stop.unfocused).toBeUndefined();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("capturing the final stop's unfocused baseline", () => {
  test("captures the baseline once blur leaves the stop unfocused", async () => {
    const stop = trappedStop();

    await captureFinalBaseline(pageWithTrappedStop({ refocusOnBlur: false }), [stop]);

    expect(stop.unfocused).toEqual(baseSnapshot());
  });

  test("leaves the baseline unset when the stop takes focus back on blur", async () => {
    const stop = trappedStop();

    await captureFinalBaseline(pageWithTrappedStop({ refocusOnBlur: true }), [stop]);

    expect(stop.unfocused).toBeUndefined();
  });
});
