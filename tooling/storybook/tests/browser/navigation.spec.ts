import { test, expect, checkPage } from "@merit/test-support/browser";
import { openNavigation } from "@merit/test-support/browser/navigation";

test(
  "product workspace switching preserves focus and respects team-only access",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-workspace-entry-and-recovery--failed-application&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const navigation = await openNavigation(page);
    const switcher = navigation.getByRole("button", { name: "Alder Foundation: Switch workspace" });
    await switcher.click();
    const choices = page.getByRole("dialog", { name: "Switch workspace", exact: true });
    const current = choices.getByRole("link", { name: "Alder Foundation", exact: true });
    const other = choices.getByRole("link", {
      name: "Birch Community and Neighbourhood Partnerships",
    });

    await expect(current).toHaveAttribute("aria-current", "true");
    await expect(current).toHaveAttribute("href", "/app/alder/rounds");
    await expect(other).not.toHaveAttribute("aria-current");
    await expect(other).toHaveAttribute("href", "/app/birch/settings/members");
    await checkPage(page);
    await page.keyboard.press("Escape");

    await expect(choices).toHaveCount(0);
    await expect(switcher).toBeFocused();

    await switcher.press("Enter");
    await other.click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    const destination = await openNavigation(page);
    await expect(
      destination.getByRole("link", { name: "Workspace settings", exact: true }),
    ).toHaveAttribute("href", "/app/birch/settings/members");
    await expect(
      destination.getByRole("link", { name: "Funding rounds", exact: true }),
    ).toHaveCount(0);
    await expect(
      destination.getByRole("button", {
        name: "Birch Community and Neighbourhood Partnerships: Switch workspace",
      }),
    ).toBeVisible();
    await checkPage(page);
  },
);

for (const story of ["overflow-interactions", "overflow-interactions-right-to-left"]) {
  test(
    `tab strip preserves selection and focus through scrolling and resizing: ${story}`,
    { tag: "@cross-browser" },
    async ({ page }) => {
      await page.goto(`/iframe.html?id=components-tabs--${story}&viewMode=story`);
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      const selected = page.getByRole("tab", { name: "Committee decision" });
      await expect(selected).toHaveAttribute("aria-selected", "true");
      await expect(selected).toBeInViewport({ ratio: 0.99 });
      await expect(page.getByRole("tabpanel", { name: "Committee decision" })).toBeVisible();
      await checkPage(page);
    },
  );
}

for (const theme of ["product", "site"]) {
  test(
    `tabs align selection and actions with the divider in ${theme}`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.goto(
        `/iframe.html?id=components-tabs--with-action&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      const reviews = page.getByRole("tab", { name: "Reviews 3" });
      const action = page.getByRole("button", { name: "Add application" });
      await expect(reviews).toHaveAttribute("aria-selected", "true");
      await expect(action).toBeFocused();

      for (const fontSize of ["100%", "200%"]) {
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = size;
        }, fontSize);
        await expect
          .poll(() =>
            page.getByRole("tablist").evaluate((list) => {
              const rail = list.parentElement!;
              const selected = list.querySelector('[aria-selected="true"]')!;
              return Math.abs(
                selected.getBoundingClientRect().bottom -
                  (rail.getBoundingClientRect().bottom -
                    Number.parseFloat(getComputedStyle(rail).borderBottomWidth)),
              );
            }),
          )
          .toBeLessThanOrEqual(1);
        // Scrollport edges can clip a fraction of a CSS pixel after layout rounding.
        await expect(reviews).toBeInViewport({ ratio: 0.99 });
        await expect(action).toBeInViewport({ ratio: 1 });
        await checkPage(page);
        await page.screenshot({ path: testInfo.outputPath(`tabs-${theme}-${fontSize}.png`) });
      }
    },
  );
}

test("workspace choices keep keyboard focus visible on the whole choice", async ({
  page,
}, testInfo) => {
  await page.goto(
    "/iframe.html?id=features-workspace-entry-and-recovery--choose-workspace&viewMode=story",
  );

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  const choice = page.getByRole("link", { name: "Alder Foundation", exact: true });
  await choice.focus();

  await expect(choice).toHaveCSS("outline-style", "none");
  await expect(choice).not.toHaveCSS("box-shadow", "none");

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("workspace-choice-focus.png") });
  await page.emulateMedia({ forcedColors: "active" });

  await expect(choice).toHaveCSS("outline-style", "solid");
});

test(
  "application shell handles long workspaces and account menus",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto(
      "/iframe.html?id=patterns-application-shell--long-workspace-name&viewMode=story",
    );

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await expect(page.getByRole("main")).toBeVisible();

    const navigation = await openNavigation(page);
    const switcher = navigation.getByRole("button", { name: /Switch workspace/ });

    await expect(switcher).toBeVisible();
    expect(
      await switcher.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("long-workspace.png") });
    await switcher.click();
    const popup = page.getByRole("dialog", { name: "Switch workspace", exact: true });
    const current = popup.locator('a[aria-current="true"]');
    const other = popup.getByRole("link", { name: "Birch Foundation", exact: true });

    await expect(current).toHaveAccessibleName(
      "Birch Community Foundation for Arts, Education and Neighbourhood Development",
    );
    await expect(current.locator("svg")).toBeVisible();
    await expect(other.locator("svg")).toBeHidden();
    expect(
      await current.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);

    const bounds = (await popup.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    if (testInfo.project.use.isMobile) {
      expect((await other.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("workspace-switcher.png") });
    await page.keyboard.press("Escape");

    await expect(popup).toHaveCount(0);
    await expect(switcher).toBeFocused();

    await switcher.press("Enter");
    await page.keyboard.press("Tab");
    await expect(current).toBeFocused();
    await page.keyboard.press("Tab");

    await expect(other).toBeFocused();
    await expect(other).toHaveCSS("outline-style", "none");
    await expect(other).not.toHaveCSS("box-shadow", "none");

    await page.screenshot({ path: testInfo.outputPath("workspace-switcher-focus.png") });
    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/iframe.html?id=patterns-application-shell--account-menu&viewMode=story");

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await expect(page.getByRole("main")).toBeVisible();

    await openNavigation(page);
    await page.getByRole("button", { name: "Dana Reed: Account menu", exact: true }).click();

    await expect(page.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("account-menu.png") });
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();

    await expect(page.getByRole("alert")).toHaveText("Could not sign out. Try again.");
  },
);

for (const theme of ["product", "site"]) {
  test(
    `quiet shell buttons preserve interaction state precedence in ${theme}`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.goto(
        `/iframe.html?id=patterns-application-shell--account-menu&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      const navigation = await openNavigation(page);
      const switcher = navigation.getByRole("button", { name: /Switch workspace/ });
      const account = navigation.getByRole("button", { name: "Dana Reed: Account menu" });
      const colors = await switcher.locator("[data-initials]").evaluate((avatar) => {
        const style = getComputedStyle(avatar);
        return { surface: style.backgroundColor, pressed: style.borderTopColor };
      });
      const focusBackground = await navigation
        .getByRole("link", { name: "Funding rounds" })
        .evaluate((link) => getComputedStyle(link).backgroundColor);

      for (const trigger of [switcher, account]) {
        if (!testInfo.project.use.isMobile) {
          await trigger.hover();
          await expect(trigger).toHaveCSS("background-color", colors.surface);
          if (trigger === switcher) {
            await page.mouse.down();
            await expect(trigger).toHaveAttribute("data-pressed", "true");
            await expect(trigger).toHaveCSS("background-color", colors.pressed);
            await page.mouse.move(0, 0);
            await page.mouse.up();
          }
        }

        await page.keyboard.press("Tab");
        await trigger.focus();
        await expect(trigger).toHaveCSS("background-color", focusBackground);
        await expect(trigger).toHaveCSS("text-decoration-line", "underline");
        if (!testInfo.project.use.isMobile) {
          await trigger.hover();
          await expect(trigger).toHaveCSS("background-color", focusBackground);
        }

        if (trigger === switcher) {
          await page.keyboard.down("Space");
          await expect(trigger).toHaveAttribute("data-pressed", "true");
          await expect(trigger).toHaveCSS("background-color", focusBackground);
          await page.keyboard.up("Space");
        } else {
          await trigger.press("Space");
        }
        await page.mouse.move(0, 0);
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(trigger).toHaveCSS("background-color", colors.surface);
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveCSS("background-color", focusBackground);
      }

      await page.screenshot({ path: testInfo.outputPath(`quiet-shell-focus-${theme}.png`) });
      await page.emulateMedia({ forcedColors: "active" });
      await expect(account).toHaveCSS("outline-style", "solid");
    },
  );
}

test("breadcrumbs preserve keyboard links and wrap long locations", async ({ page }, testInfo) => {
  await page.goto("/iframe.html?id=components-breadcrumbs--default&viewMode=story");
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  const navigation = page.getByRole("navigation", { name: "Breadcrumb", exact: true });

  await expect(navigation.getByRole("listitem")).toHaveCount(3);
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Workshop Saturdays");

  await page.keyboard.press("Tab");

  await expect(navigation.getByRole("link", { name: "Rounds", exact: true })).toBeFocused();

  await page.keyboard.press("Tab");
  const round = navigation.getByRole("link", { name: "Local Connections 2027", exact: true });

  await expect(round).toBeFocused();
  await expect(round).toHaveCSS("outline-style", "none");
  await expect(round).toHaveCSS("text-decoration-thickness", "2px");

  await page.screenshot({ path: testInfo.outputPath("breadcrumbs-focus.png") });
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#applications$/);

  await checkPage(page);

  await page.goto("/iframe.html?id=components-breadcrumbs--long-labels&viewMode=story");
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  await expect(navigation.locator('[aria-current="page"]')).toContainText("meeting neighbours");

  for (const item of await navigation.getByRole("listitem").all()) {
    expect(await item.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("breadcrumbs-long-labels.png") });
});
