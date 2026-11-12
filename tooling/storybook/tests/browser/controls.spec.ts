import { test, expect, checkPage } from "@merit/test-support/browser";

test(
  "inline name restores focus after saving and cancelling",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto("/iframe.html?id=patterns-editing--inline-name-editor&viewMode=story");
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const input = page.getByRole("textbox", { name: "Rename round" });
    await expect(input).toBeFocused();
    await input.fill("Renamed round");
    await input.press("Enter");

    const trigger = page.getByRole("button", { name: "Renamed round", exact: true });
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await input.fill("Cancelled name");
    await input.press("Escape");

    await expect(trigger).toBeFocused();
    await checkPage(page);
  },
);

for (const theme of ["product", "site"]) {
  test(
    `tooltips remain readable with enlarged text in narrow ${theme} layouts`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(
        `/iframe.html?id=components-tooltip--long-content&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      const tooltip = page.getByRole("tooltip");
      const trigger = page.getByRole("button", { name: "Resume recommendation" });
      for (const fontSize of ["100%", "200%"]) {
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = size;
        }, fontSize);

        await expect(tooltip).toBeVisible();
        await expect(trigger).toHaveAccessibleDescription(await tooltip.innerText());
        await expect(async () => {
          const bounds = await tooltip.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
          expect(bounds!.y).toBeGreaterThanOrEqual(0);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
          expect(await tooltip.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
            true,
          );
        }).toPass();

        await checkPage(page);
        await page.screenshot({ path: testInfo.outputPath(`tooltip-${fontSize}.png`) });
      }

      await page.emulateMedia({ forcedColors: "active" });
      await expect(tooltip).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("tooltip-forced-colors.png") });
      await trigger.press("Escape");
      await expect(tooltip).toHaveCount(0);
      await expect(trigger).toBeFocused();
    },
  );
}

for (const theme of ["product", "site"]) {
  test(
    `badges preserve readable labels in narrow ${theme} layouts`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(
        `/iframe.html?id=components-badge--long-labels&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      const badges = page.locator("#storybook-root [data-tone]");
      for (const fontSize of ["100%", "200%"]) {
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = size;
        }, fontSize);

        for (const badge of await badges.all()) {
          expect(
            await badge.evaluate((node) => {
              const bounds = node.getBoundingClientRect();
              const parent = node.parentElement!.getBoundingClientRect();
              return (
                node.scrollWidth <= node.clientWidth + 1 &&
                bounds.left >= parent.left &&
                bounds.right <= parent.right + 1
              );
            }),
          ).toBe(true);
        }
        const shortLabel = page.getByText("Read only", { exact: true });
        expect(await shortLabel.evaluate((node) => node.clientWidth)).toBeLessThan(
          await shortLabel.evaluate((node) => node.parentElement!.clientWidth),
        );

        await checkPage(page);
        await page.screenshot({ path: testInfo.outputPath(`badges-${fontSize}.png`) });
      }

      await page.emulateMedia({ forcedColors: "active" });
      await checkPage(page);
      await page.screenshot({ path: testInfo.outputPath("badges-forced-colors.png") });
    },
  );
}

for (const theme of ["product", "site"] as const) {
  test(
    `links fit surrounding controls and wrap enlarged text in the ${theme} theme`,
    { tag: "@cross-browser" },
    async ({ page, browserName }, testInfo) => {
      await page.goto(
        `/iframe.html?id=components-link--overview&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      await checkPage(page);
      await page.screenshot({ path: testInfo.outputPath(`links-${theme}.png`) });

      await page.goto(
        `/iframe.html?id=components-link--button-appearance&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      for (const [linkName, buttonName] of [
        ["Open funding round", "Create funding round"],
        ["Read supporting evidence", "Add evidence"],
        ["Read the guide", "Copy address"],
        ["Explore the demo", "Request access"],
        ["Leave workspace", "Reset example"],
      ]) {
        const dimensions = await Promise.all(
          [
            page.getByRole("link", { name: linkName, exact: true }),
            page.getByRole("button", { name: buttonName, exact: true }),
          ].map((control) =>
            control.evaluate((node) => {
              const style = getComputedStyle(node);
              return [node.getBoundingClientRect().height, style.fontSize, style.padding];
            }),
          ),
        );
        expect(dimensions[0]).toEqual(dimensions[1]);
      }
      await checkPage(page);

      await page.setViewportSize({ width: 320, height: 640 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(
        `/iframe.html?id=components-link--long-labels&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      // Safari on macOS includes links in keyboard navigation with Option-Tab.
      await page.keyboard.press(
        browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
      );
      const reference = page.getByRole("link").first();
      await expect(reference).toBeFocused();
      await expect(reference).toHaveCSS("outline-style", "solid");
      await checkPage(page);
      await page.screenshot({
        path: testInfo.outputPath(`links-${theme}-enlarged.png`),
        fullPage: true,
      });
    },
  );

  test(`links retain a visible focus outline around nested content in the ${theme} theme`, async ({
    page,
  }, testInfo) => {
    for (const [story, name] of [
      ["components-link--brand-link", "Merit home"],
      ["patterns-person-identity--linked", "Dana Reed"],
      ["components-link--default", "View supporting evidence"],
    ]) {
      await page.goto(`/iframe.html?id=${story}&viewMode=story&globals=theme:${theme}`);

      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      const link = page.getByRole("link", { name, exact: true });
      await page.keyboard.press("Tab");

      await expect(link).toBeFocused();
      await expect(link).toHaveCSS("outline-style", "solid");
      await expect(link).toHaveCSS("outline-width", "2px");

      await page.screenshot({ path: testInfo.outputPath(`${story}-focus.png`) });
      await checkPage(page);
    }
  });

  test(`control focus stays consistent across states in the ${theme} theme`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=foundations-focus--comparison&viewMode=story&globals=theme:${theme}`,
    );

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    await checkPage(page);
    const controls: {
      role: "button" | "link" | "textbox";
      name: string | RegExp;
      error?: string;
      field?: boolean;
      iconOnly?: boolean;
    }[] = [
      { role: "button", name: "Save recommendation" },
      { role: "button", name: "Cancel" },
      { role: "button", name: "View details" },
      { role: "button", name: "Delete draft" },
      { role: "button", name: "More actions", iconOnly: true },
      { role: "link", name: "Open round" },
      { role: "link", name: "Browse rounds" },
      { role: "textbox", name: "Applicant" },
      { role: "textbox", name: "Contact name", error: "Use at least two characters." },
      { role: "textbox", name: "Reference" },
      { role: "textbox", name: "Summary" },
      { role: "textbox", name: "Submitted summary" },
      { role: "button", name: /Recommendation/, field: true },
      { role: "button", name: /Final decision/, error: "Choose a decision.", field: true },
    ];
    for (const [index, { role, name, error, field, iconOnly }] of controls.entries()) {
      const control = page.getByRole(role, { name, exact: true });
      const before = await control.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return [rect.width, rect.height, rect.x + window.scrollX, rect.y + window.scrollY];
      });
      if (index > 0) {
        await page.keyboard.press("Tab");
      }

      await expect(control).toBeFocused();

      for (const hovered of [false, true]) {
        if (hovered) {
          await control.hover();
        }

        await expect(control).toHaveCSS("outline-style", "none");

        if (role === "textbox" || field) {
          const color = error
            ? await page.getByText(error).evaluate((node) => getComputedStyle(node).color)
            : await page
                .getByRole("link", { name: "Open round" })
                .evaluate((node) => getComputedStyle(node).backgroundColor);

          await expect(control).toHaveCSS("border-top-color", color);
          await expect(control).toHaveCSS("box-shadow", `${color} 0px -2px 0px 0px inset`);
        } else if (iconOnly) {
          await expect(control).not.toHaveCSS("box-shadow", "none");
        } else {
          await expect(control).toHaveCSS("text-decoration-line", "underline");
          await expect(control).toHaveCSS("text-decoration-thickness", "2px");
        }
      }

      const after = await control.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return [rect.width, rect.height, rect.x + window.scrollX, rect.y + window.scrollY];
      });

      expect(after).toEqual(before);

      await page.mouse.move(0, 0);
    }

    // Clicking an action suppresses its keyboard indicator; fields keep their editing indicator.
    const action = page.getByRole("button", { name: "Save recommendation" });
    const input = page.getByRole("textbox", { name: "Applicant", exact: true });
    const link = page.getByRole("link", { name: "Browse rounds" });
    await action.click();

    await expect(action).not.toHaveAttribute("data-focus-visible");
    await expect(action).not.toHaveCSS("outline-style", "solid");

    await input.click();

    await expect(input).toHaveCSS("outline-style", "none");
    await expect(input).not.toHaveCSS("box-shadow", "none");

    await page.emulateMedia({ forcedColors: "active" });
    await page.keyboard.press("Shift+Tab");

    await expect(link).toBeFocused();

    for (const control of [link, input]) {
      await expect(control).toHaveCSS("outline-style", "solid");
      await expect(control).toHaveCSS("outline-width", "2px");

      const colors = await control.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.outlineColor, getComputedStyle(document.body).backgroundColor];
      });

      expect(colors[0]).not.toBe(colors[1]);

      await page.keyboard.press("Tab");
    }
  });
}

for (const theme of ["product", "site"]) {
  test(
    `buttons keep pending icons and enlarged labels within their targets in ${theme}`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.goto(
        `/iframe.html?id=components-button--pending-icon-only&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      for (const button of await page.getByRole("button", { name: "Save changes" }).all()) {
        await expect(button).toHaveAttribute("aria-disabled", "true");
        await expect(button).toHaveCSS("opacity", "1");
        await expect(button.locator("svg")).toHaveCount(1);
        const bounds = (await button.boundingBox())!;
        const icon = (await button.locator("svg").boundingBox())!;
        expect(bounds.width).toBe(bounds.height);
        expect(bounds.width).toBeGreaterThanOrEqual(
          testInfo.project.name.includes("mobile") ? 44 : 32,
        );
        expect(Math.abs(icon.x + icon.width / 2 - bounds.x - bounds.width / 2)).toBeLessThan(1);
        expect(Math.abs(icon.y + icon.height / 2 - bounds.y - bounds.height / 2)).toBeLessThan(1);
      }
      await checkPage(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.getByRole("button").first().locator("svg")).toHaveCSS(
        "animation-name",
        "none",
      );
      await page.screenshot({ path: testInfo.outputPath(`buttons-${theme}-pending.png`) });

      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(
        `/iframe.html?id=components-button--long-label&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const button = page.getByRole("button", {
        name: "Save recommendation and return to the funding round",
      });
      expect(await button.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await expect(button).toBeInViewport();
      await checkPage(page);
      await page.screenshot({ path: testInfo.outputPath(`buttons-${theme}-enlarged.png`) });
    },
  );
}
