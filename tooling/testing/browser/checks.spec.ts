import { test, expect, checkPage } from "./checks";

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
