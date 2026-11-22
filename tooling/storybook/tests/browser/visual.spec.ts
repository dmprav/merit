import { test, expect } from "@merit/test-support/browser";

test.beforeEach(() => {
  if (process.platform === "darwin" && !process.env.MERIT_ALLOW_DARWIN_VISUAL) {
    throw new Error(
      "Visual baselines are standardized on Linux CI snapshots. Run: vp run test:browser:stories:container",
    );
  }
});

for (const theme of ["product", "site"]) {
  test(`control focus appearance in ${theme}`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=design-language--focus-comparison&viewMode=story&globals=theme:${theme}`,
    );

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await expect(page.getByRole("button", { name: "Save recommendation" })).toBeFocused();
    await expect(page).toHaveScreenshot(`focus-${theme}.png`, { fullPage: true });
  });
}

for (const id of [
  "components-button--overview",
  "patterns-form-dialog--with-context",
  "patterns-confirmation-dialog--failure",
  "components-text-field--states",
  "components-data-table--default",
  "features-applications-recommendation--resume-editing",
  "patterns-application-shell--workspace-switcher",
  "patterns-application-shell--workspace-switcher-long-name",
]) {
  test(`appearance: ${id}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    if (id === "patterns-form-dialog--with-context") {
      const dialog = page.getByRole("dialog", { name: "Write a note", exact: true });
      await expect(dialog).toBeInViewport();
      await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toBeFocused();
      // Capture the fixed overlay in its viewport without moving the scroll-locked page.
      await expect(page).toHaveScreenshot(`${id}.png`);
      return;
    }
    // Keep fixed and sticky elements at their initial position in full-page captures.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: true });
  });
}
