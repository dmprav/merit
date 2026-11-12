import { test, expect, checkPage } from "@merit/test-support/browser";

test("page layout aligns both widths and constrains only the reading content", async ({
  page,
}, testInfo) => {
  const widths: number[] = [];

  for (const story of ["standard", "full-width"]) {
    await page.goto(`/iframe.html?id=patterns-page-composition--${story}&viewMode=story`);
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const main = page.getByRole("main");
    const title = page.getByRole("heading", { level: 1 });
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
    const purpose = page.getByRole("region", { name: "Purpose", exact: true });
    const prose = purpose.getByRole("paragraph");
    const content = page.getByRole("region", { name: "Applications 3", exact: true });
    const bounds = (await main.boundingBox())!;
    widths.push(bounds.width);

    for (const item of [breadcrumb, purpose, content]) {
      expect((await item.boundingBox())!.x).toBeCloseTo((await title.boundingBox())!.x, 0);
    }

    if (testInfo.project.name === "desktop") {
      expect((await prose.boundingBox())!.width).toBeLessThan((await content.boundingBox())!.width);
    } else {
      expect((await prose.boundingBox())!.width).toBeLessThanOrEqual(
        (await content.boundingBox())!.width,
      );
    }

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath(`page-layout-${story}.png`) });
  }

  if (testInfo.project.name === "desktop") {
    expect(widths[1]).toBeGreaterThan(widths[0]!);
  } else {
    expect(widths[1]).toBe(widths[0]);
  }
});

test("page header wraps long titles and keeps actions in keyboard order", async ({
  page,
}, testInfo) => {
  await page.goto("/iframe.html?id=patterns-page-composition--long-title&viewMode=story");
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  const title = page.getByRole("heading", { level: 1 });
  const exportAction = page.getByRole("button", { name: "Export summary", exact: true });
  const reviewAction = page.getByRole("button", { name: "Review round", exact: true });

  await expect(title).toHaveAccessibleName(
    "Community partnerships for arts, education and neighbourhood development",
  );
  await expect(page.getByText("In preparation", { exact: true })).toBeVisible();

  await exportAction.focus();
  await page.keyboard.press("Tab");
  await expect(reviewAction).toBeFocused();

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("page-header-long.png") });

  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  for (const element of [title, exportAction, reviewAction]) {
    expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
  expect((await exportAction.boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y);

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("page-header-enlarged.png"), fullPage: true });
});

test("application preview uses pane scrolling on desktop and document scrolling on mobile", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1440, height: 800 });
  }

  await page.goto("/iframe.html?id=features-applications-overview--evidence&viewMode=story");
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  await expect(page.getByRole("main")).toHaveCount(1);
  const title = page.getByRole("heading", { level: 1 });
  const reference = page.getByRole("group", { name: "Reference", exact: true });

  await reference.focus();
  await page.keyboard.press("PageDown");

  if (testInfo.project.name === "desktop") {
    await expect.poll(() => reference.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(title).toBeInViewport();
  } else {
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await reference.evaluate((node) => node.scrollTop)).toBe(0);
  }

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("application-preview-scrolling.png") });
});

test("person identity wraps long names and preserves link accessibility", async ({
  page,
}, testInfo) => {
  await page.goto("/iframe.html?id=patterns-person-identity--long-name&viewMode=story");
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  const name = page.getByText("Alexandria Montgomery-Worthington", { exact: true });

  await expect(name).toBeVisible();

  const identity = name.locator("../..");

  expect(await identity.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("person-identity-long-name.png") });

  await page.goto("/iframe.html?id=patterns-person-identity--linked&viewMode=story");
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  const link = page.getByRole("link", { name: "Dana Reed", exact: true });

  await expect(link).toBeVisible();

  await page.keyboard.press("Tab");

  await expect(link).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#person-profile$/);

  await checkPage(page);
});
