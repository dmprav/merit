import type { Locator, Page, TestInfo } from "@playwright/test";

import { test, expect } from "@merit/test-support/browser";

type Placement = {
  name: string;
  story: string;
  frame: string;
  viewport: { width: number; height: number };
  /** Whether the header ends in a close control and a footer holds actions. */
  close: boolean;
  footer: boolean;
  /** The docked companion and workspace panes keep a header rule at rest. */
  ruled: boolean;
  index?: number;
  /** The header's height with a one-line title, where the placement fixes it. */
  bar?: number;
  /** False where the story's body is too short to scroll. */
  scrolls?: boolean;
};

const placements: Placement[] = [
  {
    name: "centered dialog",
    story: "patterns-form-dialog--long-content",
    frame: "center",
    viewport: { width: 1440, height: 800 },
    close: true,
    footer: true,
    ruled: false,
  },
  {
    name: "side panel",
    story: "components-dialog--side-panel",
    frame: "end",
    viewport: { width: 1440, height: 800 },
    close: true,
    footer: true,
    ruled: false,
  },
  {
    name: "reference popover",
    story: "components-dialog--popover-long-content",
    frame: "popover",
    viewport: { width: 1440, height: 800 },
    close: true,
    footer: false,
    ruled: false,
  },
  {
    name: "reference popover with a footer",
    story: "features-demo-guidance--open",
    frame: "popover",
    viewport: { width: 1440, height: 800 },
    close: true,
    footer: true,
    ruled: false,
    // A small control with `--space-2` above and below it.
    bar: 48,
    scrolls: false,
  },
  {
    name: "docked companion panel",
    story: "patterns-application-shell--assistant-panel-scrolling",
    frame: "companion",
    viewport: { width: 1440, height: 500 },
    close: true,
    footer: true,
    ruled: true,
  },
  {
    name: "companion sheet",
    story: "patterns-application-shell--assistant-panel-scrolling",
    frame: "end",
    viewport: { width: 1280, height: 500 },
    close: true,
    footer: true,
    ruled: false,
  },
  {
    name: "reference pane",
    story: "features-applications-review-an-assigned-application--writing",
    frame: "pane",
    viewport: { width: 1440, height: 1000 },
    close: false,
    footer: false,
    ruled: true,
    index: 0,
    bar: 56,
  },
  {
    name: "work pane",
    story: "features-applications-review-an-assigned-application--writing",
    frame: "pane",
    viewport: { width: 1440, height: 1000 },
    close: false,
    footer: true,
    ruled: true,
    index: 1,
    bar: 56,
  },
  {
    name: "work pane with a close control",
    story: "features-applications-manage-reviews--recording-assessment",
    frame: "pane",
    viewport: { width: 1440, height: 1000 },
    close: true,
    footer: true,
    ruled: true,
    index: 1,
    bar: 56,
    scrolls: false,
  },
];

const measure = (root: Locator) =>
  root.evaluate((node) => {
    const px = (value: string) => Number.parseFloat(value);

    const header = node.querySelector<HTMLElement>("[data-dialog-header]")!;
    const body = node.querySelector<HTMLElement>("[data-frame-body]")!;
    const title = header.querySelector<HTMLElement>("h2") ?? header.firstElementChild!;
    const headerStyle = getComputedStyle(header);
    const bodyStyle = getComputedStyle(body);
    const closeIcon = header.querySelector<SVGElement>("button:last-of-type svg");
    // The actions end where the outermost control in the footer ends, such as a button or the
    // box a person asks in.
    const buttons = [
      ...node.querySelectorAll<HTMLElement>("[data-frame-footer] [data-dialog-footer] *"),
    ];
    const scrollers = [node, ...node.querySelectorAll<HTMLElement>("*")].filter(
      (element) =>
        !element.matches("textarea, input, select") &&
        /auto|scroll/.test(getComputedStyle(element).overflowY),
    );
    return {
      titleStart: title.getBoundingClientRect().left,
      bodyContentStart:
        body.getBoundingClientRect().left +
        px(bodyStyle.borderLeftWidth) +
        px(bodyStyle.paddingLeft),
      gutterEnd: header.getBoundingClientRect().right - px(headerStyle.paddingRight),
      bodyContentEnd: body.getBoundingClientRect().right - px(bodyStyle.paddingRight),
      closeEnd: closeIcon?.getBoundingClientRect().right ?? null,
      footerActionsEnd: buttons.length
        ? Math.max(...buttons.map((button) => button.getBoundingClientRect().right))
        : null,
      scrollers: scrollers.length,
      scrollerIsBody: scrollers[0] === body,
      scrollable: body.scrollHeight > body.clientHeight,
      headerRule: px(headerStyle.borderBottomWidth),
      headerHeight: header.getBoundingClientRect().height,
    };
  });

const edgeLine = (header: Locator) =>
  header.evaluate((node) => getComputedStyle(node).getPropertyValue("--edge-line").trim());

const isTransparent = (color: string) => color === "transparent" || /\b0\)$|\/ 0\)$/.test(color);

const desktopOnly = (testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Sets its own viewport sizes.");
};

const open = async (page: Page, { story, viewport }: Placement) => {
  await page.setViewportSize(viewport);
  await page.goto(`/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
};

test.describe("titled surfaces share one frame", () => {
  for (const placement of placements) {
    test(`${placement.name} aligns its parts to one gutter and scrolls only its body`, async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo);
      await open(page, placement);
      const root = page.locator(`[data-frame="${placement.frame}"]`).nth(placement.index ?? 0);
      await expect(root).toBeVisible();
      const frame = await measure(root);

      expect(frame.titleStart).toBeCloseTo(frame.bodyContentStart, 1);
      if (placement.close) {
        expect(frame.closeEnd).toBeCloseTo(frame.gutterEnd, 1);
      }
      if (placement.footer) {
        expect(frame.footerActionsEnd).toBeCloseTo(frame.bodyContentEnd, 1);
      }
      expect(frame.scrollers).toBe(1);
      expect(frame.scrollerIsBody).toBe(true);
      expect(frame.headerRule > 0).toBe(placement.ruled);
      if (placement.bar) {
        expect(frame.headerHeight).toBeCloseTo(placement.bar, 0);
      }
    });

    // Some stories have too little content to scroll, so only the anatomy applies.
    if (placement.scrolls === false) {
      continue;
    }
    test(`${placement.name} shows its header edge only once the body scrolls`, async ({
      page,
    }, testInfo) => {
      desktopOnly(testInfo);
      await open(page, placement);
      const root = page.locator(`[data-frame="${placement.frame}"]`).nth(placement.index ?? 0);
      const header = root.locator("[data-dialog-header]").first();
      const body = root.locator("[data-frame-body]").first();

      expect((await measure(root)).scrollable).toBe(true);
      await body.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect.poll(async () => isTransparent(await edgeLine(header))).toBe(true);
      await body.evaluate((node) => {
        node.scrollTop = 120;
      });
      await expect.poll(async () => isTransparent(await edgeLine(header))).toBe(false);
    });
  }
});

test("an idle work pane has no task actions", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    "/iframe.html?id=features-applications-manage-reviews--assessment-details&viewMode=story",
  );
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  await expect(page.locator('[data-frame="pane"] [data-dialog-header]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Close review task" })).toHaveCount(0);
});
