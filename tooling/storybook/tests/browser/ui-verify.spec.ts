import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Browser, BrowserContext } from "@playwright/test";

import { collectBrowserErrors, expect, test, type BrowserError } from "@merit/test-support/browser";

import { openTargetOnPage, runTargetsInBrowser, verifyLoadedPage } from "../../ui-verify/audit.ts";
import { checkKeyboardFocusTraversal } from "../../ui-verify/focus/check.ts";
import { writeProofArtifacts } from "../../ui-verify/report.ts";
import {
  describeIncompleteTraversal,
  summarizeResults,
  uiVerifyResultsSchema,
} from "../../ui-verify/results.ts";

const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1">';

type CreateContext = (options?: Parameters<Browser["newContext"]>[0]) => Promise<BrowserContext>;

const withTempDir = async <T>(run: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "merit-ui-verify-browser-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const runFixture = async (
  createContext: CreateContext,
  outDir: string,
  name: string,
  html: string,
  { closeContext = false }: { closeContext?: boolean } = {},
) => {
  const context = await createContext({ viewport: { width: 1280, height: 800 } });
  const errors: BrowserError[] = [];
  collectBrowserErrors(context, errors);
  try {
    const page = await context.newPage();
    await page.setContent(html);
    const screenshotPath = join(outDir, "screenshots", `${name}-desktop.png`);
    return await verifyLoadedPage({
      page,
      browserErrors: errors,
      target: { kind: "story", id: name, name, fullPage: true },
      url: `fixture://${name}`,
      viewport: "desktop",
      screenshotPath,
    });
  } finally {
    if (closeContext) {
      await context.close();
    }
  }
};

test.describe("live Chromium checker failure detection", () => {
  test("passes accessible pages with visible focus rings and pages with zero interactive stops", async ({
    newContext,
  }) => {
    await withTempDir(async (outDir) => {
      const accessible = await runFixture(
        newContext,
        outDir,
        "accessible-ok",
        `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Accessible</title><style>
          body { background: #fff; color: #111; font-family: sans-serif; }
          button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
          button:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
        </style></head><body><main><h1>Ready</h1><button type="button">Save</button></main></body></html>`,
      );
      expect(accessible.passed).toBe(true);
      expect(accessible.axeViolations).toEqual([]);
      expect(accessible.focus.stopsChecked).toBe(1);
      expect(accessible.focus.failures).toEqual([]);
      expect(accessible.screenshot && existsSync(accessible.screenshot)).toBe(true);

      const staticOnly = await runFixture(
        newContext,
        outDir,
        "static-zero-stops",
        `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Notice</title><style>
          body { background: #fff; color: #111; }
        </style></head><body><main><h1>Static notice</h1><p>No controls here.</p></main></body></html>`,
      );
      expect(staticOnly.passed).toBe(true);
      expect(staticOnly.focus.stopsChecked).toBe(0);
      expect(staticOnly.focus.failures).toEqual([]);
    });
  });

  test("catches an intentional axe WCAG violation and reports it in results.json and report.md", async ({
    newContext,
  }) => {
    await withTempDir(async (outDir) => {
      const badAxe = await runFixture(
        newContext,
        outDir,
        "intentional-axe-violation",
        `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Broken a11y</title><style>
          body { background: #fff; color: #eee; }
          button { width: 40px; height: 28px; }
          button:focus-visible { outline: 2px solid #000; }
        </style></head><body><main><h1>Low contrast</h1><button type="button"></button></main></body></html>`,
      );

      expect(badAxe.passed).toBe(false);
      expect(badAxe.axeViolations.length).toBeGreaterThan(0);
      expect(
        badAxe.axeViolations.some((v) => v.id === "button-name" || v.id === "color-contrast"),
      ).toBe(true);

      const summary = summarizeResults({
        mode: "storybook",
        updated: false,
        outDir,
        targets: [badAxe],
      });
      expect(summary.passed).toBe(false);
      expect(summary.summary.axeViolations).toBeGreaterThan(0);

      writeProofArtifacts(outDir, summary);
      const savedJson = uiVerifyResultsSchema.parse(
        JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")),
      );
      expect(savedJson.passed).toBe(false);
      expect(savedJson.summary.axeViolations).toBeGreaterThan(0);

      const markdown = readFileSync(join(outDir, "report.md"), "utf8");
      expect(markdown).toContain("**Status:** FAIL");
      expect(markdown).toContain("intentional-axe-violation");
      expect(markdown).toContain("**Axe");
      expect(markdown).toMatch(/`(?:button-name|color-contrast)`/);
    });
  });

  test("catches an intentional missing-focus-ring interactive element and reports it in results.json and report.md", async ({
    newContext,
  }) => {
    await withTempDir(async (outDir) => {
      const missingFocus = await runFixture(
        newContext,
        outDir,
        "intentional-missing-focus",
        `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Missing focus</title><style>
          body { background: #fff; color: #111; }
          button {
            padding: 8px 14px;
            background: #fff;
            color: #111;
            border: 1px solid #333;
            outline: none;
            box-shadow: none;
          }
          button:focus, button:focus-visible {
            outline: none;
            box-shadow: none;
          }
        </style></head><body><main><h1>Focus bug</h1><button type="button">Invisible focus</button></main></body></html>`,
      );

      expect(missingFocus.passed).toBe(false);
      expect(missingFocus.axeViolations).toEqual([]);
      expect(missingFocus.focus.stopsChecked).toBe(1);
      expect(missingFocus.focus.failures).toHaveLength(1);
      expect(missingFocus.focus.failures[0]?.element).toContain("Invisible focus");

      const summary = summarizeResults({
        mode: "storybook",
        updated: false,
        outDir,
        targets: [missingFocus],
      });
      expect(summary.passed).toBe(false);
      expect(summary.summary.focusFailures).toBe(1);

      writeProofArtifacts(outDir, summary);
      const savedJson = uiVerifyResultsSchema.parse(
        JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")),
      );
      expect(savedJson.passed).toBe(false);
      expect(savedJson.summary.focusFailures).toBe(1);

      const markdown = readFileSync(join(outDir, "report.md"), "utf8");
      expect(markdown).toContain("**Status:** FAIL");
      expect(markdown).toContain("Invisible focus");
      expect(markdown).toContain("no visible focus indicator");
    });
  });

  test("catches horizontal overflow and console errors", async ({ browser }) => {
    await withTempDir(async (outDir) => {
      // Raw browser.newContext isolates the intentional console.error probe from the shared
      // browserErrors teardown assertion.
      const overflowing = await runFixture(
        (options) => browser.newContext(options),
        outDir,
        "intentional-overflow-and-error",
        `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Overflow</title><style>
          body { background: #fff; color: #111; }
          .wide { width: 3000px; height: 20px; }
        </style></head><body><main><h1>Overflow</h1><div class="wide">Too wide</div></main>
        <script>console.error("Synthetic runtime failure");</script></body></html>`,
        { closeContext: true },
      );

      expect(overflowing.passed).toBe(false);
      expect(overflowing.hasHorizontalOverflow).toBe(true);
      expect(overflowing.browserErrors).toEqual([
        expect.objectContaining({ type: "console", message: "Synthetic runtime failure" }),
      ]);
    });
  });

  test("catches zero-sized focusable elements in checkKeyboardFocusTraversal", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Zero sized focus</title><style>
        body { background: #fff; color: #111; }
        .zero {
          width: 0;
          height: 0;
          padding: 0;
          border: 0;
          overflow: hidden;
        }
        .zero:focus-visible { outline: 2px solid #0f62fe; }
      </style></head><body><main><h1>Zero size</h1><button class="zero" type="button">Collapsed control</button></main></body></html>`,
    );
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(1);
    expect(focus.failures).toHaveLength(1);
    expect(focus.failures[0]?.element).toContain("Collapsed control");
    expect(focus.failures[0]?.reasons.some((reason) => reason.includes("zero-sized"))).toBe(true);
    expect(focus.failures[0]?.boundingBox).toEqual({ width: 0, height: 0 });
  });

  test("fails focus stops that cannot paint because the control or an ancestor has opacity 0", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Transparent focus</title><style>
        body { background: #fff; color: #111; }
        button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
        button:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
        .transparent, .transparent-panel { opacity: 0; }
      </style></head><body><main><h1>Transparent focus</h1>
        <button type="button">Visible control</button>
        <button class="transparent" type="button">Transparent control</button>
        <div class="transparent-panel"><div><button type="button">Inside transparent panel</button></div></div>
      </main></body></html>`,
    );
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(3);
    expect(focus.failures.map((failure) => failure.element)).toEqual([
      'button "Transparent control"',
      'button "Inside transparent panel"',
    ]);
    for (const failure of focus.failures) {
      expect(failure.reasons).toEqual(["not painted: the control or an ancestor has opacity 0"]);
    }
  });

  test("counts only painted focus cues on the same relative across snapshots", async ({ page }) => {
    await page.setContent(`
      <style>
        button { outline: none; display: inline-flex; }
        .transparent, .reveal { opacity: 0; }
        .ring, button:focus-visible .indicator { outline: 2px solid blue; }
        button:focus-visible .reveal { opacity: 1; }
        .ring { order: 1; }
      </style>
      <button>Hidden ring<span class="transparent"><span class="indicator">A</span></span></button>
      <button>Visible ring<span class="indicator">B</span></button>
      <button>Revealed ring<span class="reveal ring">C</span></button>
      <button data-reorder aria-label="Reordered"><span>A</span><span class="ring">B</span></button>
      <button data-reorder aria-label="Reordered with cue"><span class="indicator">A</span><span class="ring">B</span></button>
      <script>
        for (const button of document.querySelectorAll('[data-reorder]')) {
          const ring = button.lastElementChild;
          button.addEventListener('focus', () => button.prepend(ring));
          button.addEventListener('blur', () => button.append(ring));
        }
      </script>`);
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(5);
    expect(focus.failures.map(({ element, reasons }) => ({ element, reasons }))).toEqual([
      {
        element: 'button "Hidden ringA"',
        reasons: ["no visible focus indicator change compared to unfocused state"],
      },
      {
        element: 'button "Reordered"',
        reasons: ["no visible focus indicator change compared to unfocused state"],
      },
    ]);
  });

  test("checks the paint revealed by a visibility change", async ({ page }) => {
    await page.setContent(`
      <style>
        button { outline: none; }
        .indicator { display: inline-block; opacity: 0; }
        button:focus-visible .indicator { opacity: 1; }
        .empty-fill { background: red; width: 0; height: 0; }
        .empty-line { width: 10px; height: 10px; text-decoration: underline transparent; }
        button:focus-visible .line { text-decoration: underline solid blue 3px; }
        button:focus-visible .clear-line { text-decoration-color: transparent; }
        .spread { box-shadow: 0 0 0 4px blue; }
        .offset { box-shadow: 3px 3px blue; }
        .atomic { display: inline-block; }
      </style>
      <button>Empty fill<span class="indicator empty-fill"></span></button>
      <button>Empty underline<span class="indicator empty-line"></span></button>
      <button>Real underline<span class="indicator line">marked</span></button>
      <button>Clear underline<span class="indicator line clear-line">marked</span></button>
      <button>Nested underline<span class="indicator line"><em>marked</em></span></button>
      <button>Atomic inline<span class="indicator line"><em class="atomic">marked</em></span></button>
      <button>Spread shadow<span class="indicator spread"></span></button>
      <button>Offset shadow<span class="indicator offset"></span></button>`);
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(8);
    expect(focus.failures.map(({ element }) => element)).toEqual([
      'button "Empty fill"',
      'button "Empty underline"',
      'button "Clear underlinemarked"',
      'button "Atomic inlinemarked"',
      'button "Offset shadow"',
    ]);
  });

  test("compares a focus-trapped list option with its neighbour's focus, not a blur", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });

    const html = (
      barRule: string,
    ) => `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>List</title><style>
        body { background: #fff; color: #111; }
        [role="option"] { display: block; padding: 6px 10px; outline: none; background: #fff; color: #111; }
        ${barRule}
      </style></head><body>
        <div role="listbox" aria-label="Choices" tabindex="-1">
          <div role="option" tabindex="-1" id="a">Alpha</div>
          <div role="option" tabindex="-1" id="b">Beta</div>
        </div>
        <script>
          const list = document.querySelector('[role="listbox"]');
          const options = [...list.querySelectorAll('[role="option"]')];
          options[1].focus();
          // Like an open list: Tab and blur leave focus where it was, and arrows move it.
          list.addEventListener("focusout", (event) => {
            if (!list.contains(event.relatedTarget)) {
              queueMicrotask(() => event.target.focus());
            }
          });
          list.addEventListener("keydown", (event) => {
            const index = options.indexOf(document.activeElement);
            if (event.key === "ArrowDown") options[Math.min(index + 1, 1)].focus();
            if (event.key === "ArrowUp") options[Math.max(index - 1, 0)].focus();
            if (event.key === "Tab") event.preventDefault();
          });
        </script>
      </body></html>`;

    const withBar = await context.newPage();
    await withBar.setContent(
      html('[role="option"]:focus { background: #edf0f7; box-shadow: inset 3px 0 #455779; }'),
    );
    const passing = await checkKeyboardFocusTraversal(withBar);
    expect(passing.stopsChecked).toBe(1);
    expect(passing.failures).toEqual([]);

    const withoutBar = await context.newPage();
    await withoutBar.setContent(html(""));
    const failing = await checkKeyboardFocusTraversal(withoutBar);
    expect(failing.failures).toEqual([
      expect.objectContaining({
        element: 'div[role=option] "Beta"',
        reasons: ["no visible focus indicator change compared to unfocused state"],
      }),
    ]);
  });

  test("re-checks the paint of a dialog's first stop when focus cycles back to it", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Fading first stop</title><style>
        body { background: #fff; color: #111; }
        button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
        button:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
        .faded { opacity: 0; }
      </style></head><body>
        <div role="dialog" aria-modal="true" aria-label="Confirm">
          <button id="first" type="button">First action</button>
          <button id="second" type="button">Second action</button>
        </div>
        <script>
          const first = document.getElementById("first");
          const second = document.getElementById("second");
          first.focus();
          // Focusing the second control fades the first one out before the trap returns to it.
          second.addEventListener("focus", () => first.classList.add("faded"));
          document.addEventListener("keydown", (event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              (document.activeElement === first ? second : first).focus();
            }
          });
        </script>
      </body></html>`,
    );
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(2);
    expect(focus.failures).toEqual([
      expect.objectContaining({
        element: 'button "First action"',
        reasons: ["not painted: the control or an ancestor has opacity 0"],
      }),
    ]);
  });

  test("blurs non-tabbable active elements like <main tabindex='-1'> so header and sidebar controls are traversed", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Shell focus order</title><style>
        body { background: #fff; color: #111; }
        .skip { position: fixed; top: -5rem; left: 1rem; padding: 8px; background: #fff; color: #111; }
        .skip:focus { top: 1rem; outline: 2px solid #0f62fe; }
        nav a { display: inline-block; padding: 8px; color: #111; outline: none; box-shadow: none; }
        nav a:focus, nav a:focus-visible { outline: none; box-shadow: none; }
        main button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
        main button:focus-visible { outline: 2px solid #0f62fe; }
      </style></head><body>
        <a class="skip" href="#main">Skip to content</a>
        <nav aria-label="Workspace"><a href="#rounds">Sidebar Rounds</a></nav>
        <main id="main" tabindex="-1"><h1>Workspace</h1><button type="button">Create round</button></main>
        <script>document.getElementById("main").focus();</script>
      </body></html>`,
    );
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(3);
    expect(focus.failures).toHaveLength(1);
    expect(focus.failures[0]?.element).toContain("Sidebar Rounds");
  });

  test("resets focus on non-dialog pages with an autofocused later button so earlier missing focus rings are caught", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Autofocused later button</title><style>
        body { background: #fff; color: #111; }
        .broken {
          padding: 8px 14px;
          background: #fff;
          color: #111;
          border: 1px solid #333;
          outline: none;
          box-shadow: none;
        }
        .broken:focus, .broken:focus-visible {
          outline: none;
          box-shadow: none;
        }
        .ok {
          padding: 8px 14px;
          background: #fff;
          color: #111;
          border: 1px solid #333;
        }
        .ok:focus-visible {
          outline: 2px solid #0f62fe;
          outline-offset: 2px;
        }
      </style></head><body><main>
        <h1>Non-dialog autofocus</h1>
        <button class="broken" type="button">Earlier broken button</button>
        <button id="later" class="ok" type="button" autofocus>Later focused button</button>
        <script>document.getElementById("later").focus();</script>
      </main></body></html>`,
    );
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(2);
    expect(focus.failures).toHaveLength(1);
    expect(focus.failures[0]?.element).toContain("Earlier broken button");
  });

  test("waits for the first rendering update so a pending autofocus cannot refocus a later button after the reset", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // A render-blocking script holds the first rendering update, where Chromium applies pending
    // `autofocus`, until the checker has started. The finite animation keeps a checker that resets
    // focus before that update waiting until the autofocus lands, as a slow CI frame can. The
    // explicit focus() stands in for the focus the reset clears: with nothing focused, the checker
    // skips the reset and this page cannot tell whether it waits for the update.
    let releaseRenderBlock = () => {};

    const renderBlockReleased = new Promise<void>((resolve) => {
      releaseRenderBlock = resolve;
    });
    await page.route("http://ui-verify.test/**", async (route) => {
      if (route.request().url().endsWith("/render-block.js")) {
        await renderBlockReleased;
        await route.fulfill({ contentType: "text/javascript", body: "" });
        return;
      }
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Pending autofocus</title>
          <script>
            // The checker has started once it waits for a rendering update or resets focus.
            const requestFrame = window.requestAnimationFrame.bind(window);
            window.requestAnimationFrame = (callback) => {
              window.__traversalStarted = true;
              return requestFrame(callback);
            };
            document.addEventListener("focusin", (event) => {
              if (event.target === document.body) window.__traversalStarted = true;
            });
          </script>
          <script async blocking="render" src="/render-block.js"></script><style>
          body { background: #fff; color: #111; }
          @keyframes settle { from { opacity: 0.99; } to { opacity: 1; } }
          h1 { animation: settle 400ms linear; }
          button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
          .broken, .broken:focus, .broken:focus-visible { outline: none; box-shadow: none; }
          .ok:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
        </style></head><body><main>
          <h1>Pending autofocus</h1>
          <button class="broken" type="button">Earlier broken button</button>
          <button id="later" class="ok" type="button" autofocus>Later focused button</button>
          <script>document.getElementById("later").focus();</script>
        </main></body></html>`,
      });
    });
    await page.goto("http://ui-verify.test/", { waitUntil: "domcontentloaded" });

    const traversal = checkKeyboardFocusTraversal(page);
    // Interval polling runs while rendering is blocked; animation frame polling would not.
    await page.waitForFunction(() => "__traversalStarted" in window, undefined, { polling: 20 });
    releaseRenderBlock();
    const focus = await traversal;
    expect(focus.traversal).toEqual({ complete: true });
    expect(focus.stopsChecked).toBe(2);
    expect(focus.failures.map((failure) => failure.element)).toEqual([
      'button "Earlier broken button"',
    ]);
  });

  test("settles focus-blur CSS transitions on a single focus-trapped control (HTML and SVG)", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const htmlPage = await context.newPage();
    await htmlPage.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Trapped transitioning button</title><style>
        body { background: #fff; color: #111; }
        button {
          padding: 8px 14px;
          background: #fff;
          color: #111;
          border: 1px solid #333;
          outline: none;
          box-shadow: 0 0 0 0 rgba(15, 98, 254, 0);
          transition: box-shadow 220ms linear;
        }
        button:focus, button:focus-visible {
          box-shadow: 0 0 0 3px rgb(15, 98, 254);
        }
      </style></head><body>
        <dialog open aria-label="Single action">
          <button id="only" type="button">Acknowledge</button>
        </dialog>
        <script>
          const only = document.getElementById("only");
          only.focus();
          document.addEventListener("keydown", (event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              only.focus();
            }
          });
        </script>
      </body></html>`,
    );
    const htmlFocus = await checkKeyboardFocusTraversal(htmlPage);
    expect(htmlFocus.stopsChecked).toBe(1);
    expect(htmlFocus.failures).toEqual([]);

    const svgPage = await context.newPage();
    await svgPage.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Trapped transitioning SVG</title><style>
        body { background: #fff; color: #111; }
        svg {
          outline: 2px solid transparent;
          transition: outline-color 220ms linear;
        }
        svg:focus, svg:focus-visible {
          outline: 2px solid rgb(15, 98, 254);
        }
      </style></head><body>
        <dialog open aria-label="Graphic control">
          <svg id="svg-btn" tabindex="0" role="button" aria-label="Close graphic" width="32" height="32" viewBox="0 0 32 32">
            <rect width="32" height="32" fill="#222"></rect>
          </svg>
        </dialog>
        <script>
          const svgBtn = document.getElementById("svg-btn");
          svgBtn.focus();
          document.addEventListener("keydown", (event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              svgBtn.focus();
            }
          });
        </script>
      </body></html>`,
    );
    const svgFocus = await checkKeyboardFocusTraversal(svgPage);
    expect(svgFocus.stopsChecked).toBe(1);
    expect(svgFocus.failures).toEqual([]);
  });

  test("waits on data-story-ready='true' after DOM mount, fails with data-story-error or HTTP >=400, and never attaches a stale screenshot on failure", async ({
    browser,
    newContext,
  }) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      if (reqUrl.pathname === "/missing-route") {
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><html lang="en"><head>${VIEWPORT_META}</head><body><main><h1>Not found</h1></main></body></html>`,
        );
        return;
      }
      if (reqUrl.pathname === "/server-error") {
        res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><html lang="en"><head>${VIEWPORT_META}</head><body><main><h1>Error</h1></main></body></html>`,
        );
        return;
      }
      if (reqUrl.pathname === "/protected-route") {
        res.writeHead(302, { location: "/sign-in" });
        res.end();
        return;
      }
      if (reqUrl.pathname === "/sign-in") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Sign in</title></head><body><main><h1>Sign in</h1></main></body></html>`,
        );
        return;
      }
      if (reqUrl.pathname === "/blank-shell") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Blank shell</title></head><body><div id="root"></div></body></html>`,
        );
        return;
      }
      const storyId = reqUrl.searchParams.get("id");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (storyId === "delayed-ready--story") {
        res.end(
          `<!doctype html><html lang="en"><head>${VIEWPORT_META}</head><body>
            <div id="storybook-root"><div>Initial mount before play</div></div>
            <script>
              setTimeout(() => {
                const root = document.getElementById("storybook-root");
                root.innerHTML = '<button type="button">Play finished</button>';
                root.setAttribute("data-story-ready", "true");
              }, 120);
            </script>
          </body></html>`,
        );
        return;
      }
      if (storyId === "errored--story") {
        res.end(
          `<!doctype html><html lang="en"><head>${VIEWPORT_META}</head><body>
            <div id="storybook-root"><div>Mounted before error</div></div>
            <script>
              setTimeout(() => {
                const root = document.getElementById("storybook-root");
                root.setAttribute("data-story-error", "play() assertion failed: contrast");
                root.setAttribute("data-story-ready", "error");
              }, 40);
            </script>
          </body></html>`,
        );
        return;
      }
      res.end(`<!doctype html><html><head>${VIEWPORT_META}</head><body></body></html>`);
    });

    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", () => resolveListen()),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test HTTP server.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const context = await newContext({ viewport: { width: 1280, height: 800 } });
      const readyPage = await context.newPage();
      await openTargetOnPage(
        readyPage,
        {
          kind: "story",
          id: "delayed-ready--story",
          name: "delayed-ready--story",
          fullPage: true,
        },
        baseUrl,
      );
      expect(await readyPage.locator("#storybook-root").getAttribute("data-story-ready")).toBe(
        "true",
      );
      expect(await readyPage.locator("button").textContent()).toBe("Play finished");

      const errorPage = await context.newPage();
      await expect(
        openTargetOnPage(
          errorPage,
          {
            kind: "story",
            id: "errored--story",
            name: "errored--story",
            fullPage: true,
          },
          baseUrl,
        ),
      ).rejects.toThrow(/play\(\) assertion failed: contrast/);

      const redirectedPage = await context.newPage();
      expect(
        await openTargetOnPage(
          redirectedPage,
          { kind: "route", route: "/protected-route", name: "/protected-route", fullPage: true },
          baseUrl,
        ),
      ).toBe(`${baseUrl}/sign-in`);

      const blankShellPage = await context.newPage();
      await expect(
        openTargetOnPage(
          blankShellPage,
          { kind: "route", route: "/blank-shell", name: "/blank-shell", fullPage: true },
          baseUrl,
          { routeReadyTimeoutMs: 250 },
        ),
      ).rejects.toThrow(/did not render non-empty content/);

      // Chromium logs "Failed to load resource" for HTTP error documents, so collect this
      // context's errors here and allow only those diagnostics.
      const httpErrorContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const httpErrors: BrowserError[] = [];
      collectBrowserErrors(httpErrorContext, httpErrors);
      try {
        const notFoundPage = await httpErrorContext.newPage();
        await expect(
          openTargetOnPage(
            notFoundPage,
            { kind: "route", route: "/missing-route", name: "/missing-route", fullPage: true },
            baseUrl,
          ),
        ).rejects.toThrow(/HTTP 404/);

        const serverErrorPage = await httpErrorContext.newPage();
        await expect(
          openTargetOnPage(
            serverErrorPage,
            { kind: "route", route: "/server-error", name: "/server-error", fullPage: true },
            baseUrl,
          ),
        ).rejects.toThrow(/HTTP 500/);
      } finally {
        await httpErrorContext.close();
      }
      expect(httpErrors.map(({ type, message }) => ({ type, message }))).toEqual([
        {
          type: "console",
          message: "Failed to load resource: the server responded with a status of 404 (Not Found)",
        },
        {
          type: "console",
          message:
            "Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
        },
      ]);

      await withTempDir(async (outDir) => {
        const screenshotsDir = join(outDir, "screenshots");
        mkdirSync(screenshotsDir, { recursive: true });
        const stalePath = join(screenshotsDir, "errored--story-desktop.png");
        writeFileSync(stalePath, "stale-png-bytes", "utf8");

        const targetResults = await runTargetsInBrowser({
          browser,
          targets: [
            {
              kind: "story",
              id: "errored--story",
              name: "errored--story",
              fullPage: true,
            },
            {
              kind: "route",
              route: "/missing-route",
              name: "/missing-route",
              fullPage: true,
            },
            {
              kind: "route",
              route: "/blank-shell",
              name: "/blank-shell",
              fullPage: true,
            },
            {
              kind: "route",
              route: "/protected-route",
              name: "/protected-route",
              fullPage: true,
            },
          ],
          baseUrl,
          viewports: ["desktop"],
          screenshotsDir,
          routeReadyTimeoutMs: 250,
          log: () => undefined,
        });

        expect(targetResults).toHaveLength(4);
        expect(targetResults[0]?.passed).toBe(false);
        expect(targetResults[0]).toMatchObject({
          status: "errored",
          error: expect.stringContaining("play() assertion failed: contrast"),
        });
        expect(targetResults[0]?.screenshot).toBeNull();
        expect(existsSync(stalePath)).toBe(false);

        expect(targetResults[1]?.passed).toBe(false);
        expect(targetResults[1]).toMatchObject({
          status: "errored",
          error: expect.stringContaining("HTTP 404"),
        });
        expect(targetResults[1]?.screenshot).toBeNull();

        expect(targetResults[2]?.passed).toBe(false);
        expect(targetResults[2]).toMatchObject({
          status: "errored",
          error: expect.stringContaining("did not render non-empty content"),
        });
        expect(targetResults[2]?.screenshot).toBeNull();

        // A redirected route keeps the URL it requested beside the page it audited.
        expect(targetResults[1]?.requestedUrl).toBe(`${baseUrl}/missing-route`);
        expect(targetResults[3]?.requestedUrl).toBe(`${baseUrl}/protected-route`);
        expect(targetResults[3]?.url).toBe(`${baseUrl}/sign-in`);
      });
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  test("passes when controls equal maxStops and fails with incomplete traversal details when controls exceed maxStops", async ({
    newContext,
  }) => {
    const buildButtonsHtml = (count: number) => {
      const buttons = Array.from(
        { length: count },
        (_, index) => `<button type="button">Action ${index + 1}</button>`,
      ).join("");
      return `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Button count ${count}</title><style>
        body { background: #fff; color: #111; font-family: sans-serif; }
        button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; margin: 4px; }
        button:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
      </style></head><body><main><h1>Controls (${count})</h1>${buttons}</main></body></html>`;
    };

    await withTempDir(async (outDir) => {
      const context = await newContext({ viewport: { width: 1280, height: 800 } });

      const exactPage = await context.newPage();
      await exactPage.setContent(buildButtonsHtml(3));
      const exactResult = await verifyLoadedPage({
        page: exactPage,
        browserErrors: [],
        target: { kind: "story", id: "exact-cap", name: "exact-cap", fullPage: true },
        url: "fixture://exact-cap",
        viewport: "desktop",
        screenshotPath: null,
        maxTabStops: 3,
      });
      expect(exactResult.passed).toBe(true);
      expect(exactResult.focus.stopsChecked).toBe(3);
      expect(exactResult.focus.traversal).toEqual({ complete: true });

      const cappedPage = await context.newPage();
      await cappedPage.setContent(buildButtonsHtml(4));
      const cappedResult = await verifyLoadedPage({
        page: cappedPage,
        browserErrors: [],
        target: { kind: "story", id: "exceeds-cap", name: "exceeds-cap", fullPage: true },
        url: "fixture://exceeds-cap",
        viewport: "desktop",
        screenshotPath: null,
        maxTabStops: 3,
      });
      expect(cappedResult.passed).toBe(false);
      expect(cappedResult.focus.stopsChecked).toBe(3);
      expect(cappedResult.focus.traversal).toEqual({ complete: false, reason: "cap" });
      expect(describeIncompleteTraversal(cappedResult.focus)).toBe("Incomplete: >3 stops");
      expect(cappedResult.focus.failures).toEqual([]);

      const summary = summarizeResults({
        mode: "storybook",
        updated: false,
        outDir,
        targets: [exactResult, cappedResult],
      });
      expect(summary.passed).toBe(false);
      expect(summary.summary.passed).toBe(1);
      expect(summary.summary.failed).toBe(1);
      expect(summary.summary.focusFailures).toBe(1);

      writeProofArtifacts(outDir, summary);
      const savedJson = uiVerifyResultsSchema.parse(
        JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")),
      );
      expect(savedJson.passed).toBe(false);
      expect(savedJson.targets[1]?.passed).toBe(false);
      expect(savedJson.targets[1]).toMatchObject({
        status: "audited",
        focus: { traversal: { complete: false, reason: "cap" } },
      });

      const markdown = readFileSync(join(outDir, "report.md"), "utf8");
      expect(markdown).toContain("**Status:** FAIL");
      expect(markdown).toContain("Incomplete: >3 stops");
      expect(markdown).toContain("**Focus traversal incomplete:**");
    });
  });

  test("compares each stop with nothing focused so a neighbor's focus rule is not its indicator", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Neighbor focus</title><style>
        body { background: #fff; color: #111; }
        button { padding: 8px 14px; background: #fff; color: #111; border: 2px solid #555; outline: none; }
        .second:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
        button:has(+ button:focus-visible) { border-color: #b00020; }
      </style></head><body><main><h1>Neighbor focus</h1>
        <button class="first" type="button">First</button><button class="second" type="button">Second</button>
      </main></body></html>`,
    );
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(2);
    expect(focus.failures).toHaveLength(1);
    expect(focus.failures[0]?.element).toContain("First");
    expect(focus.failures[0]?.reasons).toEqual([
      "no visible focus indicator change compared to unfocused state",
    ]);
  });

  test("fails a stop that leaves the document on blur instead of passing it on its focused styles alone", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Removed on blur</title><style>
        body { background: #fff; color: #111; }
        button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
        button:focus-visible, .outlined { outline: 2px solid #0f62fe; outline-offset: 2px; }
      </style></head><body><main><h1>Removed on blur</h1>
        <button type="button">First</button>
        <button class="outlined" type="button">Removed on blur</button>
        <button type="button">Last</button>
      </main><script>
        document.querySelector(".outlined").addEventListener("blur", (event) => event.currentTarget.remove());
      </script></body></html>`,
    );
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(3);
    expect(focus.failures).toHaveLength(1);
    expect(focus.failures[0]?.element).toContain("Removed on blur");
    expect(focus.failures[0]?.reasons).toEqual([
      "no unfocused baseline: the control left the document or kept taking focus back, so its focus indicator could not be compared",
    ]);
  });

  test("traverses controls inside same-origin frames and reports cross-origin frames as incomplete", async ({
    newContext,
  }) => {
    const frameDocument = `<!doctype html><html lang='en'><head><title>Inner</title><style>
      body { background: #fff; color: #111; }
      button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
      button:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
    </style></head><body><button type='button'>Inner one</button><button type='button'>Inner two</button></body></html>`;

    const pageWithFrame = (sandbox: string) =>
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Framed controls</title><style>
        body { background: #fff; color: #111; }
      </style></head><body><main><h1>Framed controls</h1>
        <iframe title="Embedded controls" ${sandbox} srcdoc="${frameDocument}"></iframe>
      </main></body></html>`;

    const context = await newContext({ viewport: { width: 1280, height: 800 } });

    const sameOrigin = await context.newPage();
    await sameOrigin.setContent(pageWithFrame(""));
    await sameOrigin.frameLocator("iframe").getByRole("button", { name: "Inner two" }).waitFor();
    const traversed = await checkKeyboardFocusTraversal(sameOrigin);
    expect(traversed.stopsChecked).toBe(2);
    expect(traversed.traversal).toEqual({ complete: true });
    expect(traversed.failures).toEqual([]);

    const crossOrigin = await context.newPage();
    await crossOrigin.setContent(pageWithFrame('sandbox="allow-scripts"'));
    await crossOrigin.frameLocator("iframe").getByRole("button", { name: "Inner two" }).waitFor();
    const opaque = await verifyLoadedPage({
      page: crossOrigin,
      browserErrors: [],
      target: {
        kind: "story",
        id: "cross-origin-frame",
        name: "cross-origin-frame",
        fullPage: true,
      },
      url: "fixture://cross-origin-frame",
      viewport: "desktop",
      screenshotPath: null,
    });
    expect(opaque.focus.traversal).toEqual({ complete: false, reason: "opaqueFrame" });
    expect(describeIncompleteTraversal(opaque.focus)).toContain("cross-origin frame");
    expect(opaque.passed).toBe(false);
  });

  test("reports traversal as incomplete when the document loses its focus tracker", async ({
    newContext,
  }) => {
    const context = await newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    // Deleting the tracker stands in for a focus handler whose navigation commits a new document
    // before the next stop is read; that document has no tracker and its controls go unchecked.
    await page.setContent(
      `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Replaced document</title><style>
        body { background: #fff; color: #111; }
        button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
        button:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
      </style></head><body><main><h1>Replaced document</h1>
        <button type="button">First control</button>
        <button type="button" id="leave">Leave page</button>
        <button type="button">Never checked</button>
      </main>
      <script>
        document.getElementById("leave").addEventListener("focus", () => {
          delete window.__meritFocusTracker;
        });
      </script></body></html>`,
    );
    const focus = await checkKeyboardFocusTraversal(page);
    expect(focus.stopsChecked).toBe(1);
    expect(focus.traversal).toEqual({ complete: false, reason: "trackerLost" });
    expect(describeIncompleteTraversal(focus)).toBe(
      "Incomplete: the page navigated to a new document during focus traversal",
    );
  });

  test("measures the page state the screenshot shows after animations are fast-forwarded", async ({
    newContext,
  }) => {
    await withTempDir(async (outDir) => {
      const result = await runFixture(
        newContext,
        outDir,
        "overflow-after-capture",
        `<!doctype html><html lang="en"><head>${VIEWPORT_META}<title>Overflow after capture</title><style>
          body { background: #fff; color: #111; }
          h1 { animation: nudge 10s linear paused; }
          @keyframes nudge { from { transform: translateX(0); } to { transform: translateX(1px); } }
          .wide { width: 3000px; height: 20px; }
        </style></head><body><main><h1>Overflow after capture</h1></main>
        <script>
          document.querySelector("h1").addEventListener("animationend", () => {
            const wide = document.createElement("div");
            wide.className = "wide";
            document.querySelector("main").append(wide);
          });
        </script></body></html>`,
      );

      const screenshot = readFileSync(
        join(outDir, "screenshots", "overflow-after-capture-desktop.png"),
      );
      // A PNG stores its width in the IHDR chunk right after the 8-byte signature and chunk header.
      const screenshotWidth = screenshot.readUInt32BE(16);
      expect(result.hasHorizontalOverflow).toBe(true);
      expect(screenshotWidth).toBe(result.scrollWidth);
      expect(screenshotWidth).toBeGreaterThan(result.innerWidth);
      expect(result.passed).toBe(false);
    });
  });
});

test("lets the CLI finish its Ctrl+C cleanup before the process exits", async () => {
  await withTempDir(async (dir) => {
    const script = join(dir, "sigint.mjs");
    const auditModuleUrl = new URL("../../ui-verify/audit.ts", import.meta.url).href;
    // The child stands in for the CLI: its SIGINT handler needs time to stop servers.
    writeFileSync(
      script,
      `import { launchVerificationBrowser } from ${JSON.stringify(auditModuleUrl)};
      const browser = await launchVerificationBrowser();
      process.on("SIGINT", () => {
        setTimeout(async () => {
          await browser.close();
          process.stdout.write("cleanup finished\\n");
          process.exit(130);
        }, 1500);
      });
      process.stdout.write("ready\\n");`,
    );
    const { NODE_OPTIONS: _nodeOptions, PWTEST_UNDER_TEST: _underTest, ...env } = process.env;
    const child = spawn(process.execPath, [script], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.includes("ready")) {
        child.kill("SIGINT");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    const exitCode = await new Promise<number | null>((resolve) => child.on("exit", resolve));
    expect(output).toContain("cleanup finished");
    expect(exitCode).toBe(130);
  });
});
