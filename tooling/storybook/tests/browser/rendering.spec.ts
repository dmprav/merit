import { test, expect, checkPage } from "@merit/test-support/browser";

for (const story of [
  { id: "components-button--keyboard-focus", ready: "button" },
  { id: "components-button--pending", ready: "button[data-pending]" },
  { id: "components-button--icon-only", ready: "button" },
  { id: "components-button--overview", ready: "button" },
  { id: "components-button--pending-icon-only", ready: "button[data-pending]" },
  { id: "components-button--long-label", ready: "button" },
  { id: "components-tabs--overflow-interactions", ready: '[role="tablist"]' },
  { id: "components-text-field--states", ready: "input[readonly]" },
  { id: "patterns-page-composition--overview", ready: "h1" },
  { id: "patterns-status-message--announcement-only", ready: "button" },
  { id: "patterns-toast--outcomes", ready: '[role="alertdialog"]' },
  { id: "patterns-toast--in-workspace", ready: '[role="alertdialog"]' },
  { id: "patterns-state-message--recovery", ready: "h1" },
  { id: "patterns-state-message--missing", ready: "h1" },
  { id: "patterns-state-message--loading", ready: '[role="status"]' },
  { id: "patterns-state-message--long-content", ready: "h1" },
  { id: "patterns-person-identity--reviewer", ready: "h3" },
  { id: "components-select--open", ready: '[role="listbox"]' },
  { id: "components-dialog--centered-with-actions", ready: '[role="dialog"]' },
  {
    id: "features-applications-recommendation--budget-preview",
    ready: '[aria-label="Budget preview"]',
  },
  { id: "features-applications-application-detail--changed-evidence", ready: "h1" },
  {
    id: "features-applications-application-detail--reviews",
    ready: 'section[aria-label="Reviewer assessments"]',
  },
  { id: "features-applications-recommendation--no-recommendation", ready: "button" },
  { id: "features-applications-recommendation--validation", ready: '[aria-invalid="true"]' },
  {
    id: "features-applications-recommendation--saving",
    ready: 'form[aria-busy="true"] button[type="submit"]:disabled',
  },
  { id: "features-applications-recommendation--save-failure", ready: '[role="alert"]' },
]) {
  test(`story: ${story.id}`, async ({ page }, testInfo) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const ready =
      story.ready === "button"
        ? page.getByRole("button").first()
        : story.ready === "h1"
          ? page.getByRole("heading", { level: 1 }).first()
          : page.locator(story.ready).first();

    await expect(ready).toBeVisible();

    if (story.id === "components-button--keyboard-focus") {
      const button = page.getByRole("button").first();

      await expect(button).toBeFocused();
    }

    if (story.id === "features-applications-recommendation--saving") {
      await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
    }
    if (story.id === "components-select--open") {
      expect(
        await page
          .getByRole("listbox")
          .evaluate((node) => getComputedStyle(node).getPropertyValue("--text-control").trim()),
      ).toBe("0.8125rem");
      await page.screenshot({ path: testInfo.outputPath("select-open.png") });
    }

    if (story.id === "patterns-toast--in-workspace") {
      const toast = page.getByRole("alertdialog", { name: "Criterion removed" });

      await expect(toast).toBeInViewport();

      const bounds = (await toast.boundingBox())!;
      const workspace = (await page.locator("#main").boundingBox())!;
      const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);

      // Bottom right of the workspace, inset from the viewport edge.
      expect(Math.abs(bounds.x + bounds.width - (layoutWidth - 16))).toBeLessThan(1);
      expect(bounds.width).toBeLessThanOrEqual(workspace.width - 32);
      await page.screenshot({ path: testInfo.outputPath(`${story.id}.png`) });
    }

    if (story.id.startsWith("patterns-status-message")) {
      await page.getByRole("button", { name: "Repeat event" }).click();

      await expect(page.getByRole("status")).not.toBeEmpty();

      await page.screenshot({ path: testInfo.outputPath(`${story.id}.png`) });
    }
    await checkPage(page);

    await expect(page.locator(".sb-show-errordisplay")).toHaveCount(0);

    if (story.id.startsWith("patterns-state-message")) {
      await page.screenshot({ path: testInfo.outputPath(`${story.id}.png`) });
    }
    if (testInfo.project.name === "mobile" && story.id.startsWith("components-button")) {
      const bounds = await page.getByRole("button").first().boundingBox();

      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
  });
}
