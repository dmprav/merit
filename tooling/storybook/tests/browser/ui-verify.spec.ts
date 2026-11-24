import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Browser } from "@playwright/test";

import { collectBrowserErrors, type BrowserError } from "@merit/test-support/browser";

import {
  checkKeyboardFocusTraversal,
  formatMarkdownReport,
  openTargetOnPage,
  runTargetsInBrowser,
  summarizeResults,
  uiVerifyResultsSchema,
  verifyLoadedPage,
  writeProofArtifacts,
} from "../../ui-verify.ts";

const withTempDir = async <T>(run: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "merit-ui-verify-browser-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const runFixture = async (browser: Browser, outDir: string, name: string, html: string) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errors: BrowserError[] = [];
  collectBrowserErrors(context, errors);
  try {
    const page = await context.newPage();
    await page.setContent(html);
    const screenshotPath = join(outDir, "screenshots", `${name}-desktop.png`);
    return await verifyLoadedPage({
      page,
      browserErrors: errors,
      kind: "story",
      target: name,
      name,
      url: `fixture://${name}`,
      viewport: "desktop",
      fullPage: true,
      screenshotPath,
    });
  } finally {
    await context.close();
  }
};

test.describe("live Chromium checker failure detection", () => {
  test("passes accessible pages with visible focus rings and pages with zero interactive stops", async ({
    browser,
  }) => {
    await withTempDir(async (outDir) => {
      const accessible = await runFixture(
        browser,
        outDir,
        "accessible-ok",
        `<!doctype html><html lang="en"><head><title>Accessible</title><style>
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
        browser,
        outDir,
        "static-zero-stops",
        `<!doctype html><html lang="en"><head><title>Notice</title><style>
          body { background: #fff; color: #111; }
        </style></head><body><main><h1>Static notice</h1><p>No controls here.</p></main></body></html>`,
      );
      expect(staticOnly.passed).toBe(true);
      expect(staticOnly.focus.stopsChecked).toBe(0);
      expect(staticOnly.focus.failures).toEqual([]);
    });
  });

  test("catches an intentional axe WCAG violation and reports it in results.json and report.md", async ({
    browser,
  }) => {
    await withTempDir(async (outDir) => {
      const badAxe = await runFixture(
        browser,
        outDir,
        "intentional-axe-violation",
        `<!doctype html><html lang="en"><head><title>Broken a11y</title><style>
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

      const markdown = formatMarkdownReport(savedJson);
      expect(markdown).toContain("**Status:** FAIL");
      expect(markdown).toContain("intentional-axe-violation");
      expect(markdown).toContain("**Axe");
    });
  });

  test("catches an intentional missing-focus-ring interactive element and reports it in results.json and report.md", async ({
    browser,
  }) => {
    await withTempDir(async (outDir) => {
      const missingFocus = await runFixture(
        browser,
        outDir,
        "intentional-missing-focus",
        `<!doctype html><html lang="en"><head><title>Missing focus</title><style>
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
      const overflowing = await runFixture(
        browser,
        outDir,
        "intentional-overflow-and-error",
        `<!doctype html><html lang="en"><head><title>Overflow</title><style>
          body { background: #fff; color: #111; }
          .wide { width: 3000px; height: 20px; }
        </style></head><body><main><h1>Overflow</h1><div class="wide">Too wide</div></main>
        <script>console.error("Synthetic runtime failure");</script></body></html>`,
      );

      expect(overflowing.passed).toBe(false);
      expect(overflowing.hasHorizontalOverflow).toBe(true);
      expect(overflowing.browserErrors).toEqual([
        expect.objectContaining({ type: "console", message: "Synthetic runtime failure" }),
      ]);
    });
  });

  test("catches zero-sized focusable elements in checkKeyboardFocusTraversal", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.setContent(
        `<!doctype html><html lang="en"><head><title>Zero sized focus</title><style>
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
    } finally {
      await context.close();
    }
  });

  test("blurs non-tabbable active elements like <main tabindex='-1'> so header and sidebar controls are traversed", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.setContent(
        `<!doctype html><html lang="en"><head><title>Shell focus order</title><style>
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
    } finally {
      await context.close();
    }
  });

  test("resets focus on non-dialog pages with an autofocused later button so earlier missing focus rings are caught", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.setContent(
        `<!doctype html><html lang="en"><head><title>Autofocused later button</title><style>
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
    } finally {
      await context.close();
    }
  });

  test("settles focus-blur CSS transitions on a single focus-trapped control (HTML and SVG)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const htmlPage = await context.newPage();
      await htmlPage.setContent(
        `<!doctype html><html lang="en"><head><title>Trapped transitioning button</title><style>
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
        `<!doctype html><html lang="en"><head><title>Trapped transitioning SVG</title><style>
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
    } finally {
      await context.close();
    }
  });

  test("waits on data-story-ready='true' after DOM mount, fails with data-story-error, and never attaches a stale screenshot on failure", async ({
    browser,
  }) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      const storyId = reqUrl.searchParams.get("id");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (storyId === "delayed-ready--story") {
        res.end(
          `<!doctype html><html lang="en"><body>
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
          `<!doctype html><html lang="en"><body>
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
      res.end("<!doctype html><html><body></body></html>");
    });

    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", () => resolveListen()),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test HTTP server.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
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
          ],
          baseUrl,
          viewports: ["desktop"],
          screenshotsDir,
          log: () => undefined,
        });

        expect(targetResults).toHaveLength(1);
        expect(targetResults[0]?.passed).toBe(false);
        expect(targetResults[0]?.error).toContain("play() assertion failed: contrast");
        expect(targetResults[0]?.screenshot).toBeNull();
        expect(existsSync(stalePath)).toBe(false);
      });
    } finally {
      await context.close();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });
});
