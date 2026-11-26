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
