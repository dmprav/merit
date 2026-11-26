import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const SETTLE_ANIMATIONS_TIMEOUT_MS = 5_000;

/**
 * Waits for running time-based animations, such as overlay entrances, to finish. Paused,
 * infinite, and scroll-linked animations never finish, so they are skipped, and the wait is
 * bounded so a stalled animation cannot hang page checks.
 */
export const settleAnimations = (page: Page, timeoutMs = SETTLE_ANIMATIONS_TIMEOUT_MS) =>
  page.evaluate(async (maxWaitMs: number) => {
    const running = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState !== "paused" &&
          animation.timeline === document.timeline &&
          animation.effect?.getTiming().iterations !== Infinity,
      )
      .map((animation) => animation.finished);

    if (running.length === 0) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(running),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, maxWaitMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }, timeoutMs);

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"] as const;

type AxeViolationNodeSummary = {
  target: string[];
  html: string;
  failureSummary?: string;
};

export type AxeViolationSummary = {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: AxeViolationNodeSummary[];
};

export type PageAuditResult = {
  viteErrorOverlayCount: number;
  bodyVisible: boolean;
  dialogsVisible: boolean;
  enteringOrExitingCount: number;
  scrollWidth: number;
  innerWidth: number;
  hasHorizontalOverflow: boolean;
  axeViolations: AxeViolationSummary[];
};

const measureHorizontalOverflow = (page: Page) =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    // Mobile Chromium expands window.innerWidth when content overflows horizontally;
    // documentElement.clientWidth stays pinned to the layout viewport width.
    innerWidth: document.documentElement.clientWidth || window.innerWidth,
  }));

const runAxeAudit = async (page: Page): Promise<AxeViolationSummary[]> => {
  const { violations } = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => ({
      target: node.target.map((part) => String(part)),
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  }));
};

const areDialogsVisible = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const dialogSelector = 'dialog[open], [role="dialog"], [role="alertdialog"]';
    const dialogs: Element[] = [];

    // Mirror Playwright locators, which pierce open shadow roots.
    const collect = (root: Document | ShadowRoot) => {
      for (const element of Array.from(root.querySelectorAll("*"))) {
        if (element.matches(dialogSelector)) {
          dialogs.push(element);
        }
        if (element.shadowRoot) {
          collect(element.shadowRoot);
        }
      }
    };

    collect(document);

    return dialogs
      .filter((element) => {
        if (element.tagName === "DIALOG") {
          return element.hasAttribute("open");
        }
        // A custom dialog that is closed through attributes or CSS renders no box; a mounted
        // dialog that is still transparent during its entrance does.
        return !(
          element.hasAttribute("hidden") ||
          element.getAttribute("aria-hidden") === "true" ||
          element.hasAttribute("inert") ||
          element.getAttribute("data-state") === "closed" ||
          !element.checkVisibility()
        );
      })
      .every((dialog) =>
        dialog.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
      );
  });

/**
 * Runs Merit's standard page health, layout overflow, and WCAG 2 A/AA/2.1AA checks without
 * relying on Playwright Test's assertion runner, returning structured results for CLI tooling.
 */
export const auditPage = async (
  page: Page,
  timeoutMs = 10_000,
  { beforeMeasure }: { beforeMeasure?: () => Promise<void> } = {},
): Promise<PageAuditResult> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const visible = await areDialogsVisible(page).catch(() => false);
    if (visible) {
      break;
    }
    await page.waitForTimeout(50);
  }

  await settleAnimations(page);

  const transitionMarkers = page.locator("[data-entering], [data-exiting]");
  await transitionMarkers
    .first()
    .waitFor({ state: "detached", timeout: timeoutMs })
    .catch(() => undefined);

  // Callers capture evidence here, such as a screenshot that fast-forwards animations, so the
  // measurements below describe the state that evidence shows.
  await beforeMeasure?.();

  const viteErrorOverlayCount = await page.locator("vite-error-overlay").count();
  const bodyVisible = await page
    .locator("body")
    .isVisible()
    .catch(() => false);
  const dialogsVisible = await areDialogsVisible(page);
  const enteringOrExitingCount = await transitionMarkers.count();
  const { scrollWidth, innerWidth } = await measureHorizontalOverflow(page);
  const axeViolations = await runAxeAudit(page);

  return {
    viteErrorOverlayCount,
    bodyVisible,
    dialogsVisible,
    enteringOrExitingCount,
    scrollWidth,
    innerWidth,
    hasHorizontalOverflow: scrollWidth > innerWidth + 1,
    axeViolations,
  };
};

export const checkPage = async (page: Page) => {
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(page.locator("body")).toBeVisible();
  // React Aria mounts a transparent dialog before its entrance animation begins.
  await expect.poll(() => areDialogsVisible(page)).toBe(true);
  await settleAnimations(page);
  await expect(page.locator("[data-entering], [data-exiting]")).toHaveCount(0);
  const { scrollWidth, innerWidth } = await measureHorizontalOverflow(page);
  expect(scrollWidth <= innerWidth + 1).toBe(true);
  const { violations } = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  expect(violations).toEqual([]);
};

export type BrowserError = { type: "pageerror" | "console"; message: string; url: string };

export const collectBrowserErrors = (context: BrowserContext, errors: BrowserError[]) => {
  // Context events include popups and pages that close before the test finishes.
  context.on("weberror", (error) => {
    errors.push({
      type: "pageerror",
      message: error.error().message,
      url: error.page()?.url() ?? "",
    });
  });
  context.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({ type: "console", message: message.text(), url: message.page()?.url() ?? "" });
    }
  });
};

export const test = base.extend<{
  browserErrors: BrowserError[];
  newContext: (options?: Parameters<Browser["newContext"]>[0]) => Promise<BrowserContext>;
}>({
  browserErrors: [
    async ({ context }, use) => {
      const errors: BrowserError[] = [];
      collectBrowserErrors(context, errors);
      await use(errors);
      expect(errors, "Unexpected browser errors").toEqual([]);
    },
    { auto: true },
  ],
  newContext: async ({ browser, browserErrors }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      const context = await browser.newContext(options);
      collectBrowserErrors(context, browserErrors);
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect } from "@playwright/test";
