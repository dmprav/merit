import { expect, test } from "./workspace-test.ts";

test("development tools switch local identities across the site, admin app and workspace", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open TanStack Devtools", exact: true }).click();
  const panel = page.getByRole("region", { name: "Merit development tools" });

  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Local fixtures");
  await expect(panel.getByRole("button", { name: "Dana Reed" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await panel.getByRole("link", { name: "Mailpit inbox" }).scrollIntoViewIfNeeded();

  await expect(panel.getByRole("link", { name: "Mailpit inbox" })).toBeInViewport();

  await panel.getByRole("heading", { name: "Development environment" }).scrollIntoViewIfNeeded();
  await panel.screenshot({
    path: testInfo.outputPath("merit-devtools.png"),
    animations: "disabled",
  });
  await panel.getByRole("button", { name: "Merit operator", exact: true }).click();

  await expect(panel.getByRole("button", { name: "Merit operator", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await panel.getByRole("link", { name: "Organization administration" }).click();

  await expect(page).toHaveURL(/\/admin\/organizations$/);
  await expect(page.getByRole("heading", { name: "Organizations", exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Invitation recipient", exact: true }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(panel).toContainText("recipient@example.test");
  await panel.getByRole("link", { name: "Organization administration" }).click();

  await expect(page).toHaveURL(/\/admin\/organizations$/);
  await expect(
    page.getByText("Your account doesn’t have access to Merit administration.", {
      exact: true,
    }),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Dana Reed", exact: true }).click();
  await panel.getByRole("link", { name: "Workspace", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/alder\/rounds$/);
  await expect(panel.getByRole("button", { name: "Dana Reed", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(panel.getByRole("link", { name: "Mailpit inbox" })).toHaveAttribute(
    "href",
    "http://127.0.0.1:8025",
  );

  await page.getByRole("button", { name: "TanStack Router", exact: true }).click();

  await expect(
    page.getByRole("button", {
      name: "Open match details for /_product/app/$workspaceSlug/rounds/",
      exact: true,
    }),
  ).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("router-devtools.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close TanStack Devtools", exact: true }).click();

  await expect(panel).not.toBeVisible();
});
