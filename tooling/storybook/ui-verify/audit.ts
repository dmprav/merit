import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  auditPage,
  collectBrowserErrors,
  type BrowserError,
  type PageAuditResult,
} from "@merit/test-support/browser";
import { desktopViewport, mobileOptions } from "@merit/test-support/browser/config";

import { errorMessage } from "../../cli.ts";
import type { Log } from "./cleanup.ts";
import { checkKeyboardFocusTraversal } from "./focus/check.ts";
import { MAX_TAB_STOPS } from "./focus/traversal.ts";
import { waitForRenderUpdate } from "./render-update.ts";
import {
  describeFocus,
  describeIncompleteTraversal,
  type FocusCheckResult,
  type TargetCheckResult,
} from "./results.ts";
import {
  buildUniqueTargetStems,
  resolveTargetUrl,
  sanitizeTargetName,
  screenshotFileFor,
  targetIdentifier,
  type RouteTarget,
  type StoryTarget,
  type VerifyTarget,
  type ViewportName,
} from "./targets.ts";

// Readiness waits: a story reports ready after its play function, a route once it shows content,
// and a route's network gets this long to go idle before content is checked anyway.
const STORY_READY_TIMEOUT_MS = 30_000;
const ROUTE_READY_TIMEOUT_MS = 20_000;
const ROUTE_NETWORK_IDLE_TIMEOUT_MS = 15_000;

/**
 * Leaves Ctrl+C to the CLI. Playwright's own SIGINT handler exits once Chromium closes, before
 * the CLI's handler finishes stopping servers and dropping databases.
 */
export const launchVerificationBrowser = () =>
  chromium.launch({ headless: true, handleSIGINT: false });

const contextOptionsFor = (viewport: ViewportName) =>
  viewport === "desktop"
    ? { viewport: desktopViewport }
    : {
        viewport: mobileOptions.viewport,
        isMobile: mobileOptions.isMobile,
        hasTouch: mobileOptions.hasTouch,
      };

const openStory = async (page: Page, target: StoryTarget, url: string): Promise<string> => {
  const response = await page.goto(url, { waitUntil: "load" });
  if (response && response.status() >= 400) {
    throw new Error(`Story "${target.id}" returned HTTP ${response.status()} at ${url}.`);
  }
  await page.waitForFunction(
    () => {
      const status = document.querySelector("#storybook-root")?.getAttribute("data-story-ready");
      return status === "true" || status === "error";
    },
    undefined,
    { timeout: STORY_READY_TIMEOUT_MS },
  );
  const storyReadyState = await page.evaluate(() => {
    const root = document.querySelector("#storybook-root");
    return {
      status: root?.getAttribute("data-story-ready") ?? null,
      error: root?.getAttribute("data-story-error") ?? null,
    };
  });
  if (storyReadyState.status === "error") {
    const detail = storyReadyState.error?.trim() || 'Storybook reported data-story-ready="error"';
    throw new Error(`Story "${target.id}" failed to become ready: ${detail}`);
  }
  return url;
};

const openRoute = async (
  page: Page,
  target: RouteTarget,
  url: string,
  routeReadyTimeoutMs: number,
): Promise<string> => {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (response && response.status() >= 400) {
    throw new Error(`Route "${target.route}" returned HTTP ${response.status()} at ${url}.`);
  }
  // A page that keeps polling never goes idle; its content check below still applies.
  await page
    .waitForLoadState("networkidle", { timeout: ROUTE_NETWORK_IDLE_TIMEOUT_MS })
    .catch(() => undefined);
  try {
    await page.waitForFunction(
      () => Boolean(document.body && document.body.innerText.trim().length > 0),
      undefined,
      { timeout: routeReadyTimeoutMs },
    );
  } catch (error) {
    throw new Error(
      `Route "${target.route}" did not render non-empty content within ${routeReadyTimeoutMs}ms at ${url}: ${errorMessage(error)}`,
    );
  }
  // A redirect, such as to sign-in, means the checks below describe this page, not the request.
  return page.url();
};

/** Opens the target and waits until it is ready, returning the URL of the page that loaded. */
export const openTargetOnPage = (
  page: Page,
  target: VerifyTarget,
  baseUrl: string,
  { routeReadyTimeoutMs = ROUTE_READY_TIMEOUT_MS }: { routeReadyTimeoutMs?: number } = {},
): Promise<string> => {
  const url = resolveTargetUrl(target, baseUrl);
  return target.kind === "story"
    ? openStory(page, target, url)
    : openRoute(page, target, url, routeReadyTimeoutMs);
};

/** Runs in the page: finishes finite animations, reporting whether any were running. */
const finishFiniteAnimationsInPage = (): boolean => {
  let finishedAny = false;
  for (const animation of document.getAnimations()) {
    if (animation.effect?.getComputedTiming().endTime === Infinity) {
      continue;
    }
    try {
      animation.finish();
      finishedAny = true;
    } catch {
      // A zero playback rate cannot finish; the capture's own animation handling covers it.
    }
  }
  return finishedAny;
};

// Playwright's `animations: "disabled"` finishes finite animations, but their end events fire in
// a later rendering update, after a full-page capture may already have sized the page. Finishing
// them first and waiting for that update lets end handlers change layout before the capture.
const finishFiniteAnimations = async (page: Page): Promise<void> => {
  if (await page.evaluate(finishFiniteAnimationsInPage)) {
    await waitForRenderUpdate(page);
  }
};

const captureScreenshot = async (page: Page, screenshotPath: string, fullPage: boolean) => {
  mkdirSync(dirname(screenshotPath), { recursive: true });
  await finishFiniteAnimations(page);
  if (fullPage) {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.screenshot({ path: screenshotPath, fullPage, animations: "disabled" });
};

const auditPassed = (
  audit: PageAuditResult,
  browserErrors: readonly BrowserError[],
  focus: FocusCheckResult,
): boolean =>
  audit.viteErrorOverlayCount === 0 &&
  audit.bodyVisible &&
  audit.dialogsVisible &&
  audit.enteringOrExitingCount === 0 &&
  !audit.hasHorizontalOverflow &&
  audit.axeViolations.length === 0 &&
  browserErrors.length === 0 &&
  focus.failures.length === 0 &&
  describeIncompleteTraversal(focus) === undefined;

/** Checks a page that already shows `target`, capturing it to `screenshotPath` when one is given. */
export const verifyLoadedPage = async ({
  page,
  target,
  url,
  viewport,
  browserErrors,
  screenshotPath,
  maxTabStops = MAX_TAB_STOPS,
}: {
  page: Page;
  target: VerifyTarget;
  /** The page the checks describe, which differs from the target's URL after a redirect. */
  url: string;
  viewport: ViewportName;
  browserErrors: BrowserError[];
  screenshotPath: string | null;
  maxTabStops?: number;
}): Promise<TargetCheckResult> => {
  // Capture once the page settles but before measuring: disabling animations fast-forwards them
  // and can fire end handlers that change layout, so the verdict must describe the screenshot.
  const audit = await auditPage(page, undefined, {
    beforeMeasure: async () => {
      if (screenshotPath) {
        await captureScreenshot(page, screenshotPath, target.fullPage);
      }
    },
  });
  const focus = await checkKeyboardFocusTraversal(page, maxTabStops);
  const errorsCopy = [...browserErrors];

  return {
    kind: target.kind,
    target: targetIdentifier(target),
    name: target.name,
    url,
    viewport,
    passed: auditPassed(audit, errorsCopy, focus),
    screenshot: screenshotPath,
    viteErrorOverlayCount: audit.viteErrorOverlayCount,
    bodyVisible: audit.bodyVisible,
    dialogsVisible: audit.dialogsVisible,
    enteringOrExitingCount: audit.enteringOrExitingCount,
    scrollWidth: audit.scrollWidth,
    innerWidth: audit.innerWidth,
    hasHorizontalOverflow: audit.hasHorizontalOverflow,
    axeViolations: audit.axeViolations,
    browserErrors: errorsCopy,
    focus,
  };
};

const describeAudited = (result: TargetCheckResult): string => {
  const focus = describeFocus(result.focus);
  return `${result.passed ? "PASS" : "FAIL"} [${result.viewport}] ${result.name} (axe:${result.axeViolations.length} overflow:${result.hasHorizontalOverflow ? "yes" : "no"} errors:${result.browserErrors.length} focus:${focus.verdict} (${focus.label}))`;
};

type TargetVisit = {
  target: VerifyTarget;
  viewport: ViewportName;
  baseUrl: string;
  screenshotFile: string;
  maxTabStops?: number;
  routeReadyTimeoutMs?: number;
};

/** Opens and checks one target in a fresh browser context, reporting a failure as its result. */
const checkTarget = async (
  browser: Browser,
  visit: TargetVisit,
  log: Log,
): Promise<TargetCheckResult> => {
  const { target, viewport, screenshotFile } = visit;
  const browserErrors: BrowserError[] = [];
  const requestedUrl = resolveTargetUrl(target, visit.baseUrl);
  let resolvedUrl = requestedUrl;
  let screenshotCleaned = false;
  let context: BrowserContext | undefined;
  try {
    rmSync(screenshotFile, { force: true });
    screenshotCleaned = true;
    context = await browser.newContext(contextOptionsFor(viewport));
    collectBrowserErrors(context, browserErrors);
    const page = await context.newPage();
    resolvedUrl = await openTargetOnPage(page, target, visit.baseUrl, {
      routeReadyTimeoutMs: visit.routeReadyTimeoutMs,
    });
    const checked = await verifyLoadedPage({
      page,
      target,
      url: resolvedUrl,
      viewport,
      browserErrors,
      screenshotPath: screenshotFile,
      maxTabStops: visit.maxTabStops,
    });
    log(describeAudited(checked));
    return { ...checked, requestedUrl };
  } catch (error) {
    const message = errorMessage(error);
    log(`FAIL [${viewport}] ${target.name}: ${message}`);
    return {
      kind: target.kind,
      target: targetIdentifier(target),
      name: target.name,
      url: resolvedUrl,
      requestedUrl,
      viewport,
      passed: false,
      // A screenshot captured before the failure survives; a stale one was removed first.
      screenshot: screenshotCleaned && existsSync(screenshotFile) ? screenshotFile : null,
      // The audit never ran, so its fields are placeholders.
      viteErrorOverlayCount: 0,
      bodyVisible: false,
      dialogsVisible: false,
      enteringOrExitingCount: 0,
      scrollWidth: 0,
      innerWidth: 0,
      hasHorizontalOverflow: false,
      axeViolations: [],
      browserErrors,
      focus: { stopsChecked: 0, reachedCap: false, failures: [] },
      error: message,
    };
  } finally {
    await context?.close().catch(() => undefined);
  }
};

/** Checks every target at every viewport, one viewport at a time, in a fresh context each. */
export const runTargetsInBrowser = async ({
  browser,
  targets,
  baseUrl,
  viewports,
  screenshotsDir,
  screenshotStems,
  maxTabStops,
  routeReadyTimeoutMs,
  log,
}: {
  browser: Browser;
  targets: readonly VerifyTarget[];
  baseUrl: string;
  viewports: readonly ViewportName[];
  screenshotsDir: string;
  screenshotStems?: readonly string[];
  maxTabStops?: number;
  routeReadyTimeoutMs?: number;
  log: Log;
}): Promise<TargetCheckResult[]> => {
  const stems = screenshotStems ?? buildUniqueTargetStems(targets.map((target) => target.name));
  const results: TargetCheckResult[] = [];
  for (const viewport of viewports) {
    for (const [index, target] of targets.entries()) {
      const stem = stems[index] ?? sanitizeTargetName(target.name);
      const visit = {
        target,
        viewport,
        baseUrl,
        screenshotFile: screenshotFileFor(screenshotsDir, stem, viewport),
        maxTabStops,
        routeReadyTimeoutMs,
      };
      results.push(await checkTarget(browser, visit, log));
    }
  }
  return results;
};
