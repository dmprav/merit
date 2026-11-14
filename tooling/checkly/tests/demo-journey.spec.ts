import { expect, test } from "@playwright/test";

const rawBaseUrl = process.env.MERIT_BASE_URL?.trim();
if (!rawBaseUrl) {
  throw new Error("MERIT_BASE_URL environment variable is required.");
}
const baseUrl = rawBaseUrl.replace(/\/+$/, "");

test("opens the demo workspace and renders the prepared funding round", async ({ page }) => {
  await page.goto(`${baseUrl}/demo`);
  await page.getByRole("button", { name: "Browse the workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/demo-[^/]+\/rounds$/);
  await expect(
    page.getByRole("link", { name: "Local Connections 2027", exact: true }),
  ).toBeVisible();
});
