import type { Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

const open = async (page: Page, id: string) => {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

test.describe("companion panel layout", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Sets its own viewport widths.");
    await page.setViewportSize({ width: 1440, height: 800 });
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

  for (const [from, to, close] of [
    [1440, 1280, "Escape"],
    [1440, 1280, "Close"],
  ] as const) {
    test(`returns focus to the opener when the panel closes after narrowing (${close})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: from, height: 800 });
      await open(page, "patterns-application-shell--assistant-panel-closed");

      const opener = page.getByRole("button", { name: "Open assistant" });
      await opener.click();
      await expect(page.getByRole("complementary", { name: "Assistant" })).toBeVisible();
      await page.setViewportSize({ width: to, height: 800 });
      const sheet = page.getByRole("dialog", { name: "Assistant" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("textbox", { name: "Message" })).toBeFocused();

      if (close === "Escape") {
        await page.keyboard.press("Escape");
      } else {
        await sheet.getByRole("button", { name: "Close assistant" }).click();
      }

      await expect(sheet).toHaveCount(0);
      await expect(opener).toBeFocused();
    });
  }
});
