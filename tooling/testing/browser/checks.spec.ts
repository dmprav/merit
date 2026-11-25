import { auditPage, checkPage, expect, test } from "./checks";

test(
  "page checks wait for finite animations before measuring contrast",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.setContent(`
      <html lang="en">
        <head><title>Settled page</title><style>
          body { background: white; color: black; }
          main { animation: appear 2s linear; }
          @keyframes appear { from { opacity: 0.1; } to { opacity: 1; } }
        </style></head>
        <body><main><h1>Ready</h1></main></body>
      </html>
    `);

    await checkPage(page);

    expect(await page.getByRole("main").evaluate((node) => getComputedStyle(node).opacity)).toBe(
      "1",
    );
  },
);

test(
  "auditPage waits for native open dialogs and alertdialogs to become visible while ignoring closed dialogs",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.setContent(`
      <html lang="en">
        <head><title>Native dialog</title><style>
          body { background: white; color: black; }
          dialog[open], [role="alertdialog"] { visibility: hidden; opacity: 0; background: white; color: black; }
          dialog[open].visible, [role="alertdialog"].visible { visibility: visible; opacity: 1; }
        </style></head>
        <body>
          <main><h1>Page</h1></main>
          <dialog aria-label="Closed notice"><p>Closed dialog</p></dialog>
          <dialog open aria-label="Notice"><p>Dialog ready</p></dialog>
          <div role="alertdialog" aria-label="Status alert"><p>Alert ready</p></div>
          <script>
            setTimeout(() => {
              document.querySelector("dialog[open]")?.classList.add("visible");
              document.querySelector('[role="alertdialog"]')?.classList.add("visible");
            }, 150);
          </script>
        </body>
      </html>
    `);

    const result = await auditPage(page);

    expect(result.dialogsVisible).toBe(true);
    expect(result.axeViolations).toEqual([]);
  },
);

test(
  "auditPage reports dialogsVisible as false for a persistently invisible alertdialog",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.setContent(`
      <html lang="en">
        <head><title>Invisible alertdialog</title><style>
          body { background: white; color: black; }
          [role="alertdialog"] { visibility: hidden; opacity: 0; background: white; color: black; }
        </style></head>
        <body>
          <main><h1>Page</h1></main>
          <div role="alertdialog" aria-label="Stuck alert"><p>Never shown</p></div>
        </body>
      </html>
    `);

    const result = await auditPage(page, 300);

    expect(result.dialogsVisible).toBe(false);
  },
);

test(
  "auditPage and checkPage ignore intentionally closed or inert custom dialogs",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.setContent(`
      <html lang="en">
        <head><title>Closed custom dialogs</title><style>
          body { background: white; color: black; }
          .closed-by-css { display: none; }
        </style></head>
        <body>
          <main><h1>Page</h1></main>
          <div role="dialog" hidden aria-label="Hidden dialog"><p>Closed</p></div>
          <div role="dialog" aria-hidden="true" style="display: none;" aria-label="Aria-hidden dialog"><p>Closed</p></div>
          <div role="dialog" inert style="display: none;" aria-label="Inert dialog"><p>Closed</p></div>
          <div role="alertdialog" data-state="closed" style="display: none;" aria-label="Closed state dialog"><p>Closed</p></div>
          <div role="dialog" class="closed-by-css" aria-label="CSS-closed dialog"><p>Closed</p></div>
          <div style="display: none;"><div role="dialog" aria-label="Inside closed panel"><p>Closed</p></div></div>
        </body>
      </html>
    `);

    const result = await auditPage(page);

    expect(result.dialogsVisible).toBe(true);
    expect(result.axeViolations).toEqual([]);
    await checkPage(page);
  },
);

test(
  "auditPage finds invisible open dialogs inside open shadow roots",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.setContent(`
      <html lang="en">
        <head><title>Shadow dialog</title><style>body { background: white; color: black; }</style></head>
        <body>
          <main><h1>Page</h1><div id="host"></div></main>
          <script>
            document.getElementById("host").attachShadow({ mode: "open" }).innerHTML =
              '<dialog open aria-label="Shadow notice" style="visibility: hidden"><p>Hidden</p></dialog>';
          </script>
        </body>
      </html>
    `);

    const result = await auditPage(page, 300);

    expect(result.dialogsVisible).toBe(false);
  },
);

test(
  "auditPage waits for shadow-root transition markers that clear without an animation",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.setContent(`
      <html lang="en">
        <head><title>Shadow marker</title><style>body { background: white; color: black; }</style></head>
        <body>
          <main><h1>Page</h1><div id="host"></div></main>
          <script>
            const root = document.getElementById("host").attachShadow({ mode: "open" });
            root.innerHTML = '<p data-entering="">Entering</p>';
            setTimeout(() => root.querySelector("p").removeAttribute("data-entering"), 300);
          </script>
        </body>
      </html>
    `);

    const result = await auditPage(page);

    expect(result.enteringOrExitingCount).toBe(0);
  },
);

test(
  "auditPage ignores paused finite animations without hanging",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.setContent(`
      <html lang="en">
        <head><title>Paused animation</title><style>
          body { background: white; color: black; }
          .paused {
            animation: slide 10s linear;
            animation-play-state: paused;
          }
          @keyframes slide { from { transform: translateX(0); } to { transform: translateX(10px); } }
        </style></head>
        <body><main><h1 class="paused">Paused</h1></main></body>
      </html>
    `);

    const startedAt = Date.now();
    const result = await auditPage(page);

    expect(Date.now() - startedAt).toBeLessThan(4_000);
    expect(result.bodyVisible).toBe(true);
    expect(result.axeViolations).toEqual([]);
  },
);

for (const surface of ["page", "popup", "separate context"] as const) {
  test(
    `collects console and uncaught errors from a ${surface}`,
    { tag: "@cross-browser" },
    async ({ page, newContext, browserErrors }) => {
      let target = page;
      if (surface === "popup") {
        const popup = page.waitForEvent("popup");
        await page.evaluate(() => window.open("about:blank"));
        target = await popup;
      } else if (surface === "separate context") {
        target = await (await newContext()).newPage();
      }

      await target.evaluate(() => {
        console.error("Expected console probe");
        setTimeout(() => {
          throw new Error("Expected uncaught probe");
        }, 0);
      });

      await expect.poll(() => browserErrors.length).toBe(2);
      await target.close();

      expect(browserErrors.splice(0)).toEqual([
        { type: "console", message: "Expected console probe", url: "about:blank" },
        { type: "pageerror", message: "Expected uncaught probe", url: "about:blank" },
      ]);
    },
  );
}

test(
  "fails at teardown when a browser error has not been asserted",
  { tag: "@cross-browser" },
  async ({ page, browserErrors }) => {
    await page.evaluate(() => console.error("Unconsumed console probe"));
    await expect.poll(() => browserErrors.length).toBe(1);
    // Mark only teardown as an expected failure: broken collection must still fail this test.
    test.fail(true, "The shared fixture must reject an unconsumed error at teardown");
  },
);
