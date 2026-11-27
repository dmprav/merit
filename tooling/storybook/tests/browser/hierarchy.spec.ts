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
  expect(section).toBeGreaterThan(subsection);
  expect(subsection).toBeGreaterThan(minor);

  // A section heading outranks the reading prose it introduces.
  await open(page, "patterns-page-composition--standard");
  const purpose = page.getByRole("region", { name: "Purpose", exact: true });
  expect(await fontSize(purpose.getByRole("heading"))).toBeGreaterThan(
    await fontSize(purpose.getByRole("paragraph")),
  );

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
  const colours = await page
    .getByRole("heading")
    .evaluateAll((headings) => headings.map((heading) => getComputedStyle(heading).color));
  expect(colours.length).toBeGreaterThan(1);
  const probe = await page.evaluate(() => {
    const element = document.createElement("span");
    element.style.color = "var(--foreground)";
    document.body.append(element);
    const colour = getComputedStyle(element).color;
    element.remove();
    return colour;
  });
  for (const colour of colours) {
    expect(colour).toBe(probe);
  }
});

test("quiet pane headings are no lighter than the first text under them", async ({ page }) => {
  for (const story of [
    "features-applications-committee-decision--summary-with-history",
    "features-applications-recommendation--default",
  ]) {
    await open(page, story);
    const pairs = await page
      .locator("#storybook-root section[aria-labelledby]")
      .evaluateAll((sections) =>
        sections.flatMap((section) => {
          const heading = document.getElementById(section.getAttribute("aria-labelledby")!);
          const text = [...section.querySelectorAll<HTMLElement>("*")].find(
            (node) =>
              !heading?.contains(node) &&
              !node.closest("button") &&
              node.children.length === 0 &&
              node.textContent?.trim() &&
              !(heading!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING),
          );
          return heading && text
            ? [
                {
                  name: heading.textContent,
                  heading: Number(getComputedStyle(heading).fontWeight),
                  text: Number(getComputedStyle(text).fontWeight),
                },
              ]
            : [];
        }),
      );
    expect(pairs.length, story).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair.heading, `${story}: ${pair.name}`).toBeGreaterThanOrEqual(pair.text);
    }
  }
});

test("subsection headings in a reference pane stay as large as the answers under them", async ({
  page,
}) => {
  for (const story of [
    "features-applications-review-an-assigned-application--writing",
    "features-applications-manage-intake--intake-correction",
  ]) {
    await open(page, story);
    const pairs = await page.evaluate(() => {
      const size = (node: Element) => Number.parseFloat(getComputedStyle(node).fontSize);

      return [...document.querySelectorAll("[data-reading-viewport] :is(h3, h4, h5)")].flatMap(
        (heading) => {
          const text = heading.closest("section")?.querySelector("p");
          return text
            ? [{ name: heading.textContent, heading: size(heading), text: size(text) }]
            : [];
        },
      );
    });
    expect(pairs.length, story).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair.heading, `${story}: ${pair.name}`).toBeGreaterThanOrEqual(pair.text);
    }
  }
});

test("no subsection heading in a work pane or dialog body outsizes the frame title", async ({
  page,
}) => {
  let checked = 0;
  for (const story of [
    "features-applications-review-an-assigned-application--writing",
    "features-applications-manage-reviews--criterion-notes",
  ]) {
    await open(page, story);
    const sizes = await page.evaluate(() => {
      const size = (node: Element) => Number.parseFloat(getComputedStyle(node).fontSize);

      const titles = [...document.querySelectorAll("[data-dialog-header] h2")].map(size);
      const bodies = [
        ...document.querySelectorAll(
          "[data-frame-body]:not([data-reading-viewport]) :is(h3, h4, h5)",
        ),
      ].map((heading) => ({ name: heading.textContent, size: size(heading) }));
      return { title: Math.min(...titles), bodies };
    });
    for (const heading of sizes.bodies) {
      expect(heading.size, `${story}: ${heading.name}`).toBeLessThanOrEqual(sizes.title);
    }

    checked += sizes.bodies.length;
  }

  expect(checked).toBeGreaterThan(0);
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

  // The page's sections follow the token: moving it moves them.
  await open(page, "patterns-page-composition--standard");

  const pageGap = async () => {
    const [purpose, applications] = await Promise.all([
      page.getByRole("region", { name: "Purpose", exact: true }).boundingBox(),
      page.getByRole("region", { name: "Applications 3", exact: true }).boundingBox(),
    ]);
    return applications!.y - (purpose!.y + purpose!.height);
  };

  expect(await pageGap()).toBeCloseTo(space, 0);
  await page.addStyleTag({ content: ":root { --space-section: 40px; }" });
  expect(await pageGap()).toBeCloseTo(40, 0);
});

/** Centres of the title's first line and of the page actions, and the header's context and gap. */
const measure = () => {
  const title = document.querySelector("#storybook-root h1")!;
  const style = getComputedStyle(title);
  const top = title.getBoundingClientRect().top + Number.parseFloat(style.paddingTop);
  const actions = document.querySelector("[data-page-actions]")!.getBoundingClientRect();
  const header = document.querySelector("#storybook-root header")!;
  const context = (
    header.querySelector("[class*=description]") ?? title.parentElement!
  ).getBoundingClientRect();
  return {
    title: top + Number.parseFloat(style.lineHeight) / 2,
    actions: actions.top + actions.height / 2,
    below: actions.top - context.bottom,
    beside: actions.left > title.getBoundingClientRect().right,
  };
};

test("page actions centre on the title, with and without a kicker", async ({ page }, testInfo) => {
  const narrow = testInfo.project.name !== "desktop";
  const cases = [
    { story: "patterns-page-composition--standard", width: undefined },
    { story: "patterns-page-composition--overview", width: undefined },
    { story: "patterns-page-composition--without-kicker", width: undefined },
    { story: "patterns-page-composition--long-title", width: 900 },
    { story: "patterns-page-composition--long-title", width: 1100 },
  ];
  for (const { story, width } of cases) {
    if (width && narrow) {
      continue;
    }
    if (width) {
      await page.setViewportSize({ width, height: 1000 });
    }

    await open(page, story);
    const centres = await page.evaluate(measure);
    if (narrow) {
      // Wrapped actions sit one header gap below the context, with no dead space.
      const gap = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.height = "var(--space-4)";
        document.body.append(probe);
        const height = probe.getBoundingClientRect().height;
        probe.remove();
        return height;
      });
      expect(centres.below, story).toBeCloseTo(gap, 0);
    } else {
      expect(Math.abs(centres.actions - centres.title), story).toBeLessThanOrEqual(2);
    }
  }
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

test("an editable properties pane keeps one row pitch", async ({ page }) => {
  await open(page, "features-funding-rounds-manage-round--overview");
  const heights = await page
    .getByRole("complementary")
    .locator("dl > div")
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(3);
  for (const height of heights) {
    expect(height).toBeCloseTo(heights[0]!, 0);
  }
});
