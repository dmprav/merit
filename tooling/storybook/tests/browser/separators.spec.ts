import type { Locator, Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

const open = async (page: Page, story: string) => {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

/** The resolved colour of a token, as the browser computes it for a border. */
const token = (page: Page, name: string) =>
  page.evaluate((property) => {
    const probe = document.createElement("div");
    probe.style.borderTop = `1px solid var(${property})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).borderTopColor;
    probe.remove();
    return color;
  }, name);

const ruleColor = (rule: Locator) => rule.evaluate((node) => getComputedStyle(node).borderTopColor);

test("a divider leaves the same visible space on both sides whatever the stack gap", async ({
  page,
}) => {
  await open(page, "components-divider--across-stack-gaps");

  const spaces: { above: number; below: number }[] = [];
  for (const gap of [3, 6]) {
    const stack = page.getByRole("region", { name: `Gap ${gap}` });
    const above = (await stack.locator("p").first().boundingBox())!;
    const rule = (await stack.locator("hr").boundingBox())!;
    const below = (await stack.locator("p").last().boundingBox())!;
    spaces.push({
      above: rule.y - (above.y + above.height),
      below: below.y - (rule.y + rule.height),
    });
  }

  for (const { above, below } of spaces) {
    expect(above).toBeCloseTo(below, 0);
  }
  expect(spaces[0]!.above).toBeCloseTo(spaces[1]!.above, 0);
});

test("separators inside a surface are subtle and a surface edge keeps the full border", async ({
  page,
}) => {
  await open(page, "components-divider--between-blocks");
  const subtle = await token(page, "--border-subtle");
  const edge = await token(page, "--border");
  expect(subtle).not.toBe(edge);
  expect(await ruleColor(page.locator("hr"))).toBe(subtle);

  await open(page, "components-divider--edge");
  expect(await ruleColor(page.locator("hr"))).toBe(edge);

  await open(page, "components-layout-primitives--divided");
  const entry = page.locator("[data-divided='between'] > *").nth(1);
  expect(await ruleColor(entry)).toBe(subtle);

  await open(page, "components-description-list--divided");
  const item = page.locator("dl[data-divided] > *").first();
  expect(await item.evaluate((node) => getComputedStyle(node).borderBottomColor)).toBe(subtle);
});

test("no list of recorded assessments ends with a trailing rule", async ({ page }) => {
  await open(page, "features-applications-manage-reviews--assessment-history");

  const trailing = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-divided='between']")].flatMap((list) => {
      const last = list.lastElementChild;
      return last && (last.tagName === "HR" || getComputedStyle(last).borderBottomWidth !== "0px")
        ? [list.className]
        : [];
    }),
  );
  expect(trailing).toEqual([]);
  await expect(page.locator("[data-divided='between']").first()).toBeVisible();
});
