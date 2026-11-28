import type { Page } from "@playwright/test";

import type { FocusCheckResult, FocusTraversal } from "../results.ts";
import { judgeStops, type CapturedStop } from "./judge.ts";
import { installFocusTracker } from "./tracker.ts";
import {
  captureFinalBaseline,
  captureUnfocusedBaselines,
  MAX_TAB_STOPS,
  traverseTabStops,
} from "./traversal.ts";

const TRACKER_LOST = { complete: false, reason: "trackerLost" } as const;

/**
 * Captures the baselines the stops are judged against, returning the traversal as they leave it.
 * Once the page has replaced its document, the stops are gone and no further baseline is read.
 */
const captureBaselines = async (
  page: Page,
  stops: CapturedStop[],
  traversal: FocusTraversal,
): Promise<FocusTraversal> => {
  if (!traversal.complete && traversal.reason === "trackerLost") {
    return traversal;
  }
  const finalGap = await captureFinalBaseline(page, stops);
  if (finalGap === "trackerLost") {
    return TRACKER_LOST;
  }
  if ((await captureUnfocusedBaselines(page, stops)) === "trackerLost") {
    return TRACKER_LOST;
  }
  return traversal.complete && finalGap === "siblingFocus"
    ? { complete: false, reason: "siblingFocus" }
    : traversal;
};

/**
 * Traverses Tab-reachable interactive elements via real keyboard Tab events and checks
 * bounding box visibility and focus indicator style changes against unfocused snapshots. A page
 * that replaces its document at any point reports `trackerLost`, keeping the stops it reached.
 */
export const checkKeyboardFocusTraversal = async (
  page: Page,
  maxStops = MAX_TAB_STOPS,
): Promise<FocusCheckResult> => {
  if (!(await installFocusTracker(page))) {
    // The page navigated before traversal began, so none of its controls were checked.
    return { stopsChecked: 0, traversal: TRACKER_LOST, failures: [] };
  }
  const tabs = await traverseTabStops(page, maxStops);
  const traversal = await captureBaselines(page, tabs.stops, tabs.traversal);
  return { stopsChecked: tabs.stops.length, traversal, failures: judgeStops(tabs.stops) };
};
