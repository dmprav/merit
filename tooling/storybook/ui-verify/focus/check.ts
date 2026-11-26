import type { Page } from "@playwright/test";

import type { FocusCheckResult } from "../results.ts";
import { judgeStops } from "./judge.ts";
import { installFocusTracker } from "./tracker.ts";
import {
  captureFinalBaseline,
  captureUnfocusedBaselines,
  MAX_TAB_STOPS,
  traverseTabStops,
} from "./traversal.ts";

/**
 * Traverses Tab-reachable interactive elements via real keyboard Tab events and checks
 * bounding box visibility and focus indicator style changes against unfocused snapshots.
 */
export const checkKeyboardFocusTraversal = async (
  page: Page,
  maxStops = MAX_TAB_STOPS,
): Promise<FocusCheckResult> => {
  if (!(await installFocusTracker(page))) {
    // The page navigated before traversal began, so none of its controls were checked.
    return { stopsChecked: 0, traversal: { complete: false, reason: "trackerLost" }, failures: [] };
  }
  const { stops, traversal } = await traverseTabStops(page, maxStops);
  await captureFinalBaseline(page, stops);
  await captureUnfocusedBaselines(page, stops);
  return { stopsChecked: stops.length, traversal, failures: judgeStops(stops) };
};
