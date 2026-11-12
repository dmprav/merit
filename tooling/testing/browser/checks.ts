import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

export const checkPage = async (page: Page) => {
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(page.locator("body")).toBeVisible();
  // Measure the settled surface, rather than intermediate overlay opacity.
  await page.evaluate(async () => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    );
  });
  await expect(page.locator("[data-entering], [data-exiting]")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(violations).toEqual([]);
};

type BrowserError = { type: "pageerror" | "console"; message: string; url: string };

const collectErrors = (context: BrowserContext, errors: BrowserError[]) => {
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
      collectErrors(context, errors);
      await use(errors);
      expect(errors, "Unexpected browser errors").toEqual([]);
    },
    { auto: true },
  ],
  newContext: async ({ browser, browserErrors }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      const context = await browser.newContext(options);
      collectErrors(context, browserErrors);
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect } from "@playwright/test";
