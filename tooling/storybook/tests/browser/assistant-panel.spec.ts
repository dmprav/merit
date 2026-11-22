import type { Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

const open = async (page: Page, id: string) => {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

test.describe("companion panel layout", () => {
  test.beforeEach((_fixtures, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Sets its own viewport widths.");
  });

  test("pushes the page aside and scrolls on its own from 1400 pixels", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 160 });
    await open(page, "patterns-application-shell--assistant-panel");

    const panel = page.getByRole("complementary", { name: "Assistant" });
    await expect(panel).toBeVisible();
    const bounds = (await panel.boundingBox())!;
    const main = (await page.locator("#main").boundingBox())!;

    expect(bounds.width).toBe(416);
    expect(bounds.x + bounds.width).toBe(1440);
    expect(bounds.y).toBe(0);
    expect(bounds.height).toBe(160);
    expect(main.x + main.width).toBeLessThanOrEqual(bounds.x);

    const scrolls = await panel.evaluate((node) => {
      const area = [...node.children].find((child) => getComputedStyle(child).overflowY === "auto");
      return area ? area.scrollHeight > area.clientHeight : false;
    });
    expect(scrolls).toBe(true);
    // The panel stays on the right edge, full height, while the page scrolls beneath it.
    await page.evaluate(() => window.scrollTo(0, 50));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const scrolled = (await panel.boundingBox())!;
    expect(scrolled.y).toBe(0);
    expect(scrolled.height).toBe(160);
  });

  test("centres a toast on the page area beside the open panel", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await open(page, "patterns-application-shell--assistant-panel-with-toast");

    const toast = page.getByRole("alertdialog", { name: "Recommendation saved" });
    await expect(toast).toBeInViewport();
    const bounds = (await toast.boundingBox())!;
    const main = (await page.locator("#main").boundingBox())!;
    const panel = (await page.getByRole("complementary", { name: "Assistant" }).boundingBox())!;

    expect(Math.abs(bounds.x + bounds.width / 2 - (main.x + main.width / 2))).toBeLessThan(1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(panel.x);
  });

  for (const [width, sheetWidth] of [
    [1280, 400],
    [390, 390],
  ] as const) {
    test(`opens a ${sheetWidth} pixel modal sheet at ${width} pixels`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "patterns-application-shell--assistant-panel");

      const sheet = page.getByRole("dialog", { name: "Assistant" });
      await expect(sheet).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Assistant" })).toHaveCount(0);
      // The dialog sits inside the modal that carries the width and the edge border.
      const modal = sheet.locator("..");
      await expect.poll(async () => (await modal.boundingBox())?.width).toBe(sheetWidth);
      expect((await modal.boundingBox())!.height).toBe(800);
    });
  }
});

test("the message box grows to eight lines, then scrolls", async ({ page }) => {
  await open(page, "patterns-message-box--long-text");

  const input = page.getByRole("textbox", { name: "Message" });

  const lines = (count: number) =>
    Array.from({ length: count }, (_, index) => `Line ${index + 1}`).join("\n");

  const height = async () => (await input.boundingBox())!.height;

  await input.fill(lines(1));
  const one = await height();
  await input.fill(lines(4));
  const four = await height();
  await input.fill(lines(8));
  const eight = await height();
  await input.fill(lines(12));
  const twelve = await height();

  expect(four).toBeGreaterThan(one);
  expect(eight).toBeGreaterThan(four);
  expect(twelve).toBe(eight);
  expect(await input.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await input.fill(lines(8));
  expect(await input.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
});
