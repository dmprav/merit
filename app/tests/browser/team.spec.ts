import AxeBuilder from "@axe-core/playwright";

import { openNavigation, closeNavigation } from "@merit/test-support/browser/navigation";

import { invitationLink } from "./mailpit.ts";
import { test, expect } from "./workspace-test.ts";

test("owner invites an administrator, grant access is explicit, and removal explains handover", async ({
  page,
  context,
  request,
}, testInfo) => {
  const open = async (url: string) => {
    await page.goto(url);

    await expect(page.getByRole("main")).toBeFocused();
  };

  const identity = (person: string) =>
    context.addCookies([
      {
        name: "merit-local-person",
        value: person,
        url: "http://127.0.0.1:3002",
        sameSite: "Strict",
      },
    ]);

  const name = `Team ${testInfo.project.name} ${Date.now()}`;
  const slug = name.toLowerCase().replaceAll(" ", "-");
  await identity("operator");
  await open("/admin/organizations");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await page.getByRole("textbox", { name: "Organization name", exact: true }).fill(name);
  await page
    .getByRole("textbox", { name: "Owner email", exact: true })
    .fill("recipient@example.test");
  await page.getByRole("button", { name: "Create organization", exact: true }).click();

  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

  const ownerLink = await invitationLink(request, "recipient@example.test", name);
  await identity("recipient");
  await open(ownerLink);

  await expect(page.getByText("Organization owner", { exact: true })).toBeVisible();
  await expect(page.getByText("Manage membership and appoint administrators.")).toBeVisible();

  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/app/${slug}/rounds$`));
  await expect(page.getByRole("main")).toBeFocused();

  await openNavigation(page);
  await page.getByRole("link", { name: "Workspace settings", exact: true }).click();

  await expect(page).toHaveTitle("Members & access · Merit");

  await page.screenshot({ path: testInfo.outputPath("team-directory.png"), fullPage: true });
  await page.getByRole("button", { name: "Invite member", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Invite member", exact: true });
  await dialog.getByRole("textbox", { name: "Email address" }).fill("dana@example.test");
  await dialog.getByRole("button", { name: /Organization responsibility/ }).click();
  await page.getByRole("option", { name: "Administrator", exact: true }).click();

  await expect(
    dialog.getByText("Can manage members and grant access, including to themselves."),
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("team-invite.png"), fullPage: true });
  await dialog.getByRole("button", { name: /Grant-work access/ }).click();
  await page.getByRole("option", { name: "No grant-work access", exact: true }).click();
  await dialog.getByRole("button", { name: "Invite member", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Email accepted by sender", { exact: true })).toBeVisible();

  const danaLink = await invitationLink(request, "dana@example.test", name);
  await identity("manager");
  await open(danaLink);

  await expect(
    page.getByText("This invitation does not grant access to grant work."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/app/${slug}/settings/members$`));

  await openNavigation(page);

  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Funding rounds" }),
  ).toHaveCount(0);

  await closeNavigation(page);
  await open(`/app/${slug}/rounds`);

  await expect(page).toHaveURL(new RegExp(`/app/${slug}/settings/members$`));

  const dana = () => page.getByRole("row").filter({ hasText: "dana@example.test" });

  await dana().getByRole("button", { name: "Actions for Dana Reed", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit access", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit access for Dana Reed" });

  await expect(dialog.getByRole("button", { name: /Organization responsibility/ })).toHaveCount(0);

  await dialog.getByRole("button", { name: /Grant-work access/ }).click();
  await page.getByRole("option", { name: "Program manager", exact: true }).click();
  await dialog.getByRole("button", { name: "Save access", exact: true }).click();

  await expect(dialog).toHaveCount(0);

  await openNavigation(page);

  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Funding rounds" }),
  ).toBeVisible();

  await closeNavigation(page);
  await page.getByRole("button", { name: "Invite member", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Invite member", exact: true });

  await expect(dialog.getByRole("button", { name: /Organization responsibility/ })).toHaveCount(0);

  await dialog.getByRole("textbox", { name: "Email address" }).fill("handover@example.test");
  await dialog.getByRole("button", { name: "Invite member", exact: true }).click();

  await expect(dialog).toHaveCount(0);

  const invitationActions = page.getByRole("button", {
    name: "Actions for invitation to handover@example.test",
  });
  await invitationActions.click();
  await page.getByRole("menuitem", { name: "Resend", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Wait one minute after the last invitation to this email, then try again.",
  );
  await expect(invitationActions).toBeFocused();

  await identity("recipient");
  await page.reload();

  // AppPage focuses main after hydration; server-rendered buttons are not interactive yet.
  await expect(page.getByRole("main")).toBeFocused();
  await expect(async () =>
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]),
  ).toPass({ timeout: 10000 });
  await expect(page.getByRole("tab", { name: /Members/ })).toHaveAttribute("aria-selected", "true");

  await page.screenshot({ path: testInfo.outputPath("team-members.png"), fullPage: true });
  await page.getByRole("tab", { name: /Invitations/ }).click();

  await expect(page.getByRole("table", { name: "Members" })).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("team-invitations.png"), fullPage: true });
  await invitationActions.click();
  await page.getByRole("menuitem", { name: "Revoke", exact: true }).click();
  const revoke = page.getByRole("dialog", { name: "Revoke invitation?" });

  await expect(revoke).toContainText("handover@example.test");
  await expect(revoke.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(invitationActions).toBeFocused();

  await page.getByRole("tab", { name: /Members/ }).click();
  await dana().getByRole("button", { name: "Actions for Dana Reed", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove from organization", exact: true }).click();
  dialog = page.getByRole("dialog", { name: `Remove Dana Reed from ${name}?` });

  await expect(dialog).toContainText("handover@example.test");
  await expect(dialog).toContainText(
    "Merit cannot yet list everything this person needs to hand over.",
  );
  await expect(dialog).toContainText("Their existing work and authorship will remain");

  await page.screenshot({ path: testInfo.outputPath("team-removal.png"), fullPage: true });
  await page.keyboard.press("Escape");

  await expect(dialog).toHaveCount(0);
  await expect(
    dana().getByRole("button", { name: "Actions for Dana Reed", exact: true }),
  ).toBeFocused();

  await dana().getByRole("button", { name: "Actions for Dana Reed", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove from organization", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove from organization", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(dana()).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Members/ })).toBeFocused();

  await page.getByRole("tab", { name: /Invitations 0/ }).click();

  await expect(page.getByText("No outstanding invitations.")).toBeVisible();

  await identity("manager");
  await open(`/app/${slug}/settings/members`);

  await expect(page.getByRole("heading", { name: "Workspace not available" })).toBeVisible();

  await open(danaLink);

  await expect(page.getByRole("button", { name: "Open workspace", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open workspace", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Your account no longer has access through this invitation.",
  );

  await open("/app/alder/rounds");

  await expect(page.getByRole("heading", { name: "Funding rounds", exact: true })).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
