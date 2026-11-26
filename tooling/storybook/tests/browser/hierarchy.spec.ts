import type { Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

const open = async (page: Page, story: string) => {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

const fontSize = (locator: ReturnType<Page["locator"]>) =>
  locator.first().evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));

test("headings step down by level and stay larger than the prose they introduce", async ({
  page,
}) => {
  await open(page, "patterns-page-composition--section-headers");
  const section = await fontSize(
    page.getByRole("heading", { level: 2, name: "Assessment criteria" }),
  );
  const subsection = await fontSize(
    page.getByRole("heading", { level: 3, name: "Community need" }),
  );
  const minor = await fontSize(page.getByRole("heading", { level: 4, name: "Evidence" }));
  const prose = await fontSize(page.getByText("How clearly the proposal shows who it serves."));
  expect(section).toBeGreaterThan(subsection);
  expect(subsection).toBeGreaterThan(minor);
  expect(section).toBeGreaterThan(prose);

  await open(page, "features-funding-rounds-overview--example");
  const criteria = await fontSize(
    page.getByRole("heading", { level: 2, name: "Assessment criteria" }),
  );
  const criterion = await fontSize(page.locator("ul h3"));
  const reading = await page
    .locator("ul li p")
    .first()
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(criteria).toBeGreaterThan(criterion);
  expect(criterion).toBeGreaterThanOrEqual(reading);
});

test("quiet pane headings read in the foreground colour", async ({ page }) => {
  await open(page, "patterns-panel-section--side-panel");
  const colours = await page.getByRole("heading").evaluateAll((headings) =>
    headings.map((heading) => ({
      colour: getComputedStyle(heading).color,
      foreground: getComputedStyle(document.documentElement).getPropertyValue("--foreground"),
    })),
  );
  expect(colours.length).toBeGreaterThan(1);
  const probe = await page.evaluate(() => {
    const element = document.createElement("span");
    element.style.color = "var(--foreground)";
    document.body.append(element);
    const colour = getComputedStyle(element).color;
    element.remove();
    return colour;
  });
  for (const { colour } of colours) {
    expect(colour).toBe(probe);
  }
});

test("consecutive sections are separated by the section spacing", async ({ page }) => {
  const sectionSpace = async () =>
    page.evaluate(() => {
      const element = document.createElement("div");
      element.style.height = "var(--space-section)";
      document.body.append(element);
      const height = element.getBoundingClientRect().height;
      element.remove();
      return height;
    });

  await open(page, "patterns-panel-section--side-panel");
  const regions = page.getByRole("region");
  const gaps = await regions.evaluateAll((nodes) =>
    nodes
      .slice(1)
      .map(
        (node, index) =>
          node.getBoundingClientRect().top - nodes[index]!.getBoundingClientRect().bottom,
      ),
  );
  const space = await sectionSpace();
  expect(gaps.length).toBeGreaterThan(1);
  for (const gap of gaps) {
    expect(gap).toBeCloseTo(space, 0);
  }

  await open(page, "patterns-page-composition--standard");
  const [purpose, applications] = await Promise.all([
    page.getByRole("region", { name: "Purpose", exact: true }).boundingBox(),
    page.getByRole("region", { name: "Applications 3", exact: true }).boundingBox(),
  ]);
  expect(applications!.y - (purpose!.y + purpose!.height)).toBeCloseTo(space, 0);
});

/** Centres of the title's first line and of the page actions, measured in the page. */
const measure = () => {
  const title = document.querySelector("#storybook-root h1")!;
  const style = getComputedStyle(title);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const top = title.getBoundingClientRect().top + Number.parseFloat(style.paddingTop);
  const actions = document.querySelector("[data-page-actions]")!.getBoundingClientRect();
  return { title: top + lineHeight / 2, actions: actions.top + actions.height / 2 };
};

test("page actions centre on the title's first line, with and without a kicker", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Actions wrap below the title on narrow screens.");

  for (const story of [
    "patterns-page-composition--standard",
    "patterns-page-composition--overview",
  ]) {
    await open(page, story);
    const centres = await page.evaluate(measure);
    expect(Math.abs(centres.actions - centres.title), story).toBeLessThanOrEqual(2);
  }

  // Without a kicker.
  await open(page, "patterns-page-composition--long-title");
  await page.evaluate(() => document.querySelector("#storybook-root header p")?.remove());
  const noKicker = await page.evaluate(measure);
  expect(Math.abs(noKicker.actions - noKicker.title)).toBeLessThanOrEqual(2);
});

test("a stacked description list keeps each label nearer its own value", async ({ page }) => {
  await open(page, "components-description-list--overview");
  const items = await page.locator("dl > div").evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.querySelector("dt")!.getBoundingClientRect(),
      value: node.querySelector("dd")!.getBoundingClientRect(),
    })),
  );
  expect(items.length).toBeGreaterThan(2);
  items.forEach((item, index) => {
    const own = item.value.top - item.label.bottom;
    expect(own).toBeLessThan(8);
    if (index > 0) {
      expect(own).toBeLessThan(item.label.top - items[index - 1]!.value.bottom);
    }
  });
});

test("rows labels keep a fixed column and fit on one line in the properties pane", async ({
  page,
}) => {
  await open(page, "features-funding-rounds-overview--example");
  const label = page.getByText("Responsible manager", { exact: true });
  const height = await label.evaluate((node) => {
    const style = getComputedStyle(node);
    return node.getBoundingClientRect().height / Number.parseFloat(style.lineHeight);
  });
  expect(height).toBeLessThan(1.5);
});
