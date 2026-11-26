import type { Page } from "@playwright/test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { checkKeyboardFocusTraversal } from "./check.ts";

/**
 * A page whose evaluations run here against a stand-in window. Before evaluation `replaceBefore`
 * the window is replaced with an empty one, as when the page navigates to a new document.
 */
const pageReplacingDocument = (replaceBefore: number) => {
  let evaluations = 0;
  const pressed: string[] = [];
  vi.stubGlobal("window", {});
  const page = {
    evaluate: async (pageFunction: (arg: unknown) => unknown, arg?: unknown) => {
      evaluations += 1;
      if (evaluations === replaceBefore) {
        vi.stubGlobal("window", {});
      }
      return pageFunction(arg);
    },
    keyboard: {
      press: async (key: string) => {
        pressed.push(key);
      },
    },
  };
  return { page: page as unknown as Page, pressed };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("installing the focus tracker", () => {
  test.each([
    { replaced: "between snapshot capture and the focus locator", replaceBefore: 2 },
    { replaced: "between the focus locator and the focus tracker", replaceBefore: 3 },
  ])(
    "reports a lost tracker when the document is replaced $replaced",
    async ({ replaceBefore }) => {
      const { page, pressed } = pageReplacingDocument(replaceBefore);

      await expect(checkKeyboardFocusTraversal(page)).resolves.toEqual({
        stopsChecked: 0,
        traversal: { complete: false, reason: "trackerLost" },
        failures: [],
      });
      expect(pressed).toEqual([]);
    },
  );
});
