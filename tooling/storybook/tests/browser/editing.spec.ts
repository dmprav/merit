import type { Locator, Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

const open = async (page: Page, story: string) => {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

const rect = (locator: Locator) =>
  locator.evaluate((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  });

const expectSameBox = (actual: Awaited<ReturnType<typeof rect>>, expected: typeof actual) => {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(1);
  }
};

const name = (page: Page, value: string) => page.getByRole("button", { name: value, exact: true });

test.describe("inline name", () => {
  test("takes exactly the name's box, with and without an error showing", async ({ page }) => {
    await open(page, "patterns-editing--inline-name-save-failure");
    const header = page.locator("header");
    const editor = page.locator("[data-inline-name-editor]");
    const input = page.getByRole("textbox", { name: "Rename round" });
    await expect(page.getByRole("alert")).toBeVisible();

    await input.press("Escape");
    const trigger = name(page, "Local Connections 2027");
    await expect(trigger).toBeFocused();
    const resting = await rect(trigger);
    const headerAtRest = await rect(header);
    const textAtRest = await rect(trigger.locator("span").first());

    await trigger.click();
    await expect(input).toBeFocused();
    expectSameBox(await rect(editor), resting);
    expect(Math.abs((await rect(input)).x - textAtRest.x)).toBeLessThanOrEqual(1);

    // The failure caption overlays what follows, so the header and the field stay put.
    await input.fill("Another name");
    await input.press("Enter");
    await expect(page.getByRole("alert")).toBeVisible();
    expectSameBox(await rect(header), headerAtRest);
    expectSameBox({ ...(await rect(editor)), width: resting.width }, resting);
  });

  const longName =
    "Neighbourhood connections through shared meals and community activities across the whole district 2027";

  test("a long name wraps in view and edit modes and keeps the same box", async ({ page }) => {
    await open(page, "patterns-editing--inline-name-editor");
    const input = page.getByRole("textbox", { name: "Rename round" });
    const editor = page.locator("[data-inline-name-editor]");
    const short = await rect(editor);

    // The editor grows with what is typed, and Enter saves without adding a line break.
    await input.fill(longName);
    const growing = await rect(editor);
    expect(growing.height).toBeGreaterThan(short.height * 1.5);
    expect(await input.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    await input.press("Enter");

    const trigger = name(page, longName);
    await expect(trigger).toBeFocused();
    const resting = await rect(trigger);
    expectSameBox(resting, growing);
    // Nothing is cut off: the wrapped text fits the box it sits in.
    const text = trigger.locator("span").first();
    expect(await text.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const textBox = await rect(text);
    expect(textBox.height).toBeGreaterThan(short.height * 1.5);

    await trigger.click();
    await expect(input).toBeFocused();
    expect(await input.inputValue()).not.toContain("\n");
    expectSameBox(await rect(editor), resting);
    expect(Math.abs((await rect(input)).x - textBox.x)).toBeLessThanOrEqual(1);
  });

  for (const story of ["inline-name-save-failure", "inline-name-pending"]) {
    test(`a long name is not clipped in ${story}`, async ({ page }) => {
      await open(page, `patterns-editing--${story}`);
      const input = page.getByRole("textbox", { name: "Rename round" });
      // "Local Connections 2027 updated" wraps within the story's 360px column.
      await expect(input).toHaveValue("Local Connections 2027 updated");
      const box = await rect(page.locator("[data-inline-name-editor]"));
      expect(await input.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
      expect(await input.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(box.width).toBeLessThanOrEqual(360);
    });
  }

  test("a long failure message stays inside a narrow screen and ignores pointers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "features-applications-manage-intake--rename-conflict");
    const alert = page.getByRole("alert").filter({ hasText: "Your edits are preserved" });
    await expect(alert).toBeVisible();

    const box = await rect(alert);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(alert).toHaveCSS("pointer-events", "none");
  });

  test("saves on Enter and on blur, and reverts on Escape", async ({ page }) => {
    await open(page, "patterns-editing--inline-name-editor");
    const input = page.getByRole("textbox", { name: "Rename round" });
    await input.fill("Renamed with Enter");
    await input.press("Enter");
    const entered = name(page, "Renamed with Enter");
    await expect(entered).toBeFocused();

    await entered.click();
    await input.fill("Renamed by blur");
    // Clicking empty page space moves focus away from the field.
    await page.mouse.click(2, 300);
    await expect(name(page, "Renamed by blur")).toBeVisible();
    await expect(input).toHaveCount(0);

    await name(page, "Renamed by blur").click();
    await input.fill("Discarded");
    await input.press("Escape");
    await expect(name(page, "Renamed by blur")).toBeFocused();
    await expect(page.getByText("Discarded")).toHaveCount(0);
  });
});

test.describe("disclosure", () => {
  test("the whole row is the target, led by the chevron, with content under the label", async ({
    page,
  }) => {
    await open(page, "components-disclosure--expanded");
    const trigger = page.getByRole("button", { name: /Earlier versions/ });
    const heading = page.getByRole("heading", { name: /Earlier versions/ });
    const label = trigger.locator("span").first();
    const chevron = trigger.locator("svg");
    const content = page.getByText("Version 1 recommended");

    const row = await rect(trigger);
    const container = await rect(heading);
    expect(row.width).toBeGreaterThanOrEqual(container.width);
    expect((await rect(chevron)).x).toBeLessThan((await rect(label)).x);
    expect(Math.abs((await rect(content)).x - (await rect(label)).x)).toBeLessThanOrEqual(1);

    // A press at the far end of the row, away from the label, toggles it.
    await page.mouse.click(row.x + row.width - 4, row.y + row.height / 2);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  for (const motion of ["no-preference", "reduce"] as const) {
    test(`the panel height ${motion === "reduce" ? "does not animate" : "animates"} with ${motion} motion`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await open(page, "components-disclosure--collapsed");
      const trigger = page.getByRole("button", { name: /Earlier versions/ });

      const heights = await page.evaluate(async () => {
        const panel = document.querySelector<HTMLElement>('[role="group"]')!;
        const samples: number[] = [];
        const start = performance.now();
        document.querySelector<HTMLElement>("button[aria-expanded]")!.click();
        while (performance.now() - start < 500) {
          samples.push(panel.getBoundingClientRect().height);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        return samples;
      });
      await expect(trigger).toHaveAttribute("aria-expanded", "true");

      const final = heights.at(-1)!;
      expect(final).toBeGreaterThan(0);
      const between = heights.filter((height) => height > 0.5 && height < final - 0.5);
      if (motion === "reduce") {
        expect(between).toHaveLength(0);
      } else {
        expect(between.length).toBeGreaterThan(0);
      }
    });
  }
});
