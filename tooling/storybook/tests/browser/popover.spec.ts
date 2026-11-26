import type { Locator, Page, TestInfo } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

type Popover = {
  name: string;
  story: string;
  /** The control the popover opened from, which the gap is measured against. */
  trigger: (page: Page) => Locator;
  /** The list that scrolls inside the popover, where it has one. */
  scroller?: boolean;
};

const popovers: Popover[] = [
  {
    name: "select list",
    story: "components-select--long-list",
    trigger: (page) => page.getByRole("button", { name: /Funding round/ }),
    scroller: true,
  },
  {
    name: "action menu",
    story: "components-action-menu--keyboard",
    trigger: (page) => page.getByRole("button", { name: "More actions" }),
    scroller: true,
  },
  {
    name: "picker",
    story: "components-dialog--picker",
    trigger: (page) => page.getByRole("button", { name: /^Status:/ }),
    scroller: true,
  },
  {
    name: "reference popover",
    story: "components-dialog--popover",
    trigger: (page) => page.getByRole("button", { name: "Open dialog" }),
  },
  {
    name: "tooltip",
    story: "components-tooltip--hover",
    trigger: (page) => page.getByRole("button", { name: "Copy address" }),
  },
  {
    name: "shell context popover",
    story: "patterns-application-shell--workspace-switcher",
    trigger: (page) => page.getByRole("button", { name: /Switch workspace/ }),
    scroller: true,
  },
];

const desktopOnly = (testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Measures geometry at one viewport.");
};

const open = async (page: Page, story: string, height = 800) => {
  // Geometry is measured once the surface is fully shown, not mid-fade.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height });
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

/** The one popover surface on the page, wherever its overlay root is. */
const surface = (page: Page) => page.locator("[data-placement]:visible").last();

const measureSurface = (root: Locator) =>
  root.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow,
    };
  });

/** The space between the trigger and the popover edge facing it. */
const measureGap = async (root: Locator, trigger: Locator) => {
  const placement = (await root.getAttribute("data-placement"))!;
  const [surfaceBox, triggerBox] = [await root.boundingBox(), await trigger.boundingBox()];
  const [popover, control] = [surfaceBox!, triggerBox!];
  switch (placement) {
    case "bottom":
      return popover.y - (control.y + control.height);
    case "top":
      return control.y - (popover.y + popover.height);
    case "right":
      return popover.x - (control.x + control.width);
    default:
      return control.x - (popover.x + popover.width);
  }
};

const measureScroller = (root: Locator) =>
  root.evaluate((node) => {
    const px = (value: string) => Number.parseFloat(value);

    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const scrollers = [node, ...node.querySelectorAll<HTMLElement>("*")].filter(
      (element) =>
        !element.matches("textarea, input, select") &&
        /auto|scroll/.test(getComputedStyle(element).overflowY),
    );
    const scroller = scrollers[0]!;
    const scrollerBox = scroller.getBoundingClientRect();
    const scrollerStyle = getComputedStyle(scroller);
    const rows = [
      ...scroller.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"], a[href]'),
    ];
    const first = rows[0]?.getBoundingClientRect();
    return {
      count: scrollers.length,
      innerLeft: box.left + px(style.borderLeftWidth),
      innerRight: box.right - px(style.borderRightWidth),
      scrollerLeft: scrollerBox.left,
      scrollerRight: scrollerBox.right,
      padding: px(scrollerStyle.paddingLeft),
      rowInset: first ? first.left - scrollerBox.left : null,
      // A row that straddles the bottom edge shows the list continuing.
      cutsRow: rows.some((row) => {
        const rowBox = row.getBoundingClientRect();
        return rowBox.top < scrollerBox.bottom - 1 && rowBox.bottom > scrollerBox.bottom + 1;
      }),
      overflows: scroller.scrollHeight > scroller.clientHeight,
    };
  });

test.describe("popovers share one surface", () => {
  for (const popover of popovers) {
    test(`${popover.name} sits on the shared surface, 6px from its trigger`, async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo);
      await open(page, popover.story);
      const root = surface(page);
      await expect(root).toBeVisible();

      const style = await measureSurface(root);
      expect(style.borderWidth).toBe("1px");
      expect(style.radius).toBe("8px");
      expect(style.shadow).not.toBe("none");
      // Positioning snaps to whole pixels beside a trigger with a fractional edge.
      expect(Math.abs((await measureGap(root, popover.trigger(page))) - 6)).toBeLessThanOrEqual(1);
    });
  }

  test("every popover has the same border colour, radius and shadow", async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    const reference = await (async () => {
      await open(page, popovers[0]!.story);
      return measureSurface(surface(page));
    })();

    for (const popover of popovers.slice(1)) {
      await open(page, popover.story);
      const style = await measureSurface(surface(page));
      expect(style, popover.name).toEqual(reference);
    }
  });

  for (const popover of popovers.filter((candidate) => candidate.scroller)) {
    test(`${popover.name} puts its scrollbar at the surface edge, with rows inset`, async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo);
      await open(page, popover.story);
      const scroll = await measureScroller(surface(page));

      expect(scroll.count).toBe(1);
      expect(scroll.scrollerLeft).toBeCloseTo(scroll.innerLeft, 0);
      expect(scroll.scrollerRight).toBeCloseTo(scroll.innerRight, 0);
      expect(scroll.padding).toBeGreaterThan(0);
      expect(scroll.rowInset).toBeCloseTo(scroll.padding, 0);
    });
  }
});

test("a long select list is cut partway through a row", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await open(page, "components-select--long-list");
  const scroll = await measureScroller(surface(page));

  expect(scroll.overflows).toBe(true);
  expect(scroll.cutsRow).toBe(true);
});

test("a picker that is only a choice list has one scroll container", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await open(page, "components-dialog--picker");
  const root = surface(page);
  const scroll = await measureScroller(root);

  expect(scroll.count).toBe(1);
  expect(scroll.scrollerLeft).toBeCloseTo(scroll.innerLeft, 0);
  expect(await root.evaluate((node) => getComputedStyle(node).overflowY)).toBe("hidden");
});

/** The surface's scroll end, after which its lowest control must sit inside its border. */
const scrollToEnd = (root: Locator) =>
  root.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    const box = node.getBoundingClientRect();
    const innerBottom = box.bottom - Number.parseFloat(getComputedStyle(node).borderBottomWidth);
    // Skip the visually hidden dismiss buttons React Aria adds, which are a pixel wide.
    const bottoms = [...node.querySelectorAll<HTMLElement>("button, input, [role=grid]")]
      .map((control) => control.getBoundingClientRect())
      .filter((rect) => rect.width > 2)
      .map((rect) => rect.bottom);
    return { innerBottom, lowest: Math.max(...bottoms) };
  });

test("a picker with notes around its choice list keeps every control reachable", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await open(page, "features-applications-manage-reviews--adding-request", 420);
  const root = surface(page);
  const end = await scrollToEnd(root);

  expect(end.lowest).toBeLessThanOrEqual(end.innerBottom + 0.5);
  expect(await measureScroller(root).then((scroll) => scroll.count)).toBeGreaterThanOrEqual(1);
});

test("notes around a choice list line up with its rows", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await open(page, "features-applications-manage-reviews--adding-request");
  const dialog = page.getByRole("dialog", { name: "Request review" });

  const textStart = (locator: Locator) =>
    locator.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().left;
    });

  const note = dialog.getByText("Choose a reviewer to record a request. No message is sent.");
  const row = dialog.getByRole("option", { name: /Jules Patel/ }).getByText("Jules Patel");
  expect(await textStart(note)).toBeCloseTo(await textStart(row), 0);
});

test("a short picker keeps its bottom padding when it scrolls", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await open(page, "components-date-field--calendar-open", 260);
  const end = await scrollToEnd(surface(page));

  // The dialog's padding is 12px.
  expect(end.innerBottom - end.lowest).toBeGreaterThanOrEqual(11);
});

test("search palette headings and rows share one left edge", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await open(page, "patterns-search-palette--results");
  const dialog = page.getByRole("dialog", { name: "Search the workspace" });

  const textStart = (text: string) =>
    dialog.getByText(text, { exact: true }).evaluate((node) => {
      // The text itself, not the padding box around it.
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().left;
    });

  expect(await textStart("Funding rounds")).toBeCloseTo(await textStart("Harbour fund"), 0);
});

for (const story of [
  "features-contacts-contact-picker--no-results",
  "features-contacts-contact-picker--archived-selection",
]) {
  test(`${story} never holds focus without a visible indicator`, async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page, story);
    // Keyboard modality, so the focus ring rules for keyboard users apply.
    await page.keyboard.press("Shift");
    const list = page.getByRole("listbox");
    await list.focus();

    const shadow = await list.evaluate((node) => getComputedStyle(node).boxShadow);
    expect(shadow).not.toBe("none");
  });
}
