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

/** The visible space above and below each rule a divided stack draws between its entries. */
const spaceAroundRules = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-divided='between']")].flatMap((list) =>
      [...list.children].slice(1).map((entry) => {
        const box = entry.getBoundingClientRect();
        const before = entry.previousElementSibling!.getBoundingClientRect();
        const style = getComputedStyle(entry);
        const firstChild = entry.firstElementChild?.getBoundingClientRect();
        return {
          above: box.top - before.bottom,
          below: (firstChild?.top ?? box.top) - box.top - Number.parseFloat(style.borderTopWidth),
        };
      }),
    ),
  );

/** Entries that end in a rule, whether an hr or a bottom border. */
const trailingRules = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-divided='between']")].flatMap((list) =>
      [...list.children].filter((entry) => {
        const last = entry.lastElementChild;
        return (
          last &&
          (last.tagName === "HR" ||
            Number.parseFloat(getComputedStyle(last).borderBottomWidth) > 0 ||
            Number.parseFloat(getComputedStyle(entry).borderBottomWidth) > 0)
        );
      }).length
        ? [list.className]
        : [],
    ),
  );

for (const story of ["assessment-history", "many-recorded-versions"]) {
  test(`${story}: no trailing rule, equal space around rules, and room under the reviewer`, async ({
    page,
  }) => {
    await open(page, `features-applications-manage-reviews--${story}`);
    await expect(page.locator("[data-divided='between']").first()).toBeVisible();
    expect(await trailingRules(page)).toEqual([]);
    for (const { above, below } of await spaceAroundRules(page)) {
      expect(above).toBeCloseTo(below, 0);
    }

    await page.locator('[data-review-action$=":history"]').first().click();
    await expect(
      page.getByRole("heading", { name: "Earlier assessments and edits" }),
    ).toBeVisible();
    const article = page.getByRole("article").first();
    const heading = article.locator("section h3").first();
    await expect(heading).toBeVisible();
    expect(await trailingRules(page)).toEqual([]);
    for (const { above, below } of await spaceAroundRules(page)) {
      expect(above).toBeCloseTo(below, 0);
    }

    const person = (await article.locator("h3").first().boundingBox())!;
    const first = (await heading.boundingBox())!;
    const space = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.paddingTop = "var(--space-4)";
      document.body.append(probe);
      const value = Number.parseFloat(getComputedStyle(probe).paddingTop);
      probe.remove();
      return value;
    });
    expect(first.y - (person.y + person.height)).toBeGreaterThanOrEqual(space);
  });
}

test("a divider inside a wrapper within a stack keeps its full spacing", async ({ page }) => {
  await open(page, "components-divider--inside-wrapper");
  const wrapper = page.getByRole("region", { name: "Wrapped" });
  const above = (await wrapper.locator("p").first().boundingBox())!;
  const rule = (await wrapper.locator("hr").boundingBox())!;
  const below = (await wrapper.locator("p").last().boundingBox())!;
  const space = Number.parseFloat(
    await wrapper.locator("hr").evaluate((node) => getComputedStyle(node).marginTop),
  );
  expect(space).toBeGreaterThan(0);
  expect(rule.y - (above.y + above.height)).toBeCloseTo(space, 0);
  expect(below.y - (rule.y + rule.height)).toBeCloseTo(space, 0);
});
