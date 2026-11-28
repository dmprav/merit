import type { Page } from "@playwright/test";

import { waitForRenderUpdate } from "../render-update.ts";
import type { CapturedStop } from "./judge.ts";
import type { ElementStyleSnapshot, FocusVisualSnapshot, RelativeSnapshot } from "./style-diff.ts";

// Playwright serializes each function passed to `page.evaluate` on its own, so code that runs in
// the page cannot call module helpers. Each installer below defines its helpers inline and
// leaves them on `window` for the next installer and for traversal to call.

/** How far a snapshot reaches around the focused element for focus cues drawn on relatives. */
const SNAPSHOT_LIMITS = { ancestorDepth: 3, descendantDepth: 2, maxDescendants: 12 };

type SnapshotLimits = typeof SNAPSHOT_LIMITS;

/** What a focused element shows: its size, whether it can paint, and its focus styles. */
export type FocusedObservation = Pick<CapturedStop, "boundingBox" | "painted" | "focused">;

type PaintReader = {
  hasTextRun: (el: Element) => boolean;
  hasPaintableTransform: (el: Element) => boolean;
};

type StyleReader = {
  relativeOf: (el: Element) => RelativeSnapshot;
  styleOf: (el: Element, pseudo?: string) => ElementStyleSnapshot;
  isPainted: (el: Element) => boolean;
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
type MeritFocusTracker = FocusLocator & {
  captureSnapshot: (el: Element) => FocusVisualSnapshot;
  stops: Element[];
  describeElement: (el: Element) => string;
  observeFocused: (el: Element) => FocusedObservation;
};

declare global {
  interface Window {
    __meritStyleReader?: StyleReader;
    __meritPaintReader?: PaintReader;
    __meritFocusLocator?: FocusLocator;
    __meritFocusTracker?: MeritFocusTracker;
  }
}

/** Runs in the page: measures paint that depends on layout and the rendered ancestor chain. */
const definePaintReader = () => {
  const computedStyleOf = (el: Element) =>
    (el.ownerDocument.defaultView ?? window).getComputedStyle(el);

  const composedParent = (el: Element): Element | null => {
    const root = el.getRootNode();
    const view = el.ownerDocument.defaultView ?? window;
    return (
      el.assignedSlot ??
      el.parentElement ??
      (root instanceof view.ShadowRoot
        ? root.host
        : (el.ownerDocument.defaultView?.frameElement ?? null))
    );
  };

  // CSS transforms do not apply to boxless elements, table columns, or ordinary HTML inline boxes.
  const takesTransform = (el: Element, display: string): boolean => {
    if (["contents", "table-column", "table-column-group"].includes(display)) {
      return false;
    }
    const view = el.ownerDocument.defaultView ?? window;
    return (
      display !== "inline" ||
      !(el instanceof view.HTMLElement) ||
      el.matches(
        "img, video, canvas, iframe, embed, object, input, audio, select, textarea, button",
      )
    );
  };

  const transformSuppressesPaint = (
    node: Element,
    { transform, scale, display }: CSSStyleDeclaration,
  ): boolean => {
    if (transform === "none" && scale === "none") {
      return false;
    }
    // A singular transform suppresses the entire subtree, including paint outside a zero-size box.
    const singular =
      scale.split(/\s+/).some((axis) => Number.parseFloat(axis) === 0) ||
      (transform !== "none" && Number.isNaN(new DOMMatrixReadOnly(transform).inverse().m11));
    return singular && takesTransform(node, display);
  };

  const hasPaintableTransform = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = composedParent(node)) {
      if (transformSuppressesPaint(node, computedStyleOf(node))) {
        return false;
      }
    }
    return true;
  };

  // A decoration on an empty box has no text run to draw across.
  const hasTextRun = (el: Element): boolean => {
    const view = el.ownerDocument.defaultView ?? window;
    return Array.from(el.childNodes).some((node) => {
      if (node instanceof view.Element) {
        const style = computedStyleOf(node);
        // Decorations cross in-flow boxes, but stop at atomic inlines and out-of-flow children.
        return (
          !/^(inline-(block|flex|grid|table)|none|ruby-text)$/.test(style.display) &&
          style.position !== "absolute" &&
          style.position !== "fixed" &&
          style.cssFloat === "none" &&
          style.opacity !== "0" &&
          style.contentVisibility !== "hidden" &&
          !transformSuppressesPaint(node, style) &&
          hasTextRun(node)
        );
      }
      if (
        node.nodeType !== Node.TEXT_NODE ||
        !node.textContent?.trim() ||
        computedStyleOf(el).visibility !== "visible"
      ) {
        return false;
      }
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(node);
      const { width, height } = range.getBoundingClientRect();
      return width > 0 && height > 0;
    });
  };

  window.__meritPaintReader = { hasTextRun, hasPaintableTransform };
};

/** Runs in the page: installs how a snapshot reads the styles that can paint a focus cue. */
const defineStyleReader = (): boolean => {
  const paint = window.__meritPaintReader;
  if (!paint) {
    return false;
  }

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

  const computedStyleOf = (el: Element, pseudo?: string) =>
    (el.ownerDocument.defaultView ?? window).getComputedStyle(el, pseudo);

  const styleOf = (el: Element, pseudo?: string): ElementStyleSnapshot =>
    pickStyle(computedStyleOf(el, pseudo), !!pseudo);

  const nodeIds = new WeakMap<Element, number>();
  let nextNodeId = 0;

  const isPainted = (el: Element): boolean =>
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true });

  const relativeOf = (el: Element): RelativeSnapshot => {
    let nodeId = nodeIds.get(el);
    if (nodeId === undefined) {
      nodeId = nextNodeId++;
      nodeIds.set(el, nodeId);
    }
    const { width, height } = el.getBoundingClientRect();
    const style = computedStyleOf(el);
    const painted = isPainted(el) && paint.hasPaintableTransform(el);
    return {
      nodeId,
      hasArea: width > 0 && height > 0,
      painted,
      style: pickStyle(style, false),
      decorationColor:
        painted && style.textDecorationLine !== "none" && paint.hasTextRun(el)
          ? style.textDecorationColor
          : undefined,
    };
  };

  window.__meritStyleReader = { styleOf, relativeOf, isPainted };
  delete window.__meritPaintReader;
  return true;
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
 * Runs in the page: combines style sampling and the focus locator into the focus tracker, and
 * reports false when either is missing because the document was replaced after it was installed.
 */
const defineFocusTracker = (limits: SnapshotLimits): boolean => {
  const reader = window.__meritStyleReader;
  const locator = window.__meritFocusLocator;
  if (!reader || !locator) {
    return false;
  }

  const { relativeOf, styleOf } = reader;

  const ancestorStyles = (el: Element): RelativeSnapshot[] => {
    const styles: RelativeSnapshot[] = [];
    const { body, documentElement } = el.ownerDocument;
    let parent = el.parentElement;
    while (
      styles.length < limits.ancestorDepth &&
      parent &&
      parent !== body &&
      parent !== documentElement
    ) {
      styles.push(relativeOf(parent));
      parent = parent.parentElement;
    }
    return styles;
  };

  // Breadth first, so the nearest descendants fill the limit.
  const descendantStyles = (el: Element): RelativeSnapshot[] => {
    const styles: RelativeSnapshot[] = [];
    const queue = Array.from(el.children, (node) => ({ node, depth: 1 }));
    for (
      let next = queue.shift();
      next && styles.length < limits.maxDescendants;
      next = queue.shift()
    ) {
      styles.push(relativeOf(next.node));
      if (next.depth < limits.descendantDepth) {
        const depth = next.depth + 1;
        queue.push(...Array.from(next.node.children, (node) => ({ node, depth })));
      }
    }
    return styles;
  };

  const captureSnapshot = (el: Element): FocusVisualSnapshot => ({
    self: styleOf(el),
    before: styleOf(el, "::before"),
    after: styleOf(el, "::after"),
    ancestors: ancestorStyles(el),
    descendants: descendantStyles(el),
  });

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
      painted: reader.isPainted(el),
      focused: captureSnapshot(el),
    };
  };

  window.__meritFocusTracker = {
    captureSnapshot,
    ...locator,
    stops: [],
    describeElement,
    observeFocused,
  };
  delete window.__meritStyleReader;
  delete window.__meritFocusLocator;
  return true;
};

/**
 * Installs the in-page focus tracker that traversal reads each Tab stop through, returning false
 * when the page replaced its document during installation. A page that replaces its document
 * later, during traversal, loses the tracker, which traversal reports.
 */
export const installFocusTracker = async (page: Page): Promise<boolean> => {
  await page.evaluate(definePaintReader);
  if (!(await page.evaluate(defineStyleReader))) {
    return false;
  }
  await page.evaluate(defineFocusLocator);
  if (!(await page.evaluate(defineFocusTracker, SNAPSHOT_LIMITS))) {
    return false;
  }
  // Chromium applies a pending `autofocus` in the next rendering update, but only while nothing
  // has focus. Reading the initial focus before that update lets the reset that follows hand
  // focus back to the autofocused control, so wait for one.
  await waitForRenderUpdate(page);
  return true;
};
