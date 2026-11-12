import { test, expect } from "@merit/test-support/browser";

for (const theme of ["product", "site"]) {
  test(`control focus appearance in ${theme}`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=foundations-focus--comparison&viewMode=story&globals=theme:${theme}`,
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
    // Keep fixed and sticky elements at their initial position in full-page captures.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: true });
  });
}
