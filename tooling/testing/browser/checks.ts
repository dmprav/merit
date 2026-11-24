import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * Waits for running time-based animations, such as overlay entrances, to finish. Infinite
 * and scroll-linked animations never finish, so they are skipped.
 */
export const settleAnimations = (page: Page) =>
  page.evaluate(async () => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline === document.timeline &&
            animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished),
    );
  });

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
    innerWidth: window.innerWidth,
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

/**
 * Runs Merit's standard page health, layout overflow, and WCAG 2 A/AA/2.1AA checks without
 * relying on Playwright Test's assertion runner, returning structured results for CLI tooling.
 */
export const auditPage = async (page: Page, timeoutMs = 10_000): Promise<PageAuditResult> => {
  await page
    .waitForFunction(
      () => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        return dialogs.every((dialog) => dialog.checkVisibility({ opacityProperty: true }));
      },
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => undefined);

  await settleAnimations(page);

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-entering], [data-exiting]").length === 0,
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => undefined);

  const viteErrorOverlayCount = await page.locator("vite-error-overlay").count();
  const bodyVisible = await page
    .locator("body")
    .isVisible()
    .catch(() => false);
  const dialogsVisible = await page
    .getByRole("dialog")
    .evaluateAll((dialogs) =>
      dialogs.every((dialog) => dialog.checkVisibility({ opacityProperty: true })),
    );
  const enteringOrExitingCount = await page.locator("[data-entering], [data-exiting]").count();
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
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .evaluateAll((dialogs) =>
          dialogs.every((dialog) => dialog.checkVisibility({ opacityProperty: true })),
        ),
    )
    .toBe(true);
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
