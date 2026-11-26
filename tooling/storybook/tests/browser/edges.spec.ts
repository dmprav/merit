import type { Locator, Page } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

/** The horizontal extent of the text inside an element, ignoring padding, fills and borders. */
const textEdges = (target: Locator) =>
  target.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const rects: DOMRect[] = [];
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (text.textContent?.trim()) {
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
    const { left, right, height } = node.getBoundingClientRect();
    return { left, right, height };
  });

const open = async (page: Page, story: string) => {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

const tabStories = ["components-tabs--default", "features-funding-rounds-overview--example"];

for (const story of tabStories) {
  test(`tabs in ${story} start their text and panel on the rail's edges`, async ({ page }) => {
    await open(page, story);
    const list = page.getByRole("tablist").first();
    const rail = await edges(list.locator(".."));
    const label = await textEdges(list.getByRole("tab").first());
    expect(label.start).toBeCloseTo(rail.left, 0);

    const panel = page.getByRole("tabpanel").first();
    const box = await edges(panel);
    expect(box.left).toBeCloseTo(rail.left, 0);
    expect(box.right).toBeCloseTo(rail.right, 0);
    const content = await textEdges(panel);
    expect(content.start).toBeCloseTo(rail.left, 0);

    // The page never scrolls sideways for the outdent.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
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
