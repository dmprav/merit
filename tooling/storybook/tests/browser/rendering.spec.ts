import { test, expect, checkPage } from "@merit/test-support/browser";

for (const story of [
  { id: "components-button--keyboard-focus", ready: "button" },
  { id: "components-button--pending", ready: "button[data-pending]" },
  { id: "components-button--small", ready: "button" },
  { id: "components-button--icon-only", ready: "button" },
  { id: "components-button--overview", ready: "button" },
  { id: "components-button--pending-icon-only", ready: "button[data-pending]" },
  { id: "components-button--long-label", ready: "button" },
  { id: "components-tabs--overflow-interactions", ready: '[role="tablist"]' },
  { id: "components-text-field--states", ready: "input[readonly]" },
  { id: "patterns-page-composition--overview", ready: "h1" },
  { id: "patterns-status-message--success", ready: "button" },
  { id: "patterns-status-message--announcement-only", ready: "button" },
  { id: "patterns-status-message--long-message", ready: "button" },
  { id: "patterns-status-message--in-workspace", ready: "button" },
  { id: "patterns-state-message--recovery", ready: "h1" },
  { id: "patterns-state-message--missing", ready: "h1" },
  { id: "patterns-state-message--loading", ready: '[role="status"]' },
  { id: "patterns-state-message--long-content", ready: "h1" },
  { id: "patterns-person-identity--reviewer", ready: "h3" },
  { id: "components-select--open", ready: '[role="listbox"]' },
  { id: "components-dialog--close-button-focused", ready: '[role="dialog"]' },
  {
    id: "features-applications-recommendation--budget-preview",
    ready: '[aria-label="Budget preview"]',
  },
  { id: "features-applications-overview--changed-evidence", ready: "h1" },
  {
    id: "features-applications-overview--reviews",
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

    if (story.id.startsWith("patterns-status-message")) {
      await page.getByRole("button", { name: "Repeat event" }).click();

      await expect(page.getByRole("status")).not.toBeEmpty();

      if (story.id === "patterns-status-message--in-workspace") {
        const confirmation = page.locator('span[aria-hidden="true"]').filter({
          hasText: "Your recommendation and its supporting explanation",
        });

        await expect(confirmation).toBeInViewport();
        await expect(confirmation).toHaveCSS("position", "fixed");

        const bounds = (await confirmation.boundingBox())!;
        const workspace = (await page.locator("#main").boundingBox())!;

        expect(
          Math.abs(bounds.x + bounds.width / 2 - (workspace.x + workspace.width / 2)),
        ).toBeLessThan(1);
        expect(bounds.width).toBeLessThanOrEqual(workspace.width - 32);
      }
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
