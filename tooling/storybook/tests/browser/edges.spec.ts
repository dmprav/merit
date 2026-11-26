import type { Locator, Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

/** The horizontal extent of the text inside an element, ignoring padding, fills and borders. */
const textEdges = (target: Locator) =>
  target.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const rects: DOMRect[] = [];
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      // Visually hidden text, such as a table head on mobile, is clipped rather than drawn.
      const clipped = (element: Element | null): boolean =>
        element !== null && element !== node.parentElement
          ? getComputedStyle(element).clipPath !== "none" || clipped(element.parentElement)
          : false;

      if (text.textContent?.trim() && !clipped(text.parentElement)) {
        const range = document.createRange();
        range.selectNodeContents(text);
        rects.push(...range.getClientRects());
      }
    }
    return {
      start: Math.min(...rects.map((rect) => rect.left)),
      end: Math.max(...rects.map((rect) => rect.right)),
    };
  });

/** The box of an icon, for controls whose glyph rather than text meets an edge. */
const glyphEdges = (target: Locator) =>
  target.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { start: rect.left, end: rect.right };
  });

const edges = (target: Locator) =>
  target.evaluate((node) => {
    const { left, right, top, height } = node.getBoundingClientRect();
    return { left, right, top, height };
  });

const open = async (page: Page, story: string) => {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

const tabStories = [
  "components-tabs--default",
  "features-funding-rounds-overview--example",
  "features-funding-rounds-overview--applications",
];

for (const story of tabStories) {
  test(`tabs in ${story} start their text and panel content on the rail's edges`, async ({
    page,
  }) => {
    if (page.viewportSize()!.width > 900) {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await open(page, story);
    const list = page.getByRole("tablist").first();
    const rail = await edges(list.locator(".."));
    const label = await textEdges(list.getByRole("tab").first());
    expect(label.start).toBeCloseTo(rail.left, 0);

    const panel = page.getByRole("tabpanel").first();
    const content = await textEdges(panel);
    expect(content.start).toBeCloseTo(rail.left, 0);
    // Outdented content never makes the panel scroll sideways or clips its fills.
    // Only a panel that scrolls can scroll sideways; the page check below covers the rest.
    expect(
      await panel.evaluate(
        (node) =>
          getComputedStyle(node).overflowX === "visible" || node.scrollWidth <= node.clientWidth,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  });
}

for (const story of ["components-tabs--counts", "components-tabs--counts-right-to-left"]) {
  test(`a scrolled tab strip in ${story} draws nothing outside the rail`, async ({ page }) => {
    await open(page, story);
    const list = page.getByRole("tablist");
    const rail = await edges(list.locator(".."));
    await list.evaluate((node) =>
      node.scrollTo({ left: getComputedStyle(node).direction === "rtl" ? -1e4 : 1e4 }),
    );
    await expect(list).toHaveAttribute("data-scrolled", "true");

    const rtl = story.endsWith("right-to-left");
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=tab]") !== null,
      { x: rtl ? rail.right + 4 : rail.left - 4, y: rail.top + 12 },
    );
    expect(hit).toBe(false);
  });
}

test("the selected tab's rule spans the label text, not the outdented padding", async ({
  page,
}) => {
  await open(page, "components-tabs--default");
  const selected = page.getByRole("tab", { selected: true });
  const rule = await selected.evaluate((node) => {
    const style = getComputedStyle(node, "::after");
    const box = node.getBoundingClientRect();
    return {
      left: box.left + Number.parseFloat(style.left),
      width: Number.parseFloat(style.width),
    };
  });
  const label = await textEdges(selected);

  expect(rule.left).toBeCloseTo(label.start, 0);
  expect(rule.left + rule.width).toBeCloseTo(label.end, 0);
});

test("long tab labels stay on one line, with the full label as the accessible name", async ({
  page,
}) => {
  await open(page, "components-tabs--long-label");
  const long = page.getByRole("tab", {
    name: "Application evidence and supporting financial documentation",
  });
  const short = page.getByRole("tab", { name: "Reviewer assessments" });

  await expect(long).toBeVisible();
  expect((await edges(long)).height).toBeCloseTo((await edges(short)).height, 0);
  const text = long.locator("span span").first();
  expect(await text.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);

  await long.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Application evidence and supporting financial documentation",
  );
  await page.mouse.move(700, 500);
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  // Keyboard focus shows the full label at once; Escape dismisses it; a tab that fits has none.
  await page.keyboard.press("Tab");
  await expect(long).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Application evidence and supporting financial documentation",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(short).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("tabs with counts keep the count beside a truncated label", async ({ page }) => {
  await open(page, "components-tabs--counts");
  const tab = page.getByRole("tab", { name: "Applications awaiting assessment 12345" });
  const box = await edges(tab);
  const count = await edges(page.getByText("12345"));

  expect(count.right).toBeLessThanOrEqual(box.right);
  expect(count.height).toBeLessThan(box.height);
});

test("the data table's first column starts on the heading's edge", async ({ page }) => {
  await open(page, "components-data-table--aligned-with-heading");
  const heading = await textEdges(page.getByRole("heading", { name: "Funded projects" }));
  const cell = await textEdges(page.getByRole("cell", { name: "Community transport" }));

  expect(cell.start).toBeCloseTo(heading.start, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});

test("data table rules stay on the content edges while row fills reach into the gutter", async ({
  page,
}) => {
  await open(page, "components-data-table--aligned-with-heading");
  const heading = await edges(page.getByRole("heading", { name: "Funded projects" }));
  const rule = await page.evaluate(() => {
    const row = document.querySelector("table[aria-label] tbody tr")!;
    const box = row.getBoundingClientRect();
    const before = getComputedStyle(row, "::before");
    if (before.content !== "none") {
      return {
        left: box.left + Number.parseFloat(before.left),
        right: box.right - Number.parseFloat(before.right),
      };
    }

    const cells = row.querySelectorAll("td");
    const first = cells[0]!;
    const last = cells[cells.length - 1]!;
    return {
      left:
        first.getBoundingClientRect().left +
        Number.parseFloat(getComputedStyle(first, "::after").left),
      right:
        last.getBoundingClientRect().right -
        Number.parseFloat(getComputedStyle(last, "::after").right),
    };
  });
  expect(rule.left).toBeCloseTo(heading.left, 0);
  expect(rule.right).toBeCloseTo(heading.right, 0);

  const row = page.locator("table[aria-label] tbody tr").first();
  await row.hover();
  const fill = await row.evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
  }));
  expect(fill.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(fill.left).toBeLessThan(heading.left - 8);
  expect(fill.right).toBeGreaterThan(heading.right + 8);
});

test("a quiet control leading a table cell starts on the column's edge", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 760, "The mobile layout labels each value instead.");
  await open(page, "features-contacts-directory--overview");
  const column = await textEdges(page.getByRole("columnheader", { name: "Applications" }));
  const control = await textEdges(page.getByRole("button", { name: /1 application/ }));

  expect(control.start).toBeCloseTo(column.start, 0);
});

test("data table messages start where the cell text starts", async ({ page }) => {
  await open(page, "components-data-table--refreshing");
  const cell = await textEdges(page.getByRole("cell", { name: "Community transport" }));
  const status = await textEdges(page.getByRole("status"));
  expect(status.start).toBeCloseTo(cell.start, 0);

  await open(page, "components-data-table--empty");
  const empty = await textEdges(page.getByRole("status"));
  expect(empty.start).toBeCloseTo(cell.start, 0);

  await open(page, "components-data-table--refresh-error");
  const error = await textEdges(page.getByRole("alert"));
  expect(error.start).toBeCloseTo(cell.start, 0);
});

test("trailing actions in panel sections end on the content's edge", async ({ page }) => {
  await open(page, "patterns-panel-section--side-panel");
  const end = (await edges(page.getByRole("region", { name: "Application details" }))).right;

  const pencil = page.getByRole("button", { name: "Edit application details" });
  expect((await glyphEdges(pencil.locator("svg"))).end).toBeCloseTo(end, 0);
  const all = page.getByRole("button", { name: "All assessments" });
  expect((await textEdges(all)).end).toBeCloseTo(end, 0);
  const choice = page.getByRole("button", { name: /Sam Morgan/ });
  expect((await glyphEdges(choice.locator("svg").last())).end).toBeCloseTo(end, 0);
});

test("trailing actions in section headers end on the content's edge", async ({ page }) => {
  await open(page, "patterns-page-composition--section-header-quiet-actions");
  const contacts = page.getByRole("region", { name: "Contacts" });
  const text = await textEdges(contacts.getByRole("button", { name: "View all" }));
  expect(text.end).toBeCloseTo((await edges(contacts)).right, 0);

  const notes = page.getByRole("region", { name: "Notes" });
  const glyph = await glyphEdges(notes.getByRole("button", { name: "Edit notes" }).locator("svg"));
  expect(glyph.end).toBeCloseTo((await edges(notes)).right, 0);
});

test("conflict recovery actions start on the banner's text edge", async ({ page }) => {
  await open(page, "patterns-conflict-recovery--save-conflict");
  const banner = page.getByRole("alert");
  const message = await textEdges(banner.getByText("Review the latest saved wording"));
  const action = await textEdges(
    banner.getByRole("button", { name: "Save my changes over latest" }),
  );

  expect(action.start).toBeCloseTo(message.start, 0);
});

test("message box chips start where the input text starts", async ({ page }) => {
  await open(page, "patterns-message-box--with-chips");
  const input = page.getByRole("textbox");
  const start = await input.evaluate(
    (node) =>
      node.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(node).paddingLeft),
  );
  const chip = await edges(page.locator("[data-chip]").first());

  expect(chip.left).toBeCloseTo(start, 0);
});
