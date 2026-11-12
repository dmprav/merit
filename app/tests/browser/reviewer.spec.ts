import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";

import { openNavigation, closeNavigation } from "@merit/test-support/browser/navigation";

import { test, expect } from "./workspace-test.ts";

test("an invited reviewer independently accepts, saves, submits and amends @cross-browser", async ({
  page,
  newContext,
  workspaceDatabase,
  browserErrors,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/app/alder/rounds");
  await expect(page.getByRole("main")).toBeFocused();
  const application = (
    await workspaceDatabase.query<{
      id: string;
      organization_id: string;
      round_id: string;
      material_version: number;
      criteria_version: number;
    }>(
      "SELECT c.id, c.organization_id, c.round_id, c.material_version, r.criteria_version FROM application_cases c JOIN funding_rounds r ON r.id = c.round_id JOIN organizations o ON o.id = c.organization_id WHERE o.slug = 'alder' LIMIT 1",
    )
  ).rows[0]!;
  const contactId = randomUUID();
  await workspaceDatabase.query(
    "INSERT INTO contacts (id, organization_id, name, email, affiliation) VALUES ($1,$2,'Independent reviewer','recipient@example.test','')",
    [contactId, application.organization_id],
  );
  await workspaceDatabase.query(
    "INSERT INTO review_requests (organization_id, case_id, id, contact_id, reviewer, material_version, criteria_round_id, criteria_version, status, position) VALUES ($1,$2,$3,$4,'Independent reviewer',$5,$6,$7,'outstanding',100)",
    [
      application.organization_id,
      application.id,
      randomUUID(),
      contactId,
      application.material_version,
      application.round_id,
      application.criteria_version,
    ],
  );
  await page.goto(`/app/alder/applications/${application.id}?tab=reviews`);
  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
  const panel = page.getByRole("region", { name: "Reviewer participation" });
  await panel.getByRole("button", { name: "Invite reviewer", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "Invite reviewer", exact: true });
  await invite.getByRole("button", { name: "Invite reviewer", exact: true }).click();
  await expect(invite).not.toBeVisible();
  await expect(panel.getByText("Awaiting acceptance", { exact: true })).toBeVisible();
  const assignmentId = (
    await workspaceDatabase.query<{ id: string }>(
      "SELECT id FROM review_assignments WHERE case_id = $1",
      [application.id],
    )
  ).rows[0]!.id;
  const context = await newContext({ ...testInfo.project.use });
  await context.addCookies([
    { name: "merit-local-person", value: "recipient", url: new URL(page.url()).origin },
  ]);
  const reviewer = await context.newPage();
  try {
    await reviewer.goto(`/reviews/${assignmentId}`);
    await expect(reviewer.getByRole("main")).toBeFocused();
    await expect(
      reviewer.getByRole("heading", { name: "Application material", exact: true }),
    ).toHaveCount(0);
    await expect(reviewer.getByRole("link", { name: "Contacts", exact: true })).toHaveCount(0);
    await reviewer.getByRole("button", { name: "Accept review", exact: true }).click();
    await expect(
      reviewer.getByRole("heading", { name: "Application material", exact: true }),
    ).toBeVisible();
    const title = await reviewer.getByRole("heading", { level: 1 }).innerText();
    await reviewer.getByRole("button", { name: `Pin ${title}`, exact: true }).click();
    await expect(
      reviewer.getByRole("button", { name: `Unpin ${title}`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const reviewNavigation = await openNavigation(reviewer);
    await expect(
      reviewNavigation
        .getByRole("region", { name: "My reviews", exact: true })
        .getByRole("link", { name: `${title} · Alder Foundation`, exact: true }),
    ).toHaveAttribute("href", `/reviews/${assignmentId}`);
    await expect(
      reviewNavigation.getByRole("link", { name: "Funding rounds", exact: true }),
    ).toHaveCount(0);
    await expect(
      reviewNavigation.getByRole("link", { name: "Workspace settings", exact: true }),
    ).toHaveCount(0);
    await reviewer.screenshot({
      path: testInfo.outputPath("reviewer-pins.png"),
      animations: "disabled",
    });
    await closeNavigation(reviewer);
    await reviewer.screenshot({
      path: testInfo.outputPath("reviewer-workspace.png"),
      animations: "disabled",
    });
    expect(
      (
        await new AxeBuilder({ page: reviewer })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await reviewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await reviewer.getByRole("button", { name: "Funding position" }).click();
    await reviewer.getByRole("option", { name: "Fund", exact: true }).click();
    await reviewer.getByRole("textbox", { name: "Proposed amount" }).fill("12000");
    await reviewer
      .getByRole("textbox", { name: "Overall reasoning" })
      .fill("Independent assessment grounded in the application evidence.");
    await expect(reviewer.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    await openNavigation(reviewer);
    const docs = reviewer.getByRole("link", {
      name: "Documentation (opens in a new tab)",
      exact: true,
    });
    const opening = reviewer.waitForEvent("popup");
    if (testInfo.project.use.isMobile) {
      await docs.tap();
    } else {
      await docs.focus();
      await reviewer.keyboard.press("Enter");
    }
    const guide = await opening;
    await expect(guide).toHaveURL(/\/docs$/);
    await expect(guide).toHaveTitle("Docs · Merit");
    await expect(guide.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible();
    await guide.close();
    await closeNavigation(reviewer);
    await expect(reviewer.getByRole("textbox", { name: "Overall reasoning" })).toHaveValue(
      "Independent assessment grounded in the application evidence.",
    );
    await reviewer.reload();
    await expect(reviewer.getByRole("main")).toBeFocused();
    await expect(reviewer.getByRole("textbox", { name: "Overall reasoning" })).toHaveValue(
      "Independent assessment grounded in the application evidence.",
    );
    await expect(
      reviewer.getByRole("button", { name: `Unpin ${title}`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const reasoning = "Keep this assessment while consulting the assignment list.";
    await context.setOffline(true);
    try {
      await reviewer.getByRole("textbox", { name: "Overall reasoning" }).fill(reasoning);
      await expect(reviewer.getByRole("alert")).toContainText("Your text is still here");
      await reviewer
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "My reviews", exact: true })
        .click();
      const leave = reviewer.getByRole("dialog", { name: "Leave with unsaved changes?" });
      await expect(leave).toBeVisible();
      await leave.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(leave).not.toBeVisible();
      await expect(reviewer.getByRole("textbox", { name: "Overall reasoning" })).toHaveValue(
        reasoning,
      );
      // Only the deliberately offline request may produce a browser error.
      browserErrors.splice(0).forEach((error) =>
        expect(error).toMatchObject({
          type: "console",
          message: expect.stringMatching(
            /ERR_INTERNET_DISCONNECTED|Failed to fetch|Load failed|NetworkError|WebKit encountered an internal error/,
          ),
        }),
      );
    } finally {
      await context.setOffline(false);
    }
    await reviewer.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(reviewer.getByText("Draft saved", { exact: true })).toBeVisible();
    await reviewer
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "My reviews", exact: true })
      .click();
    await expect(reviewer.getByRole("heading", { name: "My reviews", exact: true })).toBeVisible();
    await reviewer.getByRole("link", { name: title, exact: true }).click();
    await expect(reviewer.getByRole("textbox", { name: "Overall reasoning" })).toHaveValue(
      reasoning,
    );
    await reviewer.getByRole("button", { name: "Submit assessment", exact: true }).click();
    await expect(
      reviewer.getByRole("status").filter({ hasText: "Your assessment has been submitted." }),
    ).toHaveCount(1);
    await reviewer.getByRole("button", { name: "Amend assessment", exact: true }).click();
    await reviewer
      .getByRole("textbox", { name: "Overall reasoning" })
      .fill("Amended independent judgment.");
    await reviewer
      .getByRole("textbox", { name: "Explain your amendment" })
      .fill("Clarified the evidence interpretation.");
    await reviewer.getByRole("button", { name: "Submit amendment", exact: true }).click();
    await expect(
      reviewer.getByRole("status").filter({ hasText: "Your assessment has been submitted." }),
    ).toHaveCount(1);
    await expect(
      reviewer.getByText("Amended independent judgment.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
    await expect(panel.getByText("Submitted", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "End access", exact: true }).click();
    await page
      .getByRole("dialog", { name: "End Independent reviewer’s access?" })
      .getByRole("button", { name: "End access", exact: true })
      .click();
    await expect(panel.getByText("Access ended", { exact: true })).toBeVisible();
    await reviewer.reload();
    await expect(reviewer.getByRole("main")).toBeFocused();
    await expect(reviewer.getByText("Access ended", { exact: true })).toBeVisible();
    await expect(
      reviewer.getByRole("heading", { name: "Application material", exact: true }),
    ).toHaveCount(0);
    await workspaceDatabase.query(
      "INSERT INTO memberships (organization_id, user_id, role, administration) SELECT $1, id, 'member', 'none' FROM app_users WHERE clerk_user_id = 'local_recipient'",
      [application.organization_id],
    );
    await reviewer.reload();
    await expect(reviewer.getByRole("main")).toBeFocused();
    const memberNavigation = await openNavigation(reviewer);
    await memberNavigation
      .getByRole("button", { name: "My reviews: Switch workspace", exact: true })
      .click();
    await reviewer
      .getByRole("dialog", { name: "Switch workspace", exact: true })
      .getByRole("link", { name: "Alder Foundation", exact: true })
      .click();
    await expect(reviewer).toHaveURL(/\/app\/alder\/settings\/members$/);
    await expect(
      reviewer.getByRole("heading", { name: "Members & access", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
