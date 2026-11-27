import { stripVTControlCharacters } from "node:util";

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

const centre = (target: Locator) =>
  target.evaluate((node) => {
    const { top, height } = node.getBoundingClientRect();
    return top + height / 2;
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
    const panelEnd = await panel.evaluate(
      (node) =>
        node.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(node).paddingRight),
    );
    expect(panelEnd).toBeCloseTo(rail.right, 0);
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
  const label = tab.locator("span span").first();
  expect(await label.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);

  const count = await centre(page.getByText("12345"));
  const text = await centre(label);
  expect(Math.abs(count - text)).toBeLessThanOrEqual(1);
  expect((await edges(page.getByText("12345"))).right).toBeLessThanOrEqual(
    (await edges(tab)).right,
  );
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

/**
 * Every action in a section header or panel section: one line tall, and the trailing quiet one
 * ending on the row's edge.
 */
const headerActions = (page: Page) =>
  page.evaluate(() => {
    const textEnd = (node: Element) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let end = Number.NEGATIVE_INFINITY;
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (text.textContent?.trim()) {
          const range = document.createRange();
          range.selectNodeContents(text);
          end = Math.max(end, ...[...range.getClientRects()].map((rect) => rect.right));
        }
      }

      return end;
    };

    // One line of text between the button's own padding and border, or its minimum height.
    const singleLine = (button: HTMLElement) => {
      const style = getComputedStyle(button);
      const lines =
        Number.parseFloat(style.lineHeight) +
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        Number.parseFloat(style.borderTopWidth) +
        Number.parseFloat(style.borderBottomWidth);
      return Math.max(Number.parseFloat(style.minHeight), lines);
    };

    const asides = [...document.querySelectorAll("[data-header-actions]")];
    return asides.flatMap((aside) => {
      const buttons = [...aside.querySelectorAll<HTMLElement>("button, a")].filter(
        (button) => button.getClientRects().length > 0,
      );
      const edge = aside.parentElement!.getBoundingClientRect().right;
      return buttons.map((button) => {
        const box = button.getBoundingClientRect();
        const trailing = button === buttons[buttons.length - 1];
        const quiet = button.dataset.variant === "quiet";
        const glyph = button.dataset.iconOnly ? button.querySelector("svg") : null;
        return {
          name: button.textContent?.trim() || button.getAttribute("aria-label") || "",
          height: box.height,
          single: singleLine(button),
          // Only a trailing quiet action is outdented to the edge.
          end:
            trailing && quiet
              ? glyph
                ? glyph.getBoundingClientRect().right
                : textEnd(button)
              : null,
          edge,
        };
      });
    });
  });

for (const story of [
  "features-applications-application-detail--evidence",
  "features-applications-manage-reviews--changed-application",
  "features-applications-manage-reviews--adding-request",
  "features-applications-recommendation--default",
]) {
  test(`header actions in ${story} stay on one line and end on the edge`, async ({ page }) => {
    await open(page, story);
    const actions = await headerActions(page);

    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.height, action.name).toBeLessThanOrEqual(action.single + 1);
      if (action.end !== null) {
        expect(action.end, action.name).toBeCloseTo(action.edge, 0);
      }
    }
  });
}

/**
 * Stories whose play functions assume a desktop viewport and throw at 390px (a Testing Library
 * assertion or a missing element). They fail the same way on the base commit, before the edge
 * alignment change, and test:stories owns them at their intended viewport.
 */
const KNOWN_MOBILE_PLAY_FAILURES = new Map([
  // Each fragment is what that story's failing assertion prints about the element it cannot see.
  ["features-workspace-search--results", 'data-key="round:k7m2p9x4n6rt"'],
  ["features-workspace-search--no-matches", "is not visible:\n  <p"],
  ["features-workspace-search--loading-keeps-results", 'data-key="application:b8q3w5j7c2df"'],
  ["features-workspace-search--failure", "is not visible:\n  <p"],
  ["features-workspace-request-access--submitting", 'aria-label="Request an invitation"'],
  ["features-team-manage-team--invite-reviewer", 'aria-haspopup="listbox"'],
  ["features-team-manage-team--resume-access", 'data-key="edit"'],
  [
    "features-merit-ai-conversation--closed",
    'Unable to find role="button" and name "Ask Merit AI"',
  ],
  ["features-contacts-edit-contact--saving", 'aria-label="Edit contact details"'],
  ["features-contacts-directory--no-search-results", 'aria-label="Clear search"'],
  [
    "features-applications-manage-reviewer-invitations--undelivered-invitation",
    'data-key="resend"',
  ],
  ["features-applications-manage-intake--ready-for-review", 'data-key="start_revision"'],
]);

test("no header or panel action wraps in any feature or pattern story", async ({
  page: first,
  request,
  baseURL,
  browserErrors,
}) => {
  test.setTimeout(900_000);
  const index = (await (await request.get(`${baseURL}/index.json`)).json()) as {
    entries: Record<string, { id: string; type: string }>;
  };
  const stories = Object.values(index.entries)
    .filter((entry) => entry.type === "story" && /^(features|patterns)-/.test(entry.id))
    .map((entry) => entry.id);

  const width = first.viewportSize()!.width;
  const context = first.context();
  const wrapped: string[] = [];
  let measured = 0;
  let page = first;
  for (const [position, story] of stories.entries()) {
    // A long sweep outlives a single page, so each batch of stories gets a fresh one.
    if (position > 0 && position % 40 === 0) {
      await page.close();
      page = await context.newPage();
    }
    await page.goto(`/iframe.html?id=${story}&viewMode=story`);
    // "error" marks a finding the story's own checks report, such as an accessibility rule; the
    // story is rendered and measurable either way.
    await expect(page.locator("#storybook-root"), story).toHaveAttribute(
      "data-story-ready",
      /^(true|error)$/,
    );
    const actions = await headerActions(page);
    measured += actions.length > 0 ? 1 : 0;
    for (const action of actions) {
      if (action.height > action.single + 1) {
        wrapped.push(`${story} @${width}: ${action.name} is ${action.height}px`);
      }
    }
  }

  // At 390px only the known play-function failures are allowed; every other error fails the test.
  if (width < 500) {
    const known = (error: { message: string; url: string }) => {
      const id = new URL(error.url).searchParams.get("id") ?? "";
      const fragment = KNOWN_MOBILE_PLAY_FAILURES.get(id);

      return fragment !== undefined && stripVTControlCharacters(error.message).includes(fragment);
    };

    browserErrors.splice(
      0,
      browserErrors.length,
      ...browserErrors.filter((error) => !known(error)),
    );
  }

  // Reported so a sweep that measures nothing is noticed.
  console.log(`${stories.length} stories swept at ${width}px, ${measured} with header actions`);
  expect(measured).toBeGreaterThan(0);
  expect(wrapped).toEqual([]);
});

test("a table's trailing row action ends its glyph on the content edge", async ({ page }) => {
  await open(page, "features-team-manage-team--owner");
  const end = (await edges(page.getByRole("tablist").locator(".."))).right;
  const glyph = page.locator("[data-row-actions] button svg").first();

  expect((await glyphEdges(glyph)).end).toBeCloseTo(end, 0);
});

test("the collection filter's glyph starts on the content edge", async ({ page }) => {
  await open(page, "features-contacts-directory--overview");
  const heading = await textEdges(page.getByRole("heading", { level: 1 }));
  const glyph = await glyphEdges(
    page
      .getByRole("button", { name: /filter/i })
      .first()
      .locator("svg"),
  );

  expect(glyph.start).toBeCloseTo(heading.start, 0);
});

test("a selected tab's rule is still painted in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "components-tabs--default");
  const rule = await page.getByRole("tab", { selected: true }).evaluate((node) => {
    const style = getComputedStyle(node, "::after");
    const page = getComputedStyle(node);
    return {
      painted:
        style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        style.backgroundColor !== page.backgroundColor,
      height: Number.parseFloat(style.height),
    };
  });

  expect(rule.painted).toBe(true);
  expect(rule.height).toBeGreaterThan(0);
});

test("a cut-off tab's tooltip stays open while the pointer is on it", async ({ page }) => {
  await open(page, "components-tabs--long-label");
  await page
    .getByRole("tab", { name: "Application evidence and supporting financial documentation" })
    .hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();

  const box = (await tooltip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  // Past the shared close delay, a pointer on the tooltip keeps it open.
  await page.waitForTimeout(500);
  await expect(tooltip).toBeVisible();

  await page.mouse.move(700, 500);
  await expect(tooltip).toHaveCount(0);
});

test("a large quiet action aligned at the end meets the edge with its text", async ({ page }) => {
  await open(page, "components-button--aligned-at-end");
  const large = page.getByRole("button", { name: "Review all assessments" });
  const parent = await edges(large.locator(".."));

  expect((await textEdges(large)).end).toBeCloseTo(parent.right, 0);
});

test("a start-aligned icon button's glyph meets the container's edge", async ({ page }) => {
  await open(page, "components-button--icon-aligned-at-start");
  for (const name of ["Edit", "Edit large"]) {
    const button = page.getByRole("button", { name, exact: true });
    const parent = await edges(button.locator(".."));

    expect((await glyphEdges(button.locator("svg"))).start, name).toBeCloseTo(parent.left, 0);
  }
});
