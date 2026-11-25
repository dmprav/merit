import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Browser, BrowserContext } from "@playwright/test";

import { collectBrowserErrors, expect, test, type BrowserError } from "@merit/test-support/browser";

import {
  checkKeyboardFocusTraversal,
  openTargetOnPage,
  runTargetsInBrowser,
  summarizeResults,
  uiVerifyResultsSchema,
  verifyLoadedPage,
  writeProofArtifacts,
} from "../../ui-verify.ts";

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
      kind: "story",
      target: name,
      name,
      url: `fixture://${name}`,
      viewport: "desktop",
      fullPage: true,
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

      // Raw context isolates Chromium's automatic "Failed to load resource: 404/500" console
      // errors when verifying HTTP error status rejection.
      const httpErrorContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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

        const blankShellPage = await httpErrorContext.newPage();
        await expect(
          openTargetOnPage(
            blankShellPage,
            { kind: "route", route: "/blank-shell", name: "/blank-shell", fullPage: true },
            baseUrl,
            { routeReadyTimeoutMs: 250 },
          ),
        ).rejects.toThrow(/did not render non-empty content/);
      } finally {
        await httpErrorContext.close();
      }

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
          ],
          baseUrl,
          viewports: ["desktop"],
          screenshotsDir,
          routeReadyTimeoutMs: 250,
          log: () => undefined,
        });

        expect(targetResults).toHaveLength(3);
        expect(targetResults[0]?.passed).toBe(false);
        expect(targetResults[0]?.error).toContain("play() assertion failed: contrast");
        expect(targetResults[0]?.screenshot).toBeNull();
        expect(existsSync(stalePath)).toBe(false);

        expect(targetResults[1]?.passed).toBe(false);
        expect(targetResults[1]?.error).toContain("HTTP 404");
        expect(targetResults[1]?.screenshot).toBeNull();

        expect(targetResults[2]?.passed).toBe(false);
        expect(targetResults[2]?.error).toContain("did not render non-empty content");
        expect(targetResults[2]?.screenshot).toBeNull();
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
        kind: "story",
        target: "exact-cap",
        name: "exact-cap",
        url: "fixture://exact-cap",
        viewport: "desktop",
        fullPage: true,
        screenshotPath: null,
        maxTabStops: 3,
      });
      expect(exactResult.passed).toBe(true);
      expect(exactResult.focus.stopsChecked).toBe(3);
      expect(exactResult.focus.reachedCap).toBe(false);
      expect(exactResult.focus.incompleteReason).toBeUndefined();

      const cappedPage = await context.newPage();
      await cappedPage.setContent(buildButtonsHtml(4));
      const cappedResult = await verifyLoadedPage({
        page: cappedPage,
        browserErrors: [],
        kind: "story",
        target: "exceeds-cap",
        name: "exceeds-cap",
        url: "fixture://exceeds-cap",
        viewport: "desktop",
        fullPage: true,
        screenshotPath: null,
        maxTabStops: 3,
      });
      expect(cappedResult.passed).toBe(false);
      expect(cappedResult.focus.stopsChecked).toBe(3);
      expect(cappedResult.focus.reachedCap).toBe(true);
      expect(cappedResult.focus.incompleteReason).toBe("Incomplete: >3 stops");
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
      expect(savedJson.targets[1]?.focus.reachedCap).toBe(true);
      expect(savedJson.targets[1]?.focus.incompleteReason).toBe("Incomplete: >3 stops");

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
    expect(traversed.incompleteReason).toBeUndefined();
    expect(traversed.failures).toEqual([]);

    const crossOrigin = await context.newPage();
    await crossOrigin.setContent(pageWithFrame('sandbox="allow-scripts"'));
    await crossOrigin.frameLocator("iframe").getByRole("button", { name: "Inner two" }).waitFor();
    const opaque = await verifyLoadedPage({
      page: crossOrigin,
      browserErrors: [],
      kind: "story",
      target: "cross-origin-frame",
      name: "cross-origin-frame",
      url: "fixture://cross-origin-frame",
      viewport: "desktop",
      fullPage: true,
      screenshotPath: null,
    });
    expect(opaque.focus.reachedCap).toBe(false);
    expect(opaque.focus.incompleteReason).toContain("cross-origin frame");
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
    expect(focus.incompleteReason).toBe(
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

      expect(existsSync(join(outDir, "screenshots", "overflow-after-capture-desktop.png"))).toBe(
        true,
      );
      expect(result.hasHorizontalOverflow).toBe(true);
      expect(result.passed).toBe(false);
    });
  });
});
