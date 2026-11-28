import type { Page } from "@playwright/test";

import { settleAnimations } from "@merit/test-support/browser";

import type { FocusTraversal } from "../results.ts";
import type { CapturedStop } from "./judge.ts";
import type { FocusVisualSnapshot } from "./style-diff.ts";
import { type FocusedObservation, unlessDocumentReplaced } from "./tracker.ts";

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

/** The page's own handlers can navigate while animations settle, as a focus handler can. */
const settle = (page: Page): Promise<void> =>
  unlessDocumentReplaced(settleAnimations(page), undefined);

const startFromDocumentStart = async (page: Page): Promise<CapturedStop[]> => {
  const initial = await unlessDocumentReplaced(page.evaluate(observeInitialFocus), {
    kind: "none",
  } as const);
  if (initial.kind === "reset") {
    await settle(page);
  }
  return initial.kind === "dialogStop" ? [initial.stop] : [];
};

const pressTab = async (page: Page): Promise<void> => {
  await page.keyboard.press("Tab");
  await settle(page);
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
    const outcome = await unlessDocumentReplaced(
      page.evaluate(observeTabOutcome, { previousIndex: stops.length - 1, isAtCap }),
      { kind: "trackerLost" } as const,
    );
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

/** A baseline read, unless the page replaced its document since the stops were reached. */
type BaselineRead<T> = { kind: "trackerLost" } | { kind: "read"; baseline: T };

/**
 * Runs in the page: the stop's current styles, unless it left the document or has focus again,
 * as when its blur handler takes focus back, so its styles are not an unfocused baseline.
 */
const snapshotUnfocusedStop = (index: number): BaselineRead<FocusVisualSnapshot | undefined> => {
  const tracker = window.__meritFocusTracker;
  if (!tracker) {
    return { kind: "trackerLost" };
  }
  const el = tracker.stops[index];
  return {
    kind: "read",
    baseline:
      el?.isConnected && tracker.deepActiveElement() !== el
        ? tracker.captureSnapshot(el)
        : undefined,
  };
};

const COLLECTION_ITEM =
  '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
const COLLECTION = '[role="listbox"], [role="menu"]';

/**
 * Runs in the page: the arrow key that moves focus from the stop to a sibling item when the stop
 * is an item of an open list or menu, which keeps focus on its items rather than letting it blur.
 */
const siblingKeyForStop = ({
  index,
  item,
  collection,
}: {
  index: number;
  item: string;
  collection: string;
}): "ArrowDown" | "ArrowUp" | undefined => {
  const tracker = window.__meritFocusTracker;
  const el = tracker?.stops[index];
  if (!tracker || !el?.isConnected || tracker.deepActiveElement() !== el || !el.matches(item)) {
    return undefined;
  }
  const items = [...(el.closest(collection)?.querySelectorAll(item) ?? [])];
  const position = items.indexOf(el);
  if (position < 0 || items.length < 2) {
    return undefined;
  }
  return position < items.length - 1 ? "ArrowDown" : "ArrowUp";
};

/** Runs in the page: whether focus has moved from the stop to another item of its collection. */
const siblingHasFocus = ({
  index,
  item,
  collection,
}: {
  index: number;
  item: string;
  collection: string;
}) => {
  const tracker = window.__meritFocusTracker;
  const el = tracker?.stops[index];
  const active = tracker?.deepActiveElement();
  return Boolean(
    el &&
    active &&
    active !== el &&
    active.matches(item) &&
    // The sibling belongs to the same nearest collection, not to a nested one.
    active.closest(collection) === el.closest(collection),
  );
};

/** Why capturing baselines left the check incomplete. */
type BaselineGap = "siblingFocus" | "trackerLost";

/**
 * Captures the last stop's unfocused baseline when focus stayed on it, as a focus trap does. An
 * item of an open list or menu is compared with how it looks while a sibling item has focus,
 * because the collection returns focus to it when it is blurred. Reports `siblingFocus` when
 * focus did not reach a sibling, so the check is reported as incomplete rather than judged on a
 * focused baseline, and `trackerLost` when the page replaced its document meanwhile.
 */
export const captureFinalBaseline = async (
  page: Page,
  stops: readonly CapturedStop[],
): Promise<BaselineGap | undefined> => {
  const finalStop = stops.at(-1);
  if (!finalStop || finalStop.unfocused) {
    return undefined;
  }
  await pressTab(page);
  const siblingKey = await unlessDocumentReplaced(
    page.evaluate(siblingKeyForStop, {
      index: finalStop.index,
      item: COLLECTION_ITEM,
      collection: COLLECTION,
    }),
    undefined,
  );
  let reachedSibling = true;
  if (siblingKey) {
    await page.keyboard.press(siblingKey);
    reachedSibling = await page
      .waitForFunction(
        siblingHasFocus,
        { index: finalStop.index, item: COLLECTION_ITEM, collection: COLLECTION },
        { timeout: 2_000 },
      )
      .then(
        () => true,
        () => false,
      );
  } else if (
    await unlessDocumentReplaced(page.evaluate(blurStopIfFocused, finalStop.index), false)
  ) {
    await settle(page);
  }
  await settle(page);
  const finalUnfocused = await unlessDocumentReplaced(
    page.evaluate(snapshotUnfocusedStop, finalStop.index),
    { kind: "trackerLost" } as const,
  );
  if (finalUnfocused.kind === "trackerLost") {
    return "trackerLost";
  }
  if (finalUnfocused.baseline) {
    finalStop.unfocused = finalUnfocused.baseline;
  }
  return reachedSibling ? undefined : "siblingFocus";
};

/** Runs in the page: every stop's styles while nothing has focus, or null if something does. */
const snapshotStopsWithNothingFocused =
  (): BaselineRead<Array<FocusVisualSnapshot | null> | null> => {
    const tracker = window.__meritFocusTracker;
    if (!tracker) {
      return { kind: "trackerLost" };
    }
    const active = tracker.deepActiveElement();
    if (active && active !== document.body && active !== document.documentElement) {
      return { kind: "read", baseline: null };
    }
    return {
      kind: "read",
      baseline: tracker.stops.map((el) => (el.isConnected ? tracker.captureSnapshot(el) : null)),
    };
  };

/**
 * A baseline captured after Tab can carry the next stop's focus styles, such as
 * `button:has(+ button:focus-visible)`, so also capture each stop with nothing focused. Skipped
 * when the page moves focus back, as modal focus containment does. Reports `trackerLost` when the
 * page replaced its document meanwhile.
 */
export const captureUnfocusedBaselines = async (
  page: Page,
  stops: readonly CapturedStop[],
): Promise<"trackerLost" | undefined> => {
  if (stops.length === 0) {
    return undefined;
  }
  await unlessDocumentReplaced(
    page.evaluate(() => window.__meritFocusTracker?.resetFocusToDocumentStart()),
    undefined,
  );
  await settle(page);
  const baselines = await unlessDocumentReplaced(page.evaluate(snapshotStopsWithNothingFocused), {
    kind: "trackerLost",
  } as const);
  if (baselines.kind === "trackerLost") {
    return "trackerLost";
  }
  for (const stop of stops) {
    const baseline = baselines.baseline?.[stop.index];
    if (baseline) {
      stop.cleanUnfocused = baseline;
    }
  }
  return undefined;
};
