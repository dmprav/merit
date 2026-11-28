import type { Page } from "@playwright/test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { CapturedStop } from "./judge.ts";
import { baseSnapshot, outlinedSnapshot } from "./snapshot.fixtures.ts";
import { captureFinalBaseline, captureUnfocusedBaselines, traverseTabStops } from "./traversal.ts";

/** Playwright's rejection of an evaluation whose document a navigation destroyed mid-call. */
const documentReplacedError = () =>
  new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation");

/**
 * A page holding one Tab stop that keeps focus after Tab, as a focus trap does. Its evaluations
 * run here against a stand-in window; `blur` either lets focus go or takes it straight back.
 * Evaluation `failAt` rejects with `failWith`; a navigation also replaces the window with an
 * empty one, as the new document has no tracker.
 */
const pageWithTrappedStop = ({
  refocusOnBlur,
  failAt,
  failWith = documentReplacedError(),
}: {
  refocusOnBlur: boolean;
  failAt?: number;
  failWith?: Error;
}) => {
  let focused = true;
  let evaluations = 0;
  const button = {
    isConnected: true,
    tabIndex: 0,
    matches: () => false,
    closest: () => null,
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
      resetFocusToDocumentStart: () => {
        focused = false;
      },
      // The button shows its focus outline only while it has focus.
      captureSnapshot: () => (focused ? outlinedSnapshot() : baseSnapshot()),
    },
  });
  const page = {
    evaluate: async (pageFunction: (arg: unknown) => unknown, arg?: unknown) => {
      evaluations += 1;
      if (evaluations === failAt) {
        if (failWith.message.includes("Execution context was destroyed")) {
          vi.stubGlobal("window", {});
        }
        throw failWith;
      }
      return pageFunction(arg);
    },
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

describe("a navigation that lands during an evaluation", () => {
  // Without a navigation, traversal reads the initial focus and resets it, settles, presses Tab,
  // settles, and reads that the document was reached.
  test.each([
    { step: "reading the initial focus", failAt: 1 },
    { step: "settling after the reset", failAt: 2 },
    { step: "settling after Tab", failAt: 3 },
    { step: "reading where Tab moved focus", failAt: 4 },
  ])("ends traversal with a lost tracker when it lands while $step", async ({ failAt }) => {
    const page = pageWithTrappedStop({ refocusOnBlur: false, failAt });

    await expect(traverseTabStops(page, 10)).resolves.toEqual({
      stops: [],
      traversal: { complete: false, reason: "trackerLost" },
    });
  });

  // Without a navigation, the final baseline settles after Tab, reads the sibling key, blurs the
  // stop, settles twice, and reads its styles.
  test.each([
    { step: "settling after Tab", failAt: 1 },
    { step: "reading the sibling key", failAt: 2 },
    { step: "blurring the stop", failAt: 3 },
    { step: "settling after blur", failAt: 4 },
    { step: "settling before the read", failAt: 5 },
    { step: "reading the stop's styles", failAt: 6 },
  ])(
    "reports a lost tracker for the final baseline when it lands while $step",
    async ({ failAt }) => {
      const stop = trappedStop();
      const page = pageWithTrappedStop({ refocusOnBlur: false, failAt });

      await expect(captureFinalBaseline(page, [stop])).resolves.toBe("trackerLost");
      expect(stop.unfocused).toBeUndefined();
    },
  );

  test.each([
    { step: "resetting focus", failAt: 1 },
    { step: "settling after the reset", failAt: 2 },
    { step: "reading the stops' styles", failAt: 3 },
  ])(
    "reports a lost tracker for the nothing-focused baselines when it lands while $step",
    async ({ failAt }) => {
      const stop = trappedStop();
      const page = pageWithTrappedStop({ refocusOnBlur: false, failAt });

      await expect(captureUnfocusedBaselines(page, [stop])).resolves.toBe("trackerLost");
      expect(stop.cleanUnfocused).toBeUndefined();
    },
  );

  test("rejects with an evaluation error that a navigation did not cause", async () => {
    const page = pageWithTrappedStop({
      refocusOnBlur: false,
      failAt: 2,
      failWith: new Error("page.evaluate: Target page closed"),
    });

    await expect(captureFinalBaseline(page, [trappedStop()])).rejects.toThrow("Target page closed");
  });
});
