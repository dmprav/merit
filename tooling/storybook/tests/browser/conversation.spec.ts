import type { Locator, Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

/** How close to the end counts as reading the latest text. */
const nearEnd = 24;

const open = async (page: Page, id: string) => {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

const distanceFromEnd = (scroller: Locator) =>
  scroller.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);

const scrollTop = (scroller: Locator) => scroller.evaluate((node) => node.scrollTop);

const hasOverflow = (scroller: Locator, extra = 0) =>
  scroller.evaluate((node, margin) => node.scrollHeight > node.clientHeight + margin, extra);

/** Whether the element lies within the scrolling panel's visible area. */
const isInView = async (element: Locator, scroller: Locator) => {
  const inner = (await element.boundingBox())!;
  const outer = (await scroller.boundingBox())!;
  return inner.y >= outer.y - 1 && inner.y + inner.height <= outer.y + outer.height + 1;
};

test.describe("conversation pattern scrolling", () => {
  const scrollerOf = (page: Page) => page.getByTestId("scroller");

  const shorten = (scroller: Locator) =>
    scroller.evaluate((node) => {
      node.style.blockSize = "120px";
    });

  test("follows an answer as it streams, and when the panel body shrinks", async ({ page }) => {
    await open(page, "patterns-conversation--follows-streaming");
    const scroller = scrollerOf(page);

    await expect(page.getByText(/Paragraph 10\./)).toBeVisible();
    expect(await hasOverflow(scroller)).toBe(true);
    await expect.poll(() => distanceFromEnd(scroller)).toBeLessThan(nearEnd);

    // The body shrinks with no new content, as when the composer grows; the end stays in view.
    await shorten(scroller);
    await expect.poll(() => distanceFromEnd(scroller)).toBeLessThan(nearEnd);
  });

  test("leaves the scroll where the person put it, also when the panel body shrinks", async ({
    page,
  }) => {
    await open(page, "patterns-conversation--leaves-the-scroll-where-put");
    const scroller = scrollerOf(page);

    await expect.poll(() => hasOverflow(scroller, 100)).toBe(true);
    await scroller.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(page.getByText(/Paragraph 10\./)).toBeVisible();
    expect(await scrollTop(scroller)).toBeLessThan(nearEnd);
    expect(await distanceFromEnd(scroller)).toBeGreaterThan(100);

    await shorten(scroller);
    await page.waitForTimeout(200);
    expect(await scrollTop(scroller)).toBeLessThan(nearEnd);

    // Asking again follows the end once more.
    await page.getByRole("button", { name: "Ask again" }).click();
    await expect(page.getByText(/Paragraph 10\./)).toBeVisible();
    await expect.poll(() => distanceFromEnd(scroller)).toBeLessThan(nearEnd);
  });
});

test.describe("Merit AI conversation scrolling", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Sets its own viewport size.");
    await page.setViewportSize({ width: 1440, height: 800 });
  });

  const panelOf = (page: Page) => page.getByRole("region", { name: "Merit AI" });

  // The announcement region repeats the answer, so the text is looked up in the thread itself.
  const threadOf = (page: Page) => page.getByRole("log", { name: "Conversation with Merit AI" });

  test("follows an answer as it streams, and when the viewport shortens", async ({ page }) => {
    await open(page, "features-merit-ai-conversation--follows-streaming-to-the-end");
    const scroller = panelOf(page);

    const last = threadOf(page).getByText(/Paragraph 12\./);
    await expect(last).toBeVisible();
    await expect.poll(() => isInView(last, scroller)).toBe(true);
    expect(await hasOverflow(scroller)).toBe(true);
    await expect.poll(() => distanceFromEnd(scroller)).toBeLessThan(nearEnd);

    await page.setViewportSize({ width: 1440, height: 360 });
    await expect.poll(() => distanceFromEnd(scroller)).toBeLessThan(nearEnd);
    await expect.poll(() => isInView(last, scroller)).toBe(true);
  });

  test("leaves the scroll where the person put it until they ask again", async ({ page }) => {
    await open(page, "features-merit-ai-conversation--leaves-the-scroll-where-the-person-put-it");
    const scroller = panelOf(page);

    await expect.poll(() => hasOverflow(scroller, 100)).toBe(true);
    await scroller.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(threadOf(page).getByText(/Paragraph 12\./)).toBeVisible();
    expect(await scrollTop(scroller)).toBeLessThan(nearEnd);
    expect(await distanceFromEnd(scroller)).toBeGreaterThan(100);

    await page.setViewportSize({ width: 1440, height: 360 });
    await page.waitForTimeout(200);
    expect(await scrollTop(scroller)).toBeLessThan(nearEnd);

    await page.getByRole("textbox", { name: "Message to Merit AI" }).fill("And the venue?");
    await page.keyboard.press("Enter");
    await expect.poll(() => distanceFromEnd(scroller)).toBeLessThan(nearEnd);
  });

  test("follows what appears when a run settles", async ({ page }) => {
    await open(page, "features-merit-ai-conversation--follows-what-appears-when-the-run-settles");
    const scroller = panelOf(page);

    const suggestion = page.getByRole("button", { name: /Draft a question to the applicant/ });
    expect(await hasOverflow(scroller)).toBe(true);
    await expect.poll(() => isInView(suggestion, scroller)).toBe(true);
  });
});
