import type { Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

import { FOCUS_COMPARISON_STORY_ID, VISUAL_TARGETS, type VisualTarget } from "../../visual-targets";

test.beforeEach(() => {
  if (process.platform === "darwin" && !process.env.MERIT_ALLOW_DARWIN_VISUAL) {
    throw new Error(
      "Visual baselines are standardized on Linux CI snapshots. Run: vp run test:browser:stories:container",
    );
  }
});

/** Confirms the state each capture depends on beyond the shared story-ready marker. */
const prepareCapture = async (page: Page, target: VisualTarget) => {
  if (target.id === FOCUS_COMPARISON_STORY_ID) {
    await expect(page.getByRole("button", { name: "Save recommendation" })).toBeFocused();
    return;
  }
  if (target.id === "patterns-form-dialog--with-context") {
    const dialog = page.getByRole("dialog", { name: "Write a note", exact: true });
    await expect(dialog).toBeInViewport();
    await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toBeFocused();
    return;
  }
  // Keep fixed and sticky elements at their initial position in full-page captures.
  await page.evaluate(() => window.scrollTo(0, 0));
};

for (const target of VISUAL_TARGETS) {
  test(target.testTitle, async ({ page }) => {
    const globals = target.globals ? `&globals=${target.globals}` : "";
    await page.goto(`/iframe.html?id=${target.id}&viewMode=story${globals}`);

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await prepareCapture(page, target);
    // A viewport capture keeps a fixed overlay in place without moving the scroll-locked page.
    await expect(page).toHaveScreenshot(`${target.name}.png`, { fullPage: target.fullPage });
  });
}
