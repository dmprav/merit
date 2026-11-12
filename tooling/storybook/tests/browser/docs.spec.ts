import { test, expect } from "@merit/test-support/browser";

for (const [id, title] of [
  ["overview", "Choose an interface pattern"],
  ["foundations-tokens", "Foundations"],
  ["patterns-page-composition", "Compose a page"],
  ["components-layout-primitives", "Layout primitives"],
  ["components-fields", "Label fields and explain validation"],
  ["patterns-application-shell", "Frame an application"],
  ["patterns-feedback", "Explain outcomes and recovery"],
  ["patterns-person-identity", "Identify people consistently"],
  ["components-dialog", "Frame a focused task"],
  ["patterns-form-dialog", "Create and edit in a dialog"],
  ["patterns-confirmation-dialog", "Confirm a consequential action"],
  ["patterns-editing", "Edit and resume work"],
  ["components-date-field", "Enter a calendar date"],
  ["components-tooltip", "Tooltip"],
]) {
  test(`documentation: ${title}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${id}--docs&viewMode=docs`);

    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await expect(page.locator(".sb-show-errordisplay")).toHaveCount(0);

    if (id === "patterns-confirmation-dialog") {
      await expect(
        page.getByText("The feature owns the operation", { exact: false }),
      ).toBeVisible();
      await expect(page.getByRole("cell", { name: "pendingLabel", exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Review revocation", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "Revoke invitation?" });

      await expect(dialog).toBeVisible();

      await dialog.getByRole("button", { name: "Keep invitation" }).click();

      await expect(dialog).toHaveCount(0);
    }
  });
}

test("fullscreen shell owns its main landmark and uses the viewport", async ({ page }) => {
  await page.goto("/iframe.html?id=patterns-status-message--in-workspace&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  await expect(page.getByRole("main")).toHaveCount(1);

  const bounds = await page.locator("#storybook-root > *").boundingBox();

  expect(bounds?.x).toBe(0);
  expect(bounds?.width).toBe(page.viewportSize()!.width);
});
