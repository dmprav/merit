import { test, expect, checkPage } from "@merit/test-support/browser";

test(
  "application page recovery keeps the current page and moves to the next one after a retry",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto(
      "/iframe.html?id=features-applications-all-applications--paged-recovery&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const failure = page.getByRole("alertdialog", { name: /Applications could not be loaded/ });
    await expect(failure).toBeInViewport();
    const retry = failure.getByRole("button", { name: "Try again" });
    await expect(retry).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "Community project 50", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("page-recovery.png") });
    await retry.click();
    await expect(failure).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Applications" })).toBeFocused();
    await expect(
      page.getByRole("link", { name: "Community project 51", exact: true }),
    ).toBeInViewport();
    await checkPage(page);
  },
);

test(
  "activity drawer preserves long evidence and returns focus to its event",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto(
      "/iframe.html?id=features-activity-workspace-activity--long-text&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const event = page.getByRole("listitem").first();
    await expect(page.getByText(/The applicant is revising the partnership/)).toHaveCount(0);
    const target = event.getByRole("link");
    await expect(target).toHaveAttribute("href", /\/applications\//);
    expect(await target.evaluate((el) => el.closest("button"))).toBeNull();
    await page.screenshot({ path: testInfo.outputPath("activity-compact.png") });
    const trigger = event.getByRole("button", { name: /Application withdrawn:/ });
    await trigger.focus();
    await trigger.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Application withdrawn" });
    await expect(drawer).toHaveAttribute("data-modal-dialog", "end");
    await expect(drawer.getByText("via Merit web")).toBeVisible();
    await expect(
      drawer.getByRole("link", { name: /including accessible transport/ }),
    ).toBeVisible();
    await expect(drawer.getByText(/Alexandria Catherine/)).toBeVisible();
    const reason = drawer.getByText(/The applicant is revising the partnership/);
    await reason.scrollIntoViewIfNeeded();
    await expect(reason).toBeInViewport();
    expect(await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      await page.locator("body").evaluate((el) => el.clientWidth),
    );
    await page.screenshot({ path: testInfo.outputPath("activity-drawer.png") });
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await checkPage(page);
  },
);

test(
  "activity drawer preserves reading position as older events load",
  { tag: "@cross-browser" },
  async ({ page }) => {
    // One-line events are compact; a short viewport keeps the older page below the fold.
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto(
      "/iframe.html?id=features-activity-workspace-activity--more-pages&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const more = page.getByRole("button", { name: "Show older activity" });
    // Reaching the end loads older events, whether or not the button had time to show.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.getByRole("button", { name: /Round created:/ }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: /Round created:/ })).toBeVisible();
    await expect(more).toHaveCount(0);
    const trigger = page.getByRole("button", { name: /Round criteria changed:/ });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    await trigger.press("Enter");
    await expect(page.getByRole("dialog", { name: "Round criteria changed" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
    const times = await page
      .locator("ol time")
      .evaluateAll((nodes) => nodes.map((el) => el.getAttribute("datetime")));
    expect(times).not.toContain(null);
    expect(times).toEqual([...times].sort((a, b) => (b ?? "").localeCompare(a ?? "")));
    await checkPage(page);
  },
);

test(
  "application criteria combine, reset and preserve search on Escape",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto(
      "/iframe.html?id=features-applications-all-applications--across-rounds&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const trigger = page.getByRole("button", { name: "Filter", exact: true });
    await trigger.click();
    const panel = page.getByRole("dialog", { name: "Filter applications" });
    const search = page.getByRole("searchbox", { name: "Search applications" });
    await expect(search).toBeFocused();
    await search.fill("Repair");
    await search.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Clear application search: Search applications: Repair" }),
    ).toBeVisible();
    await trigger.click();
    await expect(search).toHaveValue("Repair");
    await page.getByRole("button", { name: "Clear application search", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    for (const [criterion, value] of [
      ["Participation", "Active"],
      ["Reviews", "Awaiting reviews"],
      ["Evidence", "Changed evidence or criteria"],
    ]) {
      const field = page.getByRole("button", { name: `${criterion} Any`, exact: true });
      await field.click();
      await page.getByRole("option", { name: value, exact: true }).click();
      await expect(
        page.getByRole("button", { name: `${criterion} ${value}`, exact: true }),
      ).toBeFocused();
    }
    await expect(panel).toBeInViewport();
    await expect(page.getByRole("status")).toHaveText("1 of 2 applications");
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("combined-criteria.png") });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await page.getByRole("button", { name: "Remove filter: Awaiting reviews" }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(search).toBeFocused();
    await expect(page.getByRole("button", { name: "Participation Active" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("2 of 2 applications");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await checkPage(page);
  },
);

test(
  "opening an application criterion rapidly preserves the narrow panel and page position",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      "/iframe.html?id=features-applications-all-applications--long-and-unknown&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const initialPosition = await page.evaluate(() => window.scrollY);
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    const participation = page.getByRole("button", { name: "Participation Any" });
    await participation.click();
    await page.keyboard.press("Escape");
    await expect(participation).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(initialPosition);
    const panel = page.getByRole("dialog", { name: "Filter applications" });
    const search = panel.getByRole("searchbox", { name: "Search applications" });
    await expect(search).toBeInViewport({ ratio: 1 });
    expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Round All rounds" })).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(initialPosition);
    await expect(search).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("rapid-open-criterion.png") });
    await checkPage(page);
  },
);
