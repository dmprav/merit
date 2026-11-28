import type { Page } from "@playwright/test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { checkKeyboardFocusTraversal } from "./check.ts";

/** Playwright's rejection of an evaluation whose document a navigation destroyed mid-call. */
const DOCUMENT_REPLACED_MESSAGE =
  "page.evaluate: Execution context was destroyed, most likely because of a navigation";

/**
 * A page whose evaluations run here against a stand-in window. Before evaluation `replaceBefore`
 * the window is replaced with an empty one, as when the page navigates to a new document. When
 * `rejectWith` is given, that evaluation then rejects with it, as when the navigation commits
 * while the evaluation runs.
 */
const pageReplacingDocument = (replaceBefore: number, rejectWith?: Error) => {
  let evaluations = 0;
  const pressed: string[] = [];
  vi.stubGlobal("window", {});
  const page = {
    evaluate: async (pageFunction: (arg: unknown) => unknown, arg?: unknown) => {
      evaluations += 1;
      if (evaluations === replaceBefore) {
        vi.stubGlobal("window", {});
        if (rejectWith) {
          throw rejectWith;
        }
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

  test.each([
    { step: "snapshot capture", replaceBefore: 1 },
    { step: "the focus locator", replaceBefore: 2 },
    { step: "the focus tracker", replaceBefore: 3 },
    { step: "the wait for a rendering update", replaceBefore: 4 },
  ])(
    "reports a lost tracker when the document is replaced while installing $step",
    async ({ replaceBefore }) => {
      const { page, pressed } = pageReplacingDocument(
        replaceBefore,
        new Error(DOCUMENT_REPLACED_MESSAGE),
      );

      await expect(checkKeyboardFocusTraversal(page)).resolves.toEqual({
        stopsChecked: 0,
        traversal: { complete: false, reason: "trackerLost" },
        failures: [],
      });
      expect(pressed).toEqual([]);
    },
  );

  test("rejects with an evaluation error that a navigation did not cause", async () => {
    const { page } = pageReplacingDocument(1, new Error("page.evaluate: Target page closed"));

    await expect(checkKeyboardFocusTraversal(page)).rejects.toThrow("Target page closed");
  });
});
