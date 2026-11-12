import AxeBuilder from "@axe-core/playwright";

import { openNavigation, closeNavigation } from "@merit/test-support/browser/navigation";

import { invitationLink } from "./mailpit.ts";
import { test, expect } from "./workspace-test.ts";

test(
  "organization creation dialog preserves drafts, returns focus, and opens the created record",
  { tag: "@cross-browser" },
  async ({ page, context }, testInfo) => {
    await context.addCookies([
      { name: "merit-local-person", value: "operator", url: "http://127.0.0.1:3002" },
    ]);
    await page.goto("/admin/organizations/new");
    await expect(page).toHaveURL(/\/admin\/organizations$/);
    await page.getByRole("button", { name: "Create organization", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create organization", exact: true });
    const nameInput = dialog.getByRole("textbox", { name: "Organization name" });
    await expect(nameInput).toBeFocused();
    await nameInput.fill("Unfinished foundation");
    await dialog.getByRole("textbox", { name: "Owner email" }).fill("unfinished@");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Resume organization" })).toBeFocused();
    await expect(page).toHaveURL(/\/admin\/organizations$/);
    await page.reload();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Resume organization" }).click();
    await expect(nameInput).toHaveValue("Unfinished foundation");
    await expect(dialog.getByRole("textbox", { name: "Owner email" })).toHaveValue("unfinished@");
    await dialog.getByRole("form").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resume organization" })).toBeFocused();
    await page.getByRole("button", { name: "Resume organization" }).click();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create organization" })).toBeFocused();
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(nameInput).toHaveValue("");
    await expect(dialog.getByRole("textbox", { name: "Owner email" })).toHaveValue("");

    const name = `Dialog ${testInfo.project.name} ${Date.now()}`;
    await nameInput.fill(name);
    await dialog.getByRole("textbox", { name: "Owner email" }).fill("recipient@example.test");
    await expect(dialog.getByRole("button", { name: "Create organization" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Discard changes" })).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath("create-organization-dialog.png"),
      animations: "disabled",
    });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );

    await dialog.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toBeFocused();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Email accepted by sender", { exact: true })).toBeVisible();
  },
);

test("operator provisions through Mailpit, recipient joins and selects multiple workspaces", async ({
  page,
  context,
  request,
  workspaceDatabase,
}, testInfo) => {
  test.setTimeout(120_000);

  const identity = async (person: string) => {
    await context.addCookies([
      {
        name: "merit-local-person",
        value: person,
        url: "http://127.0.0.1:3002",
        sameSite: "Strict",
      },
    ]);
  };

  await identity("dana");
  await page.goto("/app/alder/rounds");
  const workspaceNavigation = await openNavigation(page);

  await expect(workspaceNavigation.getByText("Alder Foundation", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Switch workspace/ })).toHaveCount(0);

  await closeNavigation(page);
  await identity("recipient");
  await page.goto("/admin/organizations");

  await expect(
    page.getByText("Your account doesn’t have access to Merit administration."),
  ).toBeVisible();

  const deniedNavigation = page.getByRole("banner");

  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(deniedNavigation.getByText("Invitation recipient", { exact: true })).toBeVisible();
  await expect(deniedNavigation.getByText("Merit operator", { exact: true })).toHaveCount(0);

  await closeNavigation(page);
  await identity("operator");
  await page.goto("/admin/organizations");

  await expect(page).toHaveTitle("Organizations · Merit administration");

  await page.screenshot({ path: testInfo.outputPath("organizations-list.png") });
  await page.getByRole("button", { name: "Create organization", exact: true }).click();

  await expect(page.getByRole("dialog", { name: "Create organization" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Organization name" })).toBeFocused();
  await expect(
    page.getByText("Permanent address. Use lowercase letters, numbers and hyphens."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "We’ll send an invitation when you create the organization. The owner manages members, appoints administrators and can edit grant work.",
    ),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Organization name", exact: true })
    .fill("Unfinished organization");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Resume organization" })).toBeFocused();
  await page.getByRole("button", { name: "Resume organization", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Organization name", exact: true })).toHaveValue(
    "Unfinished organization",
  );

  await page.screenshot({
    path: testInfo.outputPath("create-organization.png"),
    fullPage: true,
    animations: "disabled",
  });
  const name = `Provisioning ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Organization name", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Organization name", exact: true }).press("Tab");
  const slug = name.toLowerCase().replaceAll(" ", "-");

  await expect(page.getByRole("textbox", { name: "Workspace address", exact: true })).toHaveValue(
    slug,
  );

  await page
    .getByRole("textbox", { name: "Owner email", exact: true })
    .fill("recipient@example.test");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();

  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText("Email accepted by sender", { exact: true })).toBeVisible();
  // Let transient React Aria pending announcements settle after navigation.
  await expect(async () => {
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
  }).toPass({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Open workspace" })).toHaveCount(0);

  const details = page.url();

  await expect(page.locator("html")).toHaveAttribute("data-product-theme", "");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(name);

  await page.getByRole("button", { name: "Edit name", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Organization name", exact: true })).toBeFocused();

  await page
    .getByRole("textbox", { name: "Organization name", exact: true })
    .fill(`${name} edited`);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByRole("button", { name: "Edit name", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

  const firstLink = await invitationLink(request, "recipient@example.test", name);
  await page.screenshot({
    path: testInfo.outputPath("organization-provisioned.png"),
    fullPage: true,
  });

  await expect(page.getByRole("textbox")).toHaveCount(0);

  await page.getByRole("button", { name: "Change recipient", exact: true }).click();
  const email = page.getByRole("textbox", { name: "Owner email", exact: true });
  await email.fill("replacement@example.test");
  await page.getByRole("button", { name: "Change recipient", exact: true }).click();
  const changeRecipient = page.getByRole("dialog", { name: "Change recipient", exact: true });

  await expect(changeRecipient).toContainText(
    "replacement@example.test instead of recipient@example.test",
  );

  await page.keyboard.press("Escape");

  await expect(changeRecipient).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change recipient", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  // Revocation and resend are real browser actions, and invalidate the old email.
  await page.getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Revoke invitation", exact: true })
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();

  await expect(page.getByText("Needs an owner", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite owner", exact: true })).toBeFocused();

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Organizations", exact: true })
    .click();

  await page.getByRole("link", { name, exact: true }).click();

  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Organizations", exact: true })
    .click();
  await page.getByRole("link", { name, exact: true }).click();
  await identity("recipient");
  await page.goto(firstLink);

  await expect(page.getByText(/This invitation was revoked or replaced/)).toBeVisible();

  await identity("operator");
  await page.goto(details);
  await page.getByRole("button", { name: "Invite owner", exact: true }).click();
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Wait one minute after the last invitation to this email, then try again.",
  );

  // Arrange an elapsed cooldown; the integration suite verifies its timing boundaries.
  await workspaceDatabase.query(
    `UPDATE organization_invitations SET created_at = clock_timestamp() - interval '2 minutes'
     WHERE organization_id = (SELECT id FROM organizations WHERE slug = $1) AND email = $2`,
    [slug, "recipient@example.test"],
  );
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();

  await expect(page.getByText("Email accepted by sender", { exact: true })).toBeVisible();

  const link = await invitationLink(request, "recipient@example.test", name);

  expect(link).not.toBe(firstLink);

  await page.goto(`/app/${slug}/rounds`);

  await expect(page.getByRole("heading", { name: "Workspace not available" })).toBeVisible();

  await identity("recipient");
  await page.goto(link);

  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("invitation-acceptance.png") });
  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/app/${slug}/rounds$`));
  await expect(page.getByText("No funding rounds yet.", { exact: true })).toBeVisible();

  await identity("operator");
  await page.goto("/admin/organizations");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  const secondName = `${name} partner`;
  await page.getByRole("textbox", { name: "Organization name", exact: true }).fill(secondName);
  await page.getByRole("textbox", { name: "Organization name", exact: true }).press("Tab");
  await page
    .getByRole("textbox", { name: "Owner email", exact: true })
    .fill("recipient@example.test");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();

  await expect(page.getByRole("heading", { name: secondName, exact: true })).toBeVisible();

  const secondLink = await invitationLink(request, "recipient@example.test", secondName);
  await identity("recipient");
  await page.goto(secondLink);

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/app/${slug}-partner/rounds$`));

  await openNavigation(page);
  await page.getByRole("button", { name: `${secondName}: Switch workspace`, exact: true }).click();

  await expect(page.getByRole("dialog", { name: "Switch workspace", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a workspace" })).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("workspace-switcher.png") });
  await page.getByRole("link", { name, exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/app/${slug}/rounds$`));
  // The previous mobile drawer can still be exiting after the URL changes.
  await expect(page.getByRole("button", { name: "Close navigation", exact: true })).toHaveCount(0);

  await openNavigation(page);

  await expect(
    page.getByRole("button", { name: `${name}: Switch workspace`, exact: true }),
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("workspace-switcher.png") });
  await closeNavigation(page);
  await identity("operator");
  await page.goto(details);

  await expect(page.getByText("Owner joined", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke invitation", exact: true })).toHaveCount(0);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test("joined organization presents its current owner and inline record actions", async ({
  page,
  context,
}, testInfo) => {
  await context.addCookies([
    { name: "merit-local-person", value: "operator", url: "http://127.0.0.1:3002" },
  ]);
  await page.goto("/admin/organizations/alder");

  await expect(page).toHaveTitle("Organization details · Merit");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("heading", { name: "Alder Foundation", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Owner", exact: true })).toContainText("Dana Reed");
  await expect(page.getByRole("heading", { name: "First owner", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Contact the Merit operator/)).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("organization-record.png"), fullPage: true });

  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);

  const addressBefore = (await page.getByText("/app/alder/rounds", { exact: true }).boundingBox())!
    .y;
  await page.getByRole("button", { name: "Edit name", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Organization name", exact: true });

  await expect(name).toBeFocused();

  const addressDuring = (await page.getByText("/app/alder/rounds", { exact: true }).boundingBox())!
    .y;

  expect(Math.abs(addressDuring - addressBefore)).toBeLessThanOrEqual(1);

  await name.fill("A name that will be discarded");
  await page.screenshot({
    path: testInfo.outputPath("organization-record-edit.png"),
    fullPage: true,
  });
  await name.press("Escape");

  await expect(page.getByRole("button", { name: "Edit name", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Alder Foundation", exact: true })).toBeVisible();

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy address", exact: true }).click();

  await expect(page.getByRole("status")).toHaveText("Workspace address copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    new URL("/app/alder/rounds", page.url()).href,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
