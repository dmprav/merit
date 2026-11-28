import type { Page } from "@playwright/test";

import { test, expect, checkPage } from "@merit/test-support/browser";

const toggletip = "components-toggletip--default";
const writing = "features-applications-review-an-assigned-application--writing";
const label = "About this request";

const open = async (page: Page, story: string, media: Parameters<Page["emulateMedia"]>[0] = {}) => {
  await page.emulateMedia({ reducedMotion: "reduce", ...media });
  await page.goto(`/iframe.html?id=${story}&viewMode=story&globals=theme:product`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

const content = (page: Page) => page.getByRole("group", { name: label });

const trigger = (page: Page) => page.getByRole("button", { name: label });

// Longer than the shared close delay, so a hint that was going to close has closed.
const pastCloseDelay = (page: Page) => page.waitForTimeout(500);

test.describe("toggletip", () => {
  test("previews on hover after the delay, and stays open while the pointer is on it", async ({
    page,
  }) => {
    await open(page, toggletip);
    await trigger(page).hover();
    await expect(content(page)).toHaveCount(0);
    await expect(content(page)).toBeVisible();

    const box = (await content(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
    await pastCloseDelay(page);
    await expect(content(page)).toBeVisible();

    await page.mouse.move(0, 0);
    await expect(content(page)).toHaveCount(0);
  });

  test("pins on press and closes on Escape or a press outside", async ({ page }) => {
    await open(page, toggletip);
    await trigger(page).click();
    await page.mouse.move(0, 0);
    await pastCloseDelay(page);
    await expect(content(page)).toBeVisible();
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(content(page)).toHaveCount(0);

    await trigger(page).click();
    await expect(content(page)).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(content(page)).toHaveCount(0);
  });

  test("closes on Escape while the pointer is over the content", async ({ page }) => {
    await open(page, toggletip);
    await trigger(page).hover();
    const box = (await content(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
    await page.keyboard.press("Escape");
    await expect(content(page)).toHaveCount(0);
    await pastCloseDelay(page);
    await expect(content(page)).toHaveCount(0);
  });

  test("stays closed after a quick press and Escape while the pointer rests on it", async ({
    page,
  }) => {
    await open(page, toggletip);
    // The press pins before the hover delay has passed, so no preview is showing yet.
    await trigger(page).click();
    await page.keyboard.press("Escape");
    await expect(content(page)).toHaveCount(0);
    await pastCloseDelay(page);
    await expect(content(page)).toHaveCount(0);
  });

  test.describe("on a touch screen", () => {
    test.use({ hasTouch: true });

    test("a dismissed touch pin leaves the next keyboard focus free to preview", async ({
      page,
    }) => {
      await open(page, toggletip);
      await trigger(page).tap();
      await expect(content(page)).toBeVisible();
      await page.touchscreen.tap(2, 2);
      await expect(content(page)).toHaveCount(0);

      await page.locator("body").focus();
      await page.keyboard.press("Tab");
      await expect(trigger(page)).toBeFocused();
      await expect(content(page)).toBeVisible();
    });
  });

  test("platform guard: the icon and surface stay painted in forced colors", async ({ page }) => {
    await open(page, "components-toggletip--pinned", { forcedColors: "active" });
    const paint = await trigger(page).evaluate((button) => {
      const icon = getComputedStyle(button.querySelector("svg")!);
      const surface = getComputedStyle(document.querySelector("[data-placement]")!);
      return {
        stroke: icon.stroke,
        surfaceBorder: surface.borderTopColor,
        surfaceWidth: surface.borderTopWidth,
      };
    });
    const unpainted = ["none", "rgba(0, 0, 0, 0)", "transparent"];
    expect(unpainted).not.toContain(paint.stroke);
    expect(unpainted).not.toContain(paint.surfaceBorder);
    expect(paint.surfaceWidth).toBe("1px");
  });
});

test("the reviewer's header shows the due date as quiet metadata and no badge", async ({
  page,
}) => {
  await open(page, writing);
  await checkPage(page);
  const assessment = page.getByRole("region", { name: "Your assessment", exact: true });

  const header = assessment.locator("[data-dialog-header]");

  await expect(header.locator("[data-appearance]")).toHaveCount(0);
  const due = header.locator("time[datetime]");
  await expect(due).toBeVisible();
  const dueText = (await due.textContent())!;

  await trigger(page).click();
  const details = content(page);
  await expect(details).toContainText("Requested by");
  await expect(details).not.toContainText(dueText);
});
