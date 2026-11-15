import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { drizzle } from "drizzle-orm/node-postgres";

import { createFundingApplication } from "@merit/applications/server";
import { createNavigationService } from "@merit/grantmaking/server";
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
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Applications", exact: true })
      .click();
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
        .getByRole("link", { name: "Applications", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Applications", exact: true })
      .click();
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
  browser,
  context,
  workspaceDatabase,
}, testInfo) => {
  if (testInfo.project.use.isMobile) {
    // Keep the iOS long-press path coherent on both macOS and Linux test hosts.
    await context.addInitScript(() => {
      Object.defineProperties(navigator, {
        platform: { get: () => "iPhone" },
        userAgent: {
          get: () =>
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        },
        userAgentData: { get: () => undefined },
        maxTouchPoints: { get: () => 5 },
      });
    });
  }
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
  // Wait for hydration before a link can interrupt the initial module loading.
  await expect(page.getByRole("main")).toBeFocused();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Local Connections 2027", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pin Local Connections 2027 to sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pin Local Connections 2027 to sidebar", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/app/alder/rounds/${round.publicId}`);
  await expect(page.getByRole("main")).toBeFocused();
  await page
    .getByRole("button", { name: "Pin Community grants 2028 to sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pin Community grants 2028 to sidebar", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  let navigation = await openNavigation(page);
  const rounds = navigation.getByRole("region", { name: "Funding rounds", exact: true });
  const pinActions = rounds.getByRole("link", { name: "Community grants 2028", exact: true });
  const unpin = rounds.getByRole("button", { name: "Unpin Community grants 2028 from sidebar" });
  await expect(rounds.getByRole("button", { name: /Reorder/ })).toHaveCount(0);
  if (testInfo.project.use.isMobile) {
    await expect(unpin.locator("..")).toHaveCSS("opacity", "1");
  } else {
    await page.mouse.move(900, 500);
    await expect(unpin.locator("..")).toHaveCSS("opacity", "0");
    const bounds = (await pinActions.boundingBox())!;
    expect(bounds.width).toBeCloseTo((await pinActions.locator("..").boundingBox())!.width, 0);
    await pinActions.hover();
    expect(await pinActions.boundingBox()).toEqual(bounds);
    await expect(unpin.locator("..")).toHaveCSS("opacity", "1");
  }
  const contextShortcut = await page.evaluate(() =>
    navigator.platform.includes("Mac") ? "Control+Enter" : "Shift+F10",
  );
  const originalUrl = page.url();
  await pinActions.focus();
  if (testInfo.project.use.isMobile) {
    await page.evaluate(async () => {
      await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
    });
    const bounds = (await pinActions.boundingBox())!;
    const point = {
      clientX: bounds.x + 20,
      clientY: bounds.y + 20,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
    };
    if (testInfo.project.use.browserName === "chromium") {
      const touch = await context.newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: point.clientX, y: point.clientY }],
      });
      await expect(page.getByRole("menuitem", { name: "Move up", exact: true })).toBeVisible();
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await touch.detach();
    } else {
      await pinActions.dispatchEvent("pointerdown", { ...point, buttons: 1 });
      await expect(page.getByRole("menuitem", { name: "Move up", exact: true })).toBeVisible();
      await pinActions.dispatchEvent("pointerup", { ...point, buttons: 0 });
    }
  } else {
    await page.keyboard.press(contextShortcut);
    await expect(page.getByRole("menuitem", { name: "Move up", exact: true })).toBeVisible();
  }
  expect(page.url()).toBe(originalUrl);
  await expect
    .poll(() =>
      page
        .getByRole("menu")
        .evaluate((menu) =>
          (menu.closest('[role="dialog"]') ?? menu).contains(document.activeElement),
        ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(pinActions).toBeFocused();
  await pinActions.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await expect(rounds.getByRole("link")).toHaveText([
    "Funding rounds",
    "Community grants 2028",
    "Local Connections 2027",
  ]);
  await expect(pinActions).toBeFocused();
  if (!testInfo.project.use.isMobile) {
    const currentUrl = page.url();
    const source = rounds.getByRole("link", { name: "Local Connections 2027", exact: true });
    const target = rounds.getByRole("link", { name: "Community grants 2028", exact: true });
    await source.dragTo(target, { targetPosition: { x: 10, y: 3 } });
    await expect(rounds.getByRole("link")).toHaveText([
      "Funding rounds",
      "Local Connections 2027",
      "Community grants 2028",
    ]);
    expect(page.url()).toBe(currentUrl);
    await expect(
      rounds.getByRole("button", { name: "Unpin Community grants 2028 from sidebar" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    await target.dragTo(source, { targetPosition: { x: 10, y: 3 } });
    await expect(rounds.getByRole("link")).toHaveText([
      "Funding rounds",
      "Community grants 2028",
      "Local Connections 2027",
    ]);
    expect(page.url()).toBe(currentUrl);
  }
  await navigation.getByRole("link", { name: "Applications", exact: true }).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Workshop Saturdays", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pin Workshop Saturdays to sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pin Workshop Saturdays to sidebar", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("main")).toBeFocused();
  const serverPage = await browser.newPage({
    javaScriptEnabled: false,
    viewport: { width: 1425, height: 984 },
    isMobile: false,
    hasTouch: false,
    storageState: { cookies: await context.cookies(), origins: [] },
  });
  try {
    await serverPage.goto(page.url());
    await expect(
      serverPage.getByRole("button", { name: "Pin Workshop Saturdays to sidebar", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(serverPage.getByText("Loading account…", { exact: true })).toHaveCount(0);
    await expect(
      serverPage
        .getByRole("complementary", { name: "", exact: true })
        .getByText("Dana Reed", { exact: true }),
    ).toBeVisible();
    await expect(
      serverPage.getByRole("link", {
        name: "Workshop Saturdays Local Connections 2027",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await serverPage.close();
  }
  navigation = await openNavigation(page);
  const applications = navigation.getByRole("region", { name: "Applications", exact: true });
  await expect(
    applications.getByRole("link", {
      name: "Workshop Saturdays Local Connections 2027",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("region", { name: "Funding rounds", exact: true }).getByRole("link"),
  ).toHaveText(["Funding rounds", "Community grants 2028", "Local Connections 2027"]);
  // Measure the drawer after its entrance animation has reached its final contrast.
  await page.evaluate(async () => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    );
  });
  await page.screenshot({ path: testInfo.outputPath("personal-pins.png"), animations: "disabled" });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await applications
    .getByRole("link", { name: "Workshop Saturdays Local Connections 2027", exact: true })
    .focus();
  await applications
    .getByRole("button", { name: "Unpin Workshop Saturdays from sidebar", exact: true })
    .click();
  await expect(
    applications.getByRole("link", {
      name: "Workshop Saturdays Local Connections 2027",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(applications.getByRole("link", { name: "Applications", exact: true })).toBeFocused();
  await navigation.getByRole("link", { name: "Workspace settings", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/alder\/settings\/members$/);
  await expect(page.getByRole("heading", { name: "Members & access", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  navigation = await openNavigation(page);
  await navigation.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/alder\/contacts$/);
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await context.addCookies([
    { name: "merit-local-person", value: "operator", url: "http://127.0.0.1:3002" },
  ]);
  await page.goto("/admin/organizations");
  await expect(page.getByRole("main")).toBeFocused();
  navigation = await openNavigation(page);
  await expect(navigation.getByRole("button", { name: /Reorder/ })).toHaveCount(0);
});

test("personal pins keep a fixed preview and manage the full overflow collection @cross-browser", async ({
  page,
  workspaceDatabase,
}, testInfo) => {
  const db = drizzle(workspaceDatabase);
  const actor = { userId: "dana" };
  const pins = createNavigationService({
    database: (operation) => operation(db),
    verifiedEmails: async () => [],
  });
  const ids: string[] = [];
  for (let index = 1; index <= 7; index++) {
    const round = await createFundingRound(db, actor, {
      workspaceSlug: "alder",
      requestId: randomUUID(),
      title: `Pinned round ${index}`,
    });
    if (round.status !== "ok") {
      throw new Error("Could not prepare pinned round");
    }
    ids.push(round.publicId);
  }
  await page.goto("/app/alder/rounds");
  await expect(page.getByRole("main")).toBeFocused();
  for (const id of ids) {
    expect(
      (
        await pins.change(
          { userId: "local-workspace-manager" },
          { action: "pin", target: { kind: "round", id } },
        )
      ).status,
    ).toBe("ok");
  }
  await page.goto(`/app/alder/rounds/${ids[6]}`);
  await expect(page.getByRole("main")).toBeFocused();
  let navigation = await openNavigation(page);
  let rounds = navigation.getByRole("region", { name: "Funding rounds", exact: true });
  await expect(rounds.getByRole("link")).toHaveCount(6);
  await expect(rounds.getByRole("link", { name: "Funding rounds", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  if (!testInfo.project.use.isMobile) {
    await rounds
      .getByRole("link", { name: "Pinned round 1", exact: true })
      .dragTo(rounds.getByRole("link", { name: "Pinned round 5", exact: true }), {
        targetPosition: { x: 10, y: 29 },
      });
    await expect(rounds.getByRole("link")).toHaveText([
      "Funding rounds",
      "Pinned round 2",
      "Pinned round 3",
      "Pinned round 4",
      "Pinned round 5",
      "Pinned round 1",
    ]);
    await expect(
      rounds.getByRole("button", { name: "Unpin Pinned round 1 from sidebar" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    await page.mouse.move(700, 500);
    await page.mouse.up();
  }
  const overflow = rounds.getByRole("button", { name: "2 more…" });
  await overflow.click();
  const popup = page.getByRole("dialog", { name: "Pinned funding rounds", exact: true });
  await expect(popup.getByRole("link")).toHaveCount(7);
  await expect(popup.getByRole("link", { name: "Pinned round 7", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(rounds.getByRole("link")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(overflow).toBeFocused();
  await overflow.click();
  await expect(popup.getByRole("button", { name: /Reorder/ })).toHaveCount(0);
  const reorder = popup.getByRole("link", { name: "Pinned round 7", exact: true });
  await reorder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await expect(popup.getByRole("link").nth(5)).toHaveText("Pinned round 7");
  await expect(reorder).toBeFocused();
  await expect(
    popup.getByRole("button", { name: "Unpin Pinned round 7 from sidebar" }),
  ).not.toHaveAttribute("aria-disabled", "true");
  await reorder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await expect(popup.getByRole("link").nth(4)).toHaveText("Pinned round 7");
  await expect(reorder).toBeFocused();
  await popup.getByRole("link", { name: "Pinned round 6", exact: true }).click();
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  navigation = await openNavigation(page);
  rounds = navigation.getByRole("region", { name: "Funding rounds", exact: true });
  await expect(rounds.getByRole("link").last()).toHaveText("Pinned round 7");
  const fifth = rounds.getByRole("link", { name: "Pinned round 7", exact: true });
  await fifth.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move down", exact: true }).click();
  await expect(rounds.getByRole("button", { name: "2 more…" })).toBeFocused();
  await expect(fifth).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("main")).toBeFocused();
  navigation = await openNavigation(page);
  rounds = navigation.getByRole("region", { name: "Funding rounds", exact: true });
  await rounds.getByRole("button", { name: "2 more…" }).click();
  await expect(popup.getByRole("link").nth(5)).toHaveText("Pinned round 7");
  await expect(popup.getByRole("link").last()).toHaveText("Pinned round 6");
  await popup.getByRole("button", { name: "Unpin Pinned round 7 from sidebar" }).click();
  await expect(popup.getByRole("link", { name: "Pinned round 6", exact: true })).toBeFocused();
  await expect(popup.getByRole("link")).toHaveCount(6);
  await popup.getByRole("button", { name: "Unpin Pinned round 6 from sidebar" }).click();
  await expect(popup).toHaveCount(0);
  await expect(rounds.getByRole("link", { name: "Funding rounds", exact: true })).toBeFocused();
  await expect(rounds.getByRole("button", { name: /more…/ })).toHaveCount(0);
});
