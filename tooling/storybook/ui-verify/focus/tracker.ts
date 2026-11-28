import type { Page } from "@playwright/test";

import { waitForRenderUpdate } from "../render-update.ts";
import type { CapturedStop } from "./judge.ts";
import type { ElementStyleSnapshot, FocusVisualSnapshot } from "./style-diff.ts";

// Playwright serializes each function passed to `page.evaluate` on its own, so code that runs in
// the page cannot call module helpers. Each installer below defines its helpers inline and
// leaves them on `window` for the next installer and for traversal to call.

/** How far a snapshot reaches around the focused element for focus cues drawn on relatives. */
const SNAPSHOT_LIMITS = { ancestorDepth: 3, descendantDepth: 2, maxDescendants: 12 };

type SnapshotLimits = typeof SNAPSHOT_LIMITS;

/** What a focused element shows: its size, whether it can paint, and its focus styles. */
export type FocusedObservation = Pick<CapturedStop, "boundingBox" | "painted" | "focused">;

type SnapshotCapture = {
  captureSnapshot: (el: Element) => FocusVisualSnapshot;
};

type FocusLocator = {
  /** The focused element, inside shadow roots and same-origin frames. */
  deepActiveElement: () => Element | null;
  isFocusable: (el: Element) => el is HTMLElement | SVGElement;
  /** Whether the element is a frame whose document belongs to another origin. */
  isOpaqueFrame: (el: Element) => boolean;
  resetFocusToDocumentStart: () => void;
};

/** Reads and moves focus inside the page and remembers the stops traversal reached. */
type MeritFocusTracker = SnapshotCapture &
  FocusLocator & {
    stops: Element[];
    describeElement: (el: Element) => string;
    observeFocused: (el: Element) => FocusedObservation;
  };

declare global {
  interface Window {
    __meritSnapshotCapture?: SnapshotCapture;
    __meritFocusLocator?: FocusLocator;
    __meritFocusTracker?: MeritFocusTracker;
  }
}

/** Runs in the page: installs how a snapshot reads the styles that can paint a focus cue. */
const defineSnapshotCapture = (limits: SnapshotLimits) => {
  const pickStyle = (style: CSSStyleDeclaration, pseudo: boolean): ElementStyleSnapshot => ({
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineColor: style.outlineColor,
    outlineOffset: style.outlineOffset,
    boxShadow: style.boxShadow,
    borderTopColor: style.borderTopColor,
    borderRightColor: style.borderRightColor,
    borderBottomColor: style.borderBottomColor,
    borderLeftColor: style.borderLeftColor,
    borderTopWidth: style.borderTopWidth,
    borderRightWidth: style.borderRightWidth,
    borderBottomWidth: style.borderBottomWidth,
    borderLeftWidth: style.borderLeftWidth,
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    textDecorationLine: style.textDecorationLine,
    textDecorationThickness: style.textDecorationThickness,
    ...(pseudo ? { content: style.content, opacity: style.opacity } : {}),
  });

  const styleOf = (el: Element, pseudo?: string): ElementStyleSnapshot =>
    pickStyle((el.ownerDocument.defaultView ?? window).getComputedStyle(el, pseudo), !!pseudo);

  const ancestorStyles = (el: Element): ElementStyleSnapshot[] => {
    const styles: ElementStyleSnapshot[] = [];
    const { body, documentElement } = el.ownerDocument;
    let parent = el.parentElement;
    while (
      styles.length < limits.ancestorDepth &&
      parent &&
      parent !== body &&
      parent !== documentElement
    ) {
      styles.push(styleOf(parent));
      parent = parent.parentElement;
    }
    return styles;
  };

  // Breadth first, so the nearest descendants fill the limit.
  const descendantStyles = (el: Element): ElementStyleSnapshot[] => {
    const styles: ElementStyleSnapshot[] = [];
    const queue = Array.from(el.children, (node) => ({ node, depth: 1 }));
    for (
      let next = queue.shift();
      next && styles.length < limits.maxDescendants;
      next = queue.shift()
    ) {
      styles.push(styleOf(next.node));
      if (next.depth < limits.descendantDepth) {
        const depth = next.depth + 1;
        queue.push(...Array.from(next.node.children, (node) => ({ node, depth })));
      }
    }
    return styles;
  };

  window.__meritSnapshotCapture = {
    captureSnapshot: (el) => ({
      self: styleOf(el),
      before: styleOf(el, "::before"),
      after: styleOf(el, "::after"),
      ancestors: ancestorStyles(el),
      descendants: descendantStyles(el),
    }),
  };
};

/** Runs in the page: installs how traversal finds focus and returns it to the document start. */
const defineFocusLocator = () => {
  const isFrame = (el: Element): el is HTMLIFrameElement =>
    el.tagName === "IFRAME" || el.tagName === "FRAME";

  const frameDocument = (el: Element): Document | null => {
    try {
      return isFrame(el) ? el.contentDocument : null;
    } catch {
      return null;
    }
  };

  /** The element a frame's own document has focused, when it has focused one. */
  const frameActiveElement = (el: Element): Element | null => {
    const innerDocument = frameDocument(el);
    const active = innerDocument?.activeElement;
    if (!innerDocument || !active) {
      return null;
    }
    return active !== innerDocument.body && active !== innerDocument.documentElement
      ? active
      : null;
  };

  // Descends through shadow roots and same-origin frames, whose documents keep their own
  // active element while the outer document reports only the host or frame.
  const deepActiveElement = (): Element | null => {
    let current: Element | null = document.activeElement;
    let inner = current && (current.shadowRoot?.activeElement ?? frameActiveElement(current));
    while (inner) {
      current = inner;
      inner = current.shadowRoot?.activeElement ?? frameActiveElement(current);
    }
    return current;
  };

  // Frame content belongs to another realm, so check against that document's constructors.
  const isFocusable = (el: Element): el is HTMLElement | SVGElement => {
    const view = el.ownerDocument.defaultView;
    return Boolean(view && (el instanceof view.HTMLElement || el instanceof view.SVGElement));
  };

  const resetFocusToDocumentStart = () => {
    const active = deepActiveElement();
    if (active && isFocusable(active)) {
      active.blur();
    }
    // Calling blur() alone leaves Chromium's sequential focus navigation starting point
    // at the blurred element; briefly focusing document.body resets Tab order to the top.
    const { body } = document;
    if (!body) {
      return;
    }
    const previousBodyTabIndex = body.getAttribute("tabindex");
    body.setAttribute("tabindex", "-1");
    body.focus({ preventScroll: true });
    body.blur();
    if (previousBodyTabIndex === null) {
      body.removeAttribute("tabindex");
    } else {
      body.setAttribute("tabindex", previousBodyTabIndex);
    }
  };

  window.__meritFocusLocator = {
    deepActiveElement,
    isFocusable,
    isOpaqueFrame: (el) => isFrame(el) && frameDocument(el) === null,
    resetFocusToDocumentStart,
  };
};

/**
 * Runs in the page: combines snapshot capture and the focus locator into the focus tracker, and
 * reports false when either is missing because the document was replaced after it was installed.
 */
const defineFocusTracker = (): boolean => {
  const capture = window.__meritSnapshotCapture;
  const locator = window.__meritFocusLocator;
  if (!capture || !locator) {
    return false;
  }

  const describeElement = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const ariaLabel = el.getAttribute("aria-label");
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    const label = ariaLabel || text || el.getAttribute("placeholder") || el.id || "";
    const prefix = role ? `${tag}[role=${role}]` : tag;
    return label ? `${prefix} "${label}"` : prefix;
  };

  const observeFocused = (el: Element): FocusedObservation => {
    const rect = el.getBoundingClientRect();
    return {
      boundingBox: { width: rect.width, height: rect.height },
      // A control with positive size still paints nothing, its outline included, when it or an
      // ancestor is fully transparent.
      painted: el.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
      focused: capture.captureSnapshot(el),
    };
  };

  window.__meritFocusTracker = {
    ...capture,
    ...locator,
    stops: [],
    describeElement,
    observeFocused,
  };
  delete window.__meritSnapshotCapture;
  delete window.__meritFocusLocator;
  return true;
};

/** Playwright rejects an evaluation this way when a navigation destroys its document mid-call. */
const isDocumentReplacedError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("Execution context was destroyed");

/**
 * Settles a step that runs in the page with `whenReplaced` when a navigation replaced the
 * document during it, which is what the step reports for a document without the focus tracker.
 * The new document has no tracker, so the next step that reads it reports the loss, as it does
 * for a navigation that lands between steps.
 */
export const unlessDocumentReplaced = async <T>(step: Promise<T>, whenReplaced: T): Promise<T> => {
  try {
    return await step;
  } catch (error) {
    if (isDocumentReplacedError(error)) {
      return whenReplaced;
    }
    throw error;
  }
};

const installInPage = async (page: Page): Promise<boolean> => {
  await page.evaluate(defineSnapshotCapture, SNAPSHOT_LIMITS);
  await page.evaluate(defineFocusLocator);
  if (!(await page.evaluate(defineFocusTracker))) {
    return false;
  }
  // Chromium applies a pending `autofocus` in the next rendering update, but only while nothing
  // has focus. Reading the initial focus before that update lets the reset that follows hand
  // focus back to the autofocused control, so wait for one.
  await waitForRenderUpdate(page);
  return true;
};

/**
 * Installs the in-page focus tracker that traversal reads each Tab stop through, returning false
 * when the page replaced its document during installation, between steps or during one. A page
 * that replaces its document later, during traversal, loses the tracker, which traversal reports.
 */
export const installFocusTracker = (page: Page): Promise<boolean> =>
  unlessDocumentReplaced(installInPage(page), false);
