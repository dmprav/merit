import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { drizzle } from "drizzle-orm/node-postgres";

import { createFundingApplication } from "@merit/applications/server";
import { createFundingRound } from "@merit/rounds/server";
import { openNavigation, closeNavigation } from "@merit/test-support/browser/navigation";

import { test, expect } from "./workspace-test.ts";

test("deleting preparation returns to the workspace applications list", async ({
  page,
  workspaceDatabase,
}) => {
  const db = drizzle(workspaceDatabase);
  const actor = { userId: "dana" };
  const round = await createFundingRound(db, actor, {
    workspaceSlug: "alder",
    requestId: randomUUID(),
    title: "Intake",
  });
  if (round.status !== "ok") {
    throw new Error("Could not create the round fixture");
  }
  const application = await createFundingApplication(db, actor, {
    workspaceSlug: "alder",
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Unused preparation",
  });
  if (application.status !== "ok") {
    throw new Error("Could not create the application fixture");
  }
  await page.goto(
    `/app/alder/applications/unused-preparation-${application.publicId}?from=applications&round=${round.publicId}&sort=application&direction=descending`,
  );
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("button", { name: "Application actions" }).click();
  await page.getByRole("menuitem", { name: "Delete application", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete application" })
    .getByRole("button", { name: "Delete application", exact: true })
    .click();
  await expect(page).toHaveURL(
    `/app/alder/applications?round=${round.publicId}&sort=application&direction=descending`,
  );
  await expect(page.getByText("No applications in this round yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unused preparation", exact: true })).toHaveCount(0);
});

test(
  "workspace applications preserve round filtering, sorting, and return position",
  { tag: "@cross-browser" },
  async ({ page, workspaceDatabase }, testInfo) => {
    const db = drizzle(workspaceDatabase);
    const actor = { userId: "dana" };
    const round = await createFundingRound(db, actor, {
      workspaceSlug: "alder",
      requestId: randomUUID(),
      title: "Community grants 2028",
    });
    expect(round.status).toBe("ok");
    if (round.status !== "ok") {
      throw new Error("Could not create the round fixture");
    }
    await createFundingApplication(db, actor, {
      workspaceSlug: "alder",
      publicId: round.publicId,
      requestId: randomUUID(),
      title: "Next year's meals",
    });
    await page.goto("/app/alder/rounds");
    await expect(page.getByRole("main")).toBeFocused();
    const navigation = await openNavigation(page);
    await navigation.getByRole("link", { name: "Applications", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "4 of 4 applications" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next year's meals", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add application", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "All rounds Round", exact: true }).click();
    await page.getByRole("option", { name: "Local Connections 2027", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "3 of 4 applications" })).toBeVisible();
    if (testInfo.project.use.isMobile) {
      await page.getByRole("button", { name: /Sort applications/ }).click();
      await page.getByRole("option", { name: "Application (descending)", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Application", exact: true }).click();
      await page.getByRole("button", { name: "Application", exact: true }).click();
    }
    const listUrl = page.url();
    await page.getByRole("link", { name: "Neighbour Table", exact: true }).scrollIntoViewIfNeeded();
    const position = await page.evaluate(() => window.scrollY);
    await page.getByRole("link", { name: "Neighbour Table", exact: true }).click();
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
    await page.getByRole("link", { name: "Back to applications", exact: true }).click();
    await expect(page).toHaveURL(listUrl);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(position);
    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "3 of 4 applications" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("workspace-applications.png"),
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);

    await page.getByRole("button", { name: /New application in/ }).click();
    await page.getByRole("option", { name: "Community grants 2028", exact: true }).click();
    await page.getByRole("button", { name: "Add application", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: /Project title/ }).fill("New community project");
    await dialog.getByRole("button", { name: "Add application", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "New community project", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "Community grants 2028", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to applications", exact: true }).click();
    await expect(page).toHaveURL(listUrl);
    await expect(page.getByRole("status").filter({ hasText: "3 of 5 applications" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  },
);

test(
  "workspace and administration share accessible desktop and compact navigation",
  { tag: "@cross-browser" },
  async ({ page, context }, testInfo) => {
    await context.addCookies([
      { name: "merit-local-person", value: "dana", url: "http://127.0.0.1:3002" },
    ]);
    await page.goto("/app/alder/rounds");

    await expect(page.getByRole("main")).toBeFocused();

    await page.screenshot({ path: testInfo.outputPath("workspace.png"), fullPage: true });
    let navigation = await openNavigation(page);

    await expect(
      navigation.getByRole("link", { name: "Documentation (opens in a new tab)" }),
    ).toHaveAttribute("href", "/docs");
    await expect(navigation.getByText("Dana Reed", { exact: true })).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: "Funding rounds", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: /Account menu/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Administration", exact: true })).toHaveCount(0);

    // Finish the drawer's opening animation before measuring its text contrast.
    await page.evaluate(async () => {
      await Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    await page.screenshot({ path: testInfo.outputPath("navigation.png") });

    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);

    if (testInfo.project.use.isMobile) {
      for (let index = 0; index < 8; index++) {
        await page.keyboard.press("Tab");

        await expect(navigation).toContainText("Dana Reed");
        expect(
          await navigation.evaluate((element) => element.contains(document.activeElement)),
        ).toBe(true);
      }

      await page.keyboard.press("Escape");

      await expect(
        page.getByRole("button", { name: "Open navigation", exact: true }),
      ).toBeFocused();

      navigation = await openNavigation(page);
    }
    await navigation.getByRole("link", { name: "Workspace settings", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/alder\/settings\/members$/);
    await expect(page.getByRole("table", { name: "Members", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await context.addCookies([
      { name: "merit-local-person", value: "operator", url: "http://127.0.0.1:3002" },
    ]);
    await page.goto("/app");

    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.getByRole("link", { name: "Administration", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Administration", exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/organizations$/);
    await expect(page.getByRole("main")).toBeFocused();

    await openNavigation(page);

    await expect(
      page.getByRole("link", { name: "Documentation (opens in a new tab)" }),
    ).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("button", { name: /Switch workspace/ })).toHaveCount(0);

    await closeNavigation(page);

    const create = page.getByRole("button", { name: "Create organization", exact: true });

    if (!testInfo.project.use.isMobile) {
      expect((await create.boundingBox())!.height).toBeLessThan(40);
    }

    await page.screenshot({ path: testInfo.outputPath("organizations.png"), fullPage: true });

    if (testInfo.project.use.isMobile) {
      await openNavigation(page);
      await page.setViewportSize({ width: 1000, height: 844 });

      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("complementary")).toBeVisible();
      await expect(page.getByRole("main")).not.toHaveAttribute("aria-hidden", "true");

      await page.setViewportSize({ width: 390, height: 844 });

      await expect(
        page.getByRole("button", { name: "Open navigation", exact: true }),
      ).toBeVisible();
    }

    await closeNavigation(page);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  },
);

test(
  "recovery keeps workspace navigation for missing pages and uses full-screen states for denied contexts",
  { tag: "@cross-browser" },
  async ({ page, context }, testInfo) => {
    await page.goto("/app/alder/applications/missing");

    await expect(
      page.getByRole("heading", { name: "Application not available", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Workspace · Merit");
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);

    const navigation = await openNavigation(page);

    await expect(navigation.getByText("Alder Foundation", { exact: true })).toBeVisible();
    await expect(navigation.getByText("Dana Reed", { exact: true })).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("missing-application-navigation.png") });
    await navigation.getByRole("link", { name: "Funding rounds", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Funding rounds", exact: true })).toBeVisible();

    await context.addCookies([
      { name: "merit-local-person", value: "operator", url: "http://127.0.0.1:3002" },
    ]);
    await page.reload();

    await expect(
      page.getByRole("heading", { name: "Workspace not available", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("complementary")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("banner").getByText("Merit operator", { exact: true }),
    ).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("operator-workspace-denied.png") });

    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);

    await page.getByRole("link", { name: "Back to Merit", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Organizations", exact: true })).toBeVisible();

    await context.addCookies([
      { name: "merit-local-person", value: "manager", url: "http://127.0.0.1:3002" },
    ]);
    await page.reload();

    await expect(
      page.getByRole("heading", {
        name: "Administration access required",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
    await expect(page.getByRole("complementary")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toHaveCount(0);
    await expect(page.getByRole("banner").getByText("Dana Reed", { exact: true })).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("manager-administration-denied.png") });

    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);

    await page.getByRole("link", { name: "Back to Merit", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/alder\/rounds$/);
    await expect(page.getByRole("heading", { name: "Funding rounds", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  },
);

test("application list preserves search, filter, sort, and position when returning from an application", async ({
  page,
}, testInfo) => {
  await page.goto("/app/alder/rounds");

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("link", { name: "Local Connections 2027", exact: true }).click();
  await page.getByRole("tab", { name: /Applications/ }).click();
  await page.getByRole("searchbox", { name: "Search applications" }).fill("repair");
  await page.getByRole("button", { name: /Show/ }).click();
  await page.getByRole("option", { name: "Awaiting reviews", exact: true }).click();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Sort applications/ }).click();
    await page.getByRole("option", { name: "Requested (descending)", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Requested", exact: true }).click();
    await page.getByRole("button", { name: "Requested", exact: true }).click();
  }

  await expect(page.getByRole("status").filter({ hasText: "1 of 3 applications" })).toBeVisible();

  await page
    .getByRole("link", { name: "Workshop Saturdays", exact: true })
    .scrollIntoViewIfNeeded();
  const listPosition = await page.evaluate(() => window.scrollY);
  await page.getByRole("link", { name: "Workshop Saturdays", exact: true }).click();

  await expect(page.getByRole("main")).toBeFocused();

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Local Connections 2027", exact: true })
    .click();

  await expect(page).toHaveURL(/section=applications/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(listPosition);
  await expect(page.getByRole("searchbox")).toHaveValue("repair");
  await expect(page.getByRole("button", { name: /Show/ })).toContainText("Awaiting reviews");

  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("button", { name: /Sort applications/ })).toContainText(
      "Requested (descending)",
    );
  } else {
    await expect(page.getByRole("columnheader", { name: "Requested" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  }

  await expect(
    page.getByRole("table", { name: "Applications", exact: true }).getByRole("row"),
  ).toHaveCount(2);

  await page.getByRole("button", { name: "Clear filters" }).click();

  await expect(
    page.getByRole("table", { name: "Applications", exact: true }).getByRole("row"),
  ).toHaveCount(4);

  await page.screenshot({ path: testInfo.outputPath("application-list.png"), fullPage: true });

  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
});

test("personal pins stay under their object type and survive reloads @cross-browser", async ({
  page,
  context,
  workspaceDatabase,
}, testInfo) => {
  const round = await createFundingRound(
    drizzle(workspaceDatabase),
    { userId: "dana" },
    {
      workspaceSlug: "alder",
      requestId: randomUUID(),
      title: "Community grants 2028",
    },
  );
  if (round.status !== "ok") {
    throw new Error("Could not create the round fixture");
  }
  await page.goto("/app/alder/rounds");
  await expect(page.getByRole("main")).toBeFocused();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Local Connections 2027", exact: true })
    .click();
  await page.getByRole("button", { name: "Pin Local Connections 2027", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unpin Local Connections 2027", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/app/alder/rounds/${round.publicId}`);
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("button", { name: "Pin Community grants 2028", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unpin Community grants 2028", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  let navigation = await openNavigation(page);
  const rounds = navigation.getByRole("region", { name: "Funding rounds", exact: true });
  await rounds.getByRole("button", { name: "Pin actions for Community grants 2028" }).click();
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await expect(rounds.getByRole("link")).toHaveText([
    "Funding rounds",
    "Community grants 2028",
    "Local Connections 2027",
  ]);
  await navigation.getByRole("link", { name: "Applications", exact: true }).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Workshop Saturdays", exact: true })
    .click();
  await page.getByRole("button", { name: "Pin Workshop Saturdays", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unpin Workshop Saturdays", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("main")).toBeFocused();
  navigation = await openNavigation(page);
  const applications = navigation.getByRole("region", { name: "Applications", exact: true });
  await expect(
    applications.getByRole("link", {
      name: "Workshop Saturdays · Local Connections 2027",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("region", { name: "Funding rounds", exact: true }).getByRole("link"),
  ).toHaveText(["Funding rounds", "Community grants 2028", "Local Connections 2027"]);
  await page.screenshot({ path: testInfo.outputPath("personal-pins.png"), animations: "disabled" });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await applications.getByRole("button", { name: "Pin actions for Workshop Saturdays" }).click();
  await page.getByRole("menuitem", { name: "Unpin", exact: true }).click();
  await expect(
    applications.getByRole("link", {
      name: "Workshop Saturdays · Local Connections 2027",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(applications.getByRole("link", { name: "Applications", exact: true })).toBeFocused();
  await navigation.getByRole("link", { name: "Workspace settings", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/alder\/settings\/members$/);
  await expect(page.getByRole("heading", { name: "Members & access", exact: true })).toBeVisible();
  await page.goto("/app/alder/team");
  await expect(page).toHaveURL(/\/app\/alder\/settings\/members$/);
  await expect(page.getByRole("main")).toBeFocused();
  navigation = await openNavigation(page);
  await navigation.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/alder\/contacts$/);
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await context.addCookies([
    { name: "merit-local-person", value: "operator", url: "http://127.0.0.1:3002" },
  ]);
  await page.goto("/reviews");
  await expect(page.getByRole("main")).toBeFocused();
  navigation = await openNavigation(page);
  await expect(navigation.getByRole("button", { name: /Pin actions for/ })).toHaveCount(0);
});
