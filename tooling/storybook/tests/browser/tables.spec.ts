import { test, expect, checkPage } from "@merit/test-support/browser";

for (const id of [
  "features-funding-rounds-list--multiple-rounds",
  "features-funding-rounds-overview--applications",
  "features-team-members--long-and-missing-identity",
  "features-team-invitations--delivery-states",
  "features-administration-organizations--populated",
]) {
  test(`shared table labels in ${id}`, async ({ page }, testInfo) => {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    await checkPage(page);
    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 700, height: 1000 });
    }
    const table = page.getByRole("table").first();
    const headings = table.getByRole("columnheader");
    const cells = table.locator("tbody tr").first().getByRole("cell");
    for (let index = 1; index < (await cells.count()); index++) {
      const cell = cells.nth(index);
      if (await cell.getAttribute("data-row-actions")) {
        continue;
      }

      const label = (await headings.nth(index).innerText()).trim();

      await expect(cell.getByText(label, { exact: true })).toHaveCount(1);
      await expect(cell.getByText(label, { exact: true })).toBeVisible();
    }

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath(`${id}-narrow.png`) });
    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  });
}

test(
  "shared table adapts to a narrow container and labels every supporting value",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto("/iframe.html?id=components-data-table--narrow-container&viewMode=story");

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const table = page.getByRole("table", { name: "Projects" });
    const first = table.locator("tbody tr").first();

    await expect(page.getByRole("button", { name: /Sort projects/ })).toBeVisible();
    await expect(first.getByText("Date", { exact: true })).toBeVisible();
    await expect(first.getByText("Participants", { exact: true })).toBeVisible();
    await expect(first.getByRole("cell").nth(1)).toHaveAccessibleName("9 November 2026");

    for (const cell of await table.getByRole("cell").all()) {
      expect(await cell.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }

    await page.getByRole("button", { name: /Sort projects/ }).click();
    await page.getByRole("option", { name: "Participants (descending)", exact: true }).click();

    await expect(first).toContainText("12500");

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("table-narrow.png") });

    await page.goto("/iframe.html?id=components-data-table--narrow-navigation&viewMode=story");

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const identity = table.locator("tbody tr").first().getByRole("cell").first();
    const actions = table.locator("tbody tr").first().getByRole("cell").last();

    expect(
      Math.abs((await identity.boundingBox())!.y - (await actions.boundingBox())!.y),
    ).toBeLessThan(1);
    await expect(
      table.locator("tbody tr").first().getByText("Details", { exact: true }),
    ).toBeVisible();

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("table-narrow-actions.png") });
  },
);

test(
  "shared table sticky headers follow their configured scroll container",
  { tag: "@cross-browser" },
  async ({ page, isMobile }, testInfo) => {
    for (const mode of ["page", "table"] as const) {
      await page.goto(
        `/iframe.html?id=components-data-table--sticky-${mode}-header&viewMode=story`,
      );

      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      const table = page.getByRole("table", { name: "Projects" });
      const heading = table.getByRole("columnheader", { name: "Project", exact: true });
      if (isMobile) {
        await expect(page.getByRole("button", { name: /Sort projects/ })).toBeVisible();
        await expect(heading).toHaveCSS("position", "static");
        await expect(
          table.locator("tbody tr").first().getByText("Participants", { exact: true }),
        ).toBeVisible();
      } else if (mode === "page") {
        await page.evaluate(() => window.scrollTo(0, 300));

        await expect.poll(async () => (await heading.boundingBox())!.y).toBeCloseTo(48, 0);
        await expect(heading).toHaveCSS("background-color", "rgb(255, 255, 255)");

        await page.screenshot({ path: testInfo.outputPath("table-sticky-page.png") });
        await heading.getByRole("button").click();

        await expect(heading).toHaveAttribute("aria-sort", "ascending");

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

        expect((await heading.boundingBox())!.y).toBeLessThan(48);
      } else {
        const region = page.getByRole("region", { name: "Projects" });
        await region.focus();
        await page.keyboard.press("PageDown");

        await expect.poll(() => region.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);

        await expect
          .poll(async () => (await heading.boundingBox())!.y - (await region.boundingBox())!.y)
          .toBeCloseTo(0, 0);
        await heading.getByRole("button").click();

        await expect(heading).toHaveAttribute("aria-sort", "ascending");

        await page.screenshot({ path: testInfo.outputPath("table-sticky-region.png") });
      }
      await checkPage(page);
    }
  },
);

test("shared table presents informational states and preserves available rows @cross-browser", async ({
  page,
  isMobile,
}, testInfo) => {
  for (const [story, message, hasRows, role] of [
    ["empty", "No projects yet.", false, "status"],
    ["no-results", "No matching projects.", false, "status"],
    ["loading", "Loading projects…", false, "status"],
    ["refreshing", "Updating projects…", true, "status"],
    ["load-error", "Could not load projects.", false, "alert"],
    ["refresh-error", "Could not update projects. Showing previous results.", true, "alert"],
  ] as const) {
    await page.goto(`/iframe.html?id=components-data-table--${story}&viewMode=story`);

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await expect(page.getByRole(role)).toHaveText(message);
    const isEmpty = story === "empty" || story === "no-results";
    await expect(page.locator("#storybook-root tbody tr")).toHaveCount(
      hasRows ? 3 : isEmpty ? 1 : 0,
    );
    if (isEmpty) {
      const cell = page.getByRole("cell").filter({ has: page.getByRole("status") });
      await expect(cell).toHaveAttribute("colspan", "2");
      const bounds = (await cell.boundingBox())!;
      const tableBounds = (await page.getByRole("table").boundingBox())!;
      expect(bounds.width).toBeGreaterThan(tableBounds.width * 0.85);
      if (!isMobile) {
        const heading = (await page.getByRole("columnheader", { name: "Project" }).boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(heading.y + heading.height);
      }
      await page.screenshot({ path: testInfo.outputPath(`table-${story}.png`) });
    }
    if (!hasRows) {
      await expect(page.getByRole("button")).toHaveCount(0);
    }

    await checkPage(page);
    if (story === "load-error" || story === "refreshing") {
      await page.screenshot({ path: testInfo.outputPath(`table-${story}.png`) });
    }
  }
});

test("shared table primary links preserve native navigation and independent actions", async ({
  page,
}, testInfo) => {
  await page.goto("/iframe.html?id=components-data-table--navigation&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  const primary = page.getByRole("link", { name: "Community transport", exact: true });
  const secondary = page.getByRole("link", {
    name: "Details for Community transport",
    exact: true,
  });
  await primary.focus();

  await expect(primary).toHaveCSS("outline-style", "solid");
  await expect(primary).toHaveCSS("outline-width", "2px");
  await expect(primary).toHaveCSS("text-decoration-thickness", "2px");
  await expect(primary).toHaveCSS("text-decoration-line", "underline");

  await page.screenshot({ path: testInfo.outputPath("table-link-focus.png") });
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#project-b$/);

  await page.keyboard.press("Tab");

  await expect(secondary).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#details-b$/);

  await page.getByRole("button", { name: "Inspect Community transport", exact: true }).click();

  await expect(page.getByRole("status")).toHaveText("Inspecting Community transport");
  await expect(page).toHaveURL(/#details-b$/);

  const popupPromise = page.context().waitForEvent("page");
  await primary.click({ button: "middle" });
  const popup = await popupPromise;

  await expect(popup).toHaveURL(/#project-b$/);

  await popup.close();
  await checkPage(page);
});

test("shared table density, flexible columns and sorting", async ({ page }, testInfo) => {
  await page.goto("/iframe.html?id=components-data-table--default&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  const table = page.getByRole("table", { name: "Projects" });

  await expect(table).toBeVisible();

  const comfortableHeight = (await table.locator("tbody tr").first().boundingBox())!.height;
  if (testInfo.project.name === "desktop") {
    const project = page.getByRole("button", { name: "Project", exact: true });
    await project.focus();
    await page.keyboard.press("Enter");

    await expect(project).toBeFocused();
    await expect(project).toHaveCSS("outline-style", "none");
    await expect(project).toHaveCSS("text-decoration-line", "underline");
    await expect(project).toHaveCSS("color", "rgb(69, 87, 121)");
    await expect(project).toHaveCSS("background-color", "rgb(237, 240, 247)");
    await expect(table.locator("th").first()).toHaveAttribute("aria-sort", "ascending");
    await expect(table.locator("tbody tr").first()).toContainText("Community meals");

    await page.screenshot({ path: testInfo.outputPath("table-sort-focus.png") });
    await page.keyboard.press("Space");

    await expect(table.locator("th").first()).toHaveAttribute("aria-sort", "descending");
    await expect(table.locator("tbody tr").first()).toContainText("Weekend workshops");

    await page.keyboard.press("Enter");

    await expect(table.locator("th").first()).not.toHaveAttribute("aria-sort");
    await expect(project).toHaveCSS("color", "rgb(69, 87, 121)");
    await expect(table.locator("tbody tr").first()).toContainText("Community transport");
  } else {
    await page.getByRole("button", { name: /Sort projects/ }).click();
    await page.getByRole("option", { name: "Project (ascending)", exact: true }).click();

    await expect(table.locator("tbody tr").first()).toContainText("Community meals");
  }
  await checkPage(page);

  await page.goto("/iframe.html?id=components-data-table--compact&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  await expect(table).toBeVisible();

  const compactHeight = (await table.locator("tbody tr").first().boundingBox())!.height;
  if (testInfo.project.name === "desktop") {
    expect(compactHeight).toBeLessThan(comfortableHeight);
  } else {
    expect(compactHeight).toBe(comfortableHeight);
  }

  await page.goto("/iframe.html?id=components-data-table--long-content&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  await expect(table).toBeVisible();

  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 900, height: 1000 });
    const cells = table.locator("tbody tr").first().getByRole("cell");

    expect((await cells.nth(0).boundingBox())!.width).toBeGreaterThan(
      (await cells.nth(1).boundingBox())!.width,
    );
    await expect(cells.nth(1)).toHaveCSS("white-space", "nowrap");
    await expect(cells.nth(2)).toHaveCSS("text-align", "right");
    await expect(
      page.getByRole("columnheader", { name: "Date", exact: true }).getByRole("button"),
    ).toHaveCount(0);
  }

  for (const cell of await table.getByRole("cell").all()) {
    expect(await cell.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("table-long-content.png") });
});
