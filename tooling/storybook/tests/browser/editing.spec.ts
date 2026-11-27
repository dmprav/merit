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
    const withError = await rect(editor);
    const headerWithError = await rect(header);

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
    expectSameBox(await rect(header), headerWithError);
    expect(Math.abs((await rect(editor)).y - withError.y)).toBeLessThanOrEqual(1);
    expectSameBox({ ...(await rect(editor)), width: resting.width }, resting);
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
