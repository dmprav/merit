import type { Page } from "@playwright/test";

import {
  capReachedLabel,
  INCOMPLETE_TRAVERSAL_REASONS,
  type FocusCheckResult,
} from "../results.ts";
import { judgeStops } from "./judge.ts";
import { installFocusTracker } from "./tracker.ts";
import {
  captureFinalBaseline,
  captureUnfocusedBaselines,
  MAX_TAB_STOPS,
  traverseTabStops,
  type FocusTraversal,
} from "./traversal.ts";

const traversalFields = (traversal: FocusTraversal, stopsChecked: number) => {
  if (traversal.complete) {
    return { reachedCap: false };
  }
  if (traversal.reason === "cap") {
    return { reachedCap: true, incompleteReason: capReachedLabel(stopsChecked) };
  }
  return { reachedCap: false, incompleteReason: INCOMPLETE_TRAVERSAL_REASONS[traversal.reason] };
};

/**
 * Traverses Tab-reachable interactive elements via real keyboard Tab events and checks
 * bounding box visibility and focus indicator style changes against unfocused snapshots.
 */
export const checkKeyboardFocusTraversal = async (
  page: Page,
  maxStops = MAX_TAB_STOPS,
): Promise<FocusCheckResult> => {
  await installFocusTracker(page);
  const { stops, traversal } = await traverseTabStops(page, maxStops);
  await captureFinalBaseline(page, stops);
  await captureUnfocusedBaselines(page, stops);
  return {
    stopsChecked: stops.length,
    ...traversalFields(traversal, stops.length),
    failures: judgeStops(stops),
  };
};
