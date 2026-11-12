import { test, expect, checkPage } from "@merit/test-support/browser";

test(
  "date calendars limit selection and navigation to full surrounding years",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.clock.setFixedTime(new Date("2027-06-20T12:00:00Z"));
    await page.goto("/iframe.html?id=components-date-field--default&viewMode=story");
    const input = page.getByRole("textbox", { name: "Committee date" });
    const trigger = page.getByRole("button", { name: "Choose date for Committee date" });

    for (const [value, day, navigation, arrow] of [
      ["2017-01-01", "Sunday, 1 January 2017", "Previous month", "ArrowLeft"],
      ["2037-12-31", "Thursday, 31 December 2037", "Next month", "ArrowRight"],
    ]) {
      await input.fill(value!);
      await trigger.click();
      const boundary = page.getByRole("button", { name: day! });
      await expect(boundary).toBeFocused();
      await expect(page.getByRole("button", { name: navigation! })).toBeDisabled();
      await boundary.press(arrow!);
      await expect(boundary).toBeFocused();
      await boundary.press("Enter");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(input).toHaveValue(value!);
    }

    await input.fill("2016-12-31");
    await trigger.click();
    const first = page.getByRole("button", { name: "Sunday, 1 January 2017" });
    await expect(first).toBeFocused();
    await first.press("Enter");
    await expect(input).toHaveValue("2017-01-01");
    await checkPage(page);
  },
);

for (const theme of ["product", "site"]) {
  test(
    `date fields support typing, calendar navigation, and dismissal in ${theme}`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.clock.setFixedTime(new Date("2027-01-20T12:00:00Z"));
      await page.goto(
        `/iframe.html?id=components-date-field--default&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      const input = page.getByPlaceholder("YYYY-MM-DD");
      const trigger = page.getByRole("button", { name: "Choose date for Committee date" });
      await input.fill("2027-02-");
      await trigger.click();
      await page.getByRole("button", { name: "Close dialog" }).click();

      await expect(input).toHaveValue("2027-02-");
      await expect(trigger).toBeFocused();

      await input.fill("2027-01-21");
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Committee date" });
      const selected = page.getByRole("button", { name: "Thursday, 21 January 2027" });
      await expect(selected).toBeFocused();
      await expect(
        dialog.getByRole("heading", { name: "Committee date", exact: true }),
      ).toHaveCount(0);
      await expect(dialog.locator("[data-today]")).toHaveText("20");
      await expect(dialog.locator("th")).toHaveText(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
      const selectionBounds = await selected.boundingBox();
      expect(selectionBounds).not.toBeNull();
      expect(Math.abs(selectionBounds!.width - selectionBounds!.height)).toBeLessThanOrEqual(1);
      if (testInfo.project.use.hasTouch) {
        expect(selectionBounds!.width).toBeGreaterThanOrEqual(44);
      }
      await selected.press("ArrowRight");
      await expect(input).toHaveValue("2027-01-21");
      await page.getByRole("button", { name: "Friday, 22 January 2027" }).press("Enter");

      await expect(dialog).toHaveCount(0);
      await expect(input).toHaveValue("2027-01-22");
      await expect(trigger).toBeFocused();

      await trigger.click();
      await page.getByRole("button", { name: "Next month" }).click();
      await expect(
        dialog.getByRole("grid", { name: "Committee date, February 2027" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Previous month" }).click();
      await checkPage(page);
      await page.screenshot({ path: testInfo.outputPath("date-calendar.png") });
      await page.keyboard.press("Escape");

      await expect(trigger).toBeFocused();
      await expect(input).toHaveValue("2027-01-22");
      await expect(dialog).toHaveCount(0);

      await page.setViewportSize({ width: 320, height: 640 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await trigger.click();
      await checkPage(page);
      await expect
        .poll(() => dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
        .toBe(true);
      await page.screenshot({ path: testInfo.outputPath("date-calendar-enlarged.png") });
      await page.emulateMedia({ forcedColors: "active" });
      await page.getByRole("button", { name: "Friday, 22 January 2027" }).focus();
      for (let day = 0; day < 5; day++) {
        await page.keyboard.press("ArrowLeft");
      }
      await expect(page.getByRole("button", { name: "Sunday, 17 January 2027" })).toBeInViewport();
      for (let day = 0; day < 6; day++) {
        await page.keyboard.press("ArrowRight");
      }
      await expect(
        page.getByRole("button", { name: "Saturday, 23 January 2027" }),
      ).toBeInViewport();
      await page.keyboard.press("Home");
      await expect(page.getByRole("button", { name: "Friday, 1 January 2027" })).toBeFocused();
      await expect(page.getByRole("button", { name: "Friday, 1 January 2027" })).toBeInViewport();
      await page.keyboard.press("End");
      await expect(page.getByRole("button", { name: "Sunday, 31 January 2027" })).toBeFocused();
      await expect(page.getByRole("button", { name: "Sunday, 31 January 2027" })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath("date-calendar-forced-colors.png") });
    },
  );
}

test("currency prefixes share field focus and preserve editing and disabled states", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=components-text-field--prefix&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  const editable = page.getByRole("region", { name: "Editable", exact: true });
  const input = editable.getByRole("textbox");
  await editable.getByText("€", { exact: true }).click();

  await expect(input).toBeFocused();
  await expect(input.locator("..")).toHaveCSS("outline-style", "none");
  await expect(input.locator("..")).not.toHaveCSS("box-shadow", "none");
  await expect(input).toHaveCSS("box-shadow", "none");
  await expect(input).toHaveAccessibleDescription("Euros");

  await input.fill("1250.50");

  await expect(input).toHaveValue("1250.50");

  const invalid = page.getByRole("region", { name: "Invalid", exact: true }).getByRole("textbox");
  await invalid.focus();

  await expect(invalid.locator("..")).toHaveCSS("outline-style", "none");

  const invalidBorder = await invalid
    .locator("..")
    .evaluate((node) => getComputedStyle(node).borderColor);

  await expect(invalid.locator("..")).toHaveCSS(
    "box-shadow",
    `${invalidBorder} 0px -2px 0px 0px inset`,
  );

  const disabled = page.getByRole("region", { name: "Disabled", exact: true });

  await expect(disabled.getByRole("textbox")).toBeDisabled();
  await expect(disabled.getByText("€", { exact: true })).toBeVisible();

  await checkPage(page);
});

test(
  "scrolling form keeps integrated field focus visible at enlarged text sizes",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-applications-recommendation--resume-editing&viewMode=story",
    );

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const form = page.getByRole("form");
    const scrollArea = form.getByRole("group", { name: "Edit recommendation for Neighbour Table" });
    const input = form.getByRole("textbox", { name: "Proposed allocation" });
    const control = input.locator("..");
    for (const fontSize of ["100%", "200%"]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, fontSize);
      await input.focus();

      await expect(control).toHaveCSS("outline-style", "none");
      await expect(control).not.toHaveCSS("box-shadow", "none");

      const field = await control.boundingBox();
      const viewport = await scrollArea.boundingBox();

      expect(field!.x).toBeGreaterThanOrEqual(viewport!.x);
      expect(field!.x + field!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }
  },
);

for (const theme of ["product", "site"]) {
  test(
    `select keeps long lists scrollable and footer actions visible in ${theme}`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(
        `/iframe.html?id=components-select--long-list&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      const list = page.getByRole("listbox");
      const action = page.getByRole("button", { name: "Add funding round" });
      const last = page.getByRole("option", { name: "Community grants 2003" });
      const trigger = page.getByRole("button", { name: /Funding round/ });
      for (const fontSize of ["100%", "200%"]) {
        await page.keyboard.press("Escape");
        await expect(list).toBeHidden();
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = size;
        }, fontSize);
        await trigger.click();
        await expect(list).toBeVisible();
        await expect(action).toBeInViewport({ ratio: 1 });
        const footerTop = (await action.boundingBox())!.y;

        await page.keyboard.press("Home");
        await page.keyboard.press("End");
        await expect(last).toBeFocused();
        await expect(last).toBeInViewport({ ratio: 1 });
        expect((await action.boundingBox())!.y).toBeCloseTo(footerTop, 0);
        expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
        expect(await list.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await checkPage(page);
        await page.screenshot({ path: testInfo.outputPath(`select-${theme}-${fontSize}.png`) });
      }

      await last.press("Enter");
      await expect(trigger).toHaveText("Community grants 2003");
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(last).toBeInViewport({ ratio: 1 });
      await action.click();
      await expect(list).toBeHidden();
      await expect(trigger).toHaveText("Community grants 2003");
    },
  );
}

test("select dismissal shows the same focus for outside click and Escape", async ({ page }) => {
  await page.goto("/iframe.html?id=components-select--default&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  const trigger = page.getByRole("button", { name: /Recommendation/ });
  await trigger.click();

  await expect(page.getByRole("listbox")).toBeVisible();

  await page.mouse.click(page.viewportSize()!.width - 16, 300);

  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveCSS("outline-style", "none");
  await expect(trigger).not.toHaveCSS("box-shadow", "none");

  const pointerMarker = await trigger.evaluate((node) => getComputedStyle(node).boxShadow);

  await page.keyboard.press("Enter");

  await expect(page.getByRole("listbox")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveCSS("outline-style", "none");
  await expect(trigger).not.toHaveCSS("box-shadow", "none");
  await expect(trigger).toHaveCSS("box-shadow", pointerMarker);
});

test(
  "text fields fit long labels and feedback at narrow widths and enlarged text",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const theme of ["product", "site"]) {
      await page.goto(
        `/iframe.html?id=components-text-field--long-content&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      for (const fontSize of ["100%", "200%"]) {
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = size;
        }, fontSize);

        const name = page.getByRole("textbox", {
          name: "Name of the organization responsible for delivering the programme",
        });
        await name.fill("Northside Arts");
        await expect(name).toHaveValue("Northside Arts");
        await expect(name).toHaveCSS("transition-duration", "0s");

        for (const input of await page.getByRole("textbox").all()) {
          const bounds = (await input.boundingBox())!;
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
        }

        expect(
          (await page.getByRole("textbox", { name: "Summary" }).boundingBox())!.height,
        ).toBeGreaterThanOrEqual(120);
        await checkPage(page);
        await page.screenshot({
          path: testInfo.outputPath(`text-fields-${theme}-${fontSize}.png`),
          fullPage: true,
        });
      }
    }
  },
);

test("field feedback shares helper space and restores it after correction", async ({ page }) => {
  await page.goto("/iframe.html?id=components-text-field--validation&viewMode=story");
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  const input = page.getByRole("textbox", { name: "Display name" });
  const save = page.getByRole("button", { name: "Save preview" });
  const helper = page.getByText("Use the name your colleagues recognize.", { exact: true });

  await expect(helper).toBeVisible();

  const before = await save.boundingBox();
  await save.click();

  await expect(page.getByText("Enter a display name.", { exact: true })).toBeVisible();
  await expect(helper).toBeHidden();
  expect((await save.boundingBox())?.y).toBe(before?.y);

  await checkPage(page);
  await input.fill("Alex Morgan");
  await save.click();

  await expect(page.getByRole("status")).toHaveText("Preview saved for Alex Morgan.");
  await expect(helper).toBeVisible();
  expect((await save.boundingBox())?.y).toBe(before?.y);
});

for (const popup of ["select", "calendar"]) {
  test(
    `form disables an open ${popup} when submission begins`,
    { tag: "@cross-browser" },
    async ({ page }) => {
      await page.goto("/iframe.html?id=patterns-form-dialog--popup-fields&viewMode=story");
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      const form = page.getByRole("form", { name: "Note" });
      await form.getByRole("textbox", { name: "Title" }).fill("Keep these values");

      const trigger =
        popup === "select"
          ? form.getByRole("button", { name: /Status/ })
          : form.getByRole("button", { name: "Choose date for Date" });
      await trigger.click();
      const choice =
        popup === "select"
          ? page.getByRole("option", { name: "Ready" })
          : page.getByRole("button", { name: "Friday, 22 January 2027" });
      await expect(choice).toBeVisible();

      // Submit without dismissing the popup, as an external save action could.
      await form.evaluate((element: HTMLFormElement) => element.requestSubmit());

      await expect(form).toHaveAttribute("aria-busy", "true");
      await expect(trigger).toBeDisabled();
      if (await choice.isVisible()) {
        await expect(choice).toHaveAttribute("aria-disabled", "true");
        await choice.dispatchEvent("click");
      }
      await expect(form.getByRole("button", { name: /Status/ })).toHaveText("Draft");
      await expect(form.getByRole("textbox", { name: "Date" })).toHaveValue("2027-01-21");
    },
  );
}
