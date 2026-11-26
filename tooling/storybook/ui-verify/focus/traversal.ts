import type { Page } from "@playwright/test";

import { settleAnimations } from "@merit/test-support/browser";

import type { FocusTraversal } from "../results.ts";
import type { CapturedStop } from "./judge.ts";
import type { FocusVisualSnapshot } from "./style-diff.ts";
import type { FocusedObservation } from "./tracker.ts";

export const MAX_TAB_STOPS = 40;

type ObservedStop = Pick<CapturedStop, "index" | "element"> & FocusedObservation;

type InitialFocus =
  | { kind: "none" }
  | { kind: "reset" }
  | { kind: "dialogStop"; stop: ObservedStop };

/**
 * Runs in the page. A focused control inside an open dialog is the first stop; any other focused
 * element, such as `<main tabindex="-1">` or a control outside an open dialog, is blurred so Tab
 * traversal inspects earlier controls from the start of the document.
 */
const observeInitialFocus = (): InitialFocus => {
  const tracker = window.__meritFocusTracker;
  const active = tracker?.deepActiveElement();
  if (
    !tracker ||
    !active ||
    active === document.body ||
    active === document.documentElement ||
    !tracker.isFocusable(active)
  ) {
    return { kind: "none" };
  }
  const isInsideOpenDialog = Boolean(
    active.closest('[role="dialog"], [role="alertdialog"], dialog[open]'),
  );
  if (active.tabIndex < 0 || !isInsideOpenDialog) {
    tracker.resetFocusToDocumentStart();
    return { kind: "reset" };
  }
  tracker.stops.push(active);
  return {
    kind: "dialogStop",
    stop: { index: 0, element: tracker.describeElement(active), ...tracker.observeFocused(active) },
  };
};

/** Where focus went after one Tab, with the previous stop's styles once focus left it. */
type TabOutcome =
  // A focus handler replaced the document, so its controls were never checked.
  | { kind: "trackerLost" }
  | { kind: "documentReached"; previousUnfocused?: FocusVisualSnapshot }
  | { kind: "opaqueFrame"; previousUnfocused?: FocusVisualSnapshot }
  | {
      kind: "cycled";
      index: number;
      refreshed?: FocusedObservation;
      previousUnfocused?: FocusVisualSnapshot;
    }
  | { kind: "cap"; previousUnfocused?: FocusVisualSnapshot }
  | { kind: "stop"; stop: ObservedStop; previousUnfocused?: FocusVisualSnapshot };

/** Runs in the page after a Tab press and records a newly reached stop. */
const observeTabOutcome = ({
  previousIndex,
  isAtCap,
}: {
  previousIndex: number;
  isAtCap: boolean;
}): TabOutcome => {
  const tracker = window.__meritFocusTracker;
  if (!tracker) {
    return { kind: "trackerLost" };
  }
  const active = tracker.deepActiveElement();
  const previousEl = previousIndex >= 0 ? tracker.stops[previousIndex] : undefined;
  const previousUnfocused =
    previousEl && previousEl !== active && previousEl.isConnected
      ? tracker.captureSnapshot(previousEl)
      : undefined;

  if (!active || active === document.body || active === document.documentElement) {
    return { kind: "documentReached", previousUnfocused };
  }
  if (tracker.isOpaqueFrame(active)) {
    return { kind: "opaqueFrame", previousUnfocused };
  }
  const existingIndex = tracker.stops.indexOf(active);
  if (existingIndex !== -1) {
    // Re-visiting index 0 after Tab gives us a genuine keyboard focus observation if it
    // started autofocused; refresh its paint and bounds with its styles, which may differ now.
    const refreshed = existingIndex === 0 ? tracker.observeFocused(active) : undefined;
    return { kind: "cycled", index: existingIndex, refreshed, previousUnfocused };
  }
  if (isAtCap) {
    return { kind: "cap", previousUnfocused };
  }
  const index = tracker.stops.length;
  tracker.stops.push(active);
  return {
    kind: "stop",
    stop: { index, element: tracker.describeElement(active), ...tracker.observeFocused(active) },
    previousUnfocused,
  };
};

type EndingOutcome = Exclude<TabOutcome, { kind: "stop" }>;

/** Traversal is complete when focus left the controls or came back around to one. */
const traversalEndFor = (outcome: EndingOutcome): FocusTraversal =>
  outcome.kind === "documentReached" || outcome.kind === "cycled"
    ? { complete: true }
    : { complete: false, reason: outcome.kind };

/** Records what a Tab revealed about stops already reached. */
const recordOutcome = (stops: CapturedStop[], outcome: TabOutcome): void => {
  const lastStop = stops.at(-1);
  const previousUnfocused = outcome.kind === "trackerLost" ? undefined : outcome.previousUnfocused;
  if (lastStop && previousUnfocused && !lastStop.unfocused) {
    lastStop.unfocused = previousUnfocused;
  }
  const firstStop = stops[0];
  if (outcome.kind === "cycled" && outcome.index === 0 && outcome.refreshed && firstStop) {
    Object.assign(firstStop, outcome.refreshed);
  }
};

const startFromDocumentStart = async (page: Page): Promise<CapturedStop[]> => {
  const initial = await page.evaluate(observeInitialFocus);
  if (initial.kind === "reset") {
    await settleAnimations(page);
  }
  return initial.kind === "dialogStop" ? [initial.stop] : [];
};

const pressTab = async (page: Page): Promise<void> => {
  await page.keyboard.press("Tab");
  await settleAnimations(page);
};

/**
 * Presses Tab through the page's stops with real keyboard events, capturing each stop focused
 * and once focus leaves it, until focus returns to the document or a stop already reached, or
 * traversal cannot finish.
 */
export const traverseTabStops = async (
  page: Page,
  maxStops: number,
): Promise<{ stops: CapturedStop[]; traversal: FocusTraversal }> => {
  const stops = await startFromDocumentStart(page);
  for (let step = 0; step <= maxStops; step += 1) {
    const isAtCap = stops.length >= maxStops;
    await pressTab(page);
    const outcome = await page.evaluate(observeTabOutcome, {
      previousIndex: stops.length - 1,
      isAtCap,
    });
    recordOutcome(stops, outcome);
    if (outcome.kind !== "stop") {
      return { stops, traversal: traversalEndFor(outcome) };
    }
    stops.push(outcome.stop);
  }
  return { stops, traversal: { complete: true } };
};

/** Runs in the page: blurs the stop when it still has focus, reporting whether it did. */
const blurStopIfFocused = (index: number): boolean => {
  const tracker = window.__meritFocusTracker;
  const el = tracker?.stops[index];
  if (
    !tracker ||
    !el?.isConnected ||
    tracker.deepActiveElement() !== el ||
    !tracker.isFocusable(el)
  ) {
    return false;
  }
  el.blur();
  return true;
};

/**
 * Runs in the page: the stop's current styles, unless it left the document or has focus again,
 * as when its blur handler takes focus back, so its styles are not an unfocused baseline.
 */
const snapshotUnfocusedStop = (index: number): FocusVisualSnapshot | undefined => {
  const tracker = window.__meritFocusTracker;
  const el = tracker?.stops[index];
  return tracker && el?.isConnected && tracker.deepActiveElement() !== el
    ? tracker.captureSnapshot(el)
    : undefined;
};

/** Captures the last stop's unfocused baseline when focus stayed on it, as a focus trap does. */
export const captureFinalBaseline = async (page: Page, stops: readonly CapturedStop[]) => {
  const finalStop = stops.at(-1);
  if (!finalStop || finalStop.unfocused) {
    return;
  }
  await pressTab(page);
  if (await page.evaluate(blurStopIfFocused, finalStop.index)) {
    await settleAnimations(page);
  }
  const finalUnfocused = await page.evaluate(snapshotUnfocusedStop, finalStop.index);
  if (finalUnfocused) {
    finalStop.unfocused = finalUnfocused;
  }
};

/** Runs in the page: every stop's styles while nothing has focus, or null if something does. */
const snapshotStopsWithNothingFocused = (): Array<FocusVisualSnapshot | null> | null => {
  const tracker = window.__meritFocusTracker;
  const active = tracker?.deepActiveElement();
  if (!tracker || (active && active !== document.body && active !== document.documentElement)) {
    return null;
  }
  return tracker.stops.map((el) => (el.isConnected ? tracker.captureSnapshot(el) : null));
};

/**
 * A baseline captured after Tab can carry the next stop's focus styles, such as
 * `button:has(+ button:focus-visible)`, so also capture each stop with nothing focused. Skipped
 * when the page moves focus back, as modal focus containment does.
 */
export const captureUnfocusedBaselines = async (page: Page, stops: readonly CapturedStop[]) => {
  if (stops.length === 0) {
    return;
  }
  await page.evaluate(() => window.__meritFocusTracker?.resetFocusToDocumentStart());
  await settleAnimations(page);
  const baselines = await page.evaluate(snapshotStopsWithNothingFocused);
  for (const stop of stops) {
    const baseline = baselines?.[stop.index];
    if (baseline) {
      stop.cleanUnfocused = baseline;
    }
  }
};
