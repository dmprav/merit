import { test, expect, checkPage } from "@merit/test-support/browser";

test("future award amendment keeps evidence and consequences visible through confirmation", async ({
  page,
}, testInfo) => {
  await page.goto("/iframe.html?id=patterns-page-composition--award-amendment&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  await expect(
    page.getByRole("heading", { name: "Approve a venue change", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Quote from Riverside Community Rooms, received 8 November"),
  ).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Effect of approval" })).toContainText(
    "€8,000",
  );

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("award-amendment.png"), fullPage: true });
  await page.getByRole("button", { name: "Review approval", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Approve the award amendment?" });

  await expect(dialog.getByRole("button", { name: "Keep reviewing" })).toBeFocused();
  await expect(dialog).toContainText("commits an additional €4,000");

  await checkPage(page);
  await dialog.getByRole("button", { name: "Approve additional €4,000" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Example amendment recorded");
  await expect(page.getByRole("button", { name: "Review example again" })).toBeFocused();
});

for (const story of ["compact", "wide", "long-context", "long-content", "failure"]) {
  test(
    `form dialog composition: ${story}`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.goto(`/iframe.html?id=patterns-form-dialog--${story}&viewMode=story`);
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      const dialog = page.getByRole("dialog", { name: "Write a note" });
      const body = dialog.getByRole("group", { name: "Note" });
      const close = dialog.getByRole("button", { name: "Close editor" });
      const save = dialog.getByRole("button", { name: "Save note" });
      await expect(dialog.getByRole("form")).toHaveCount(1);

      for (const fontSize of ["100%", "200%"]) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = value;
        }, fontSize);
        await checkPage(page);
        if (story === "long-context" && fontSize === "200%" && testInfo.project.use.isMobile) {
          await close.focus();
          await expect(close).toBeInViewport({ ratio: 1 });
          const title = dialog.getByRole("textbox", { name: "Title" });
          await title.focus();
          await expect(title).toBeInViewport({ ratio: 1 });
          await title.fill("Keep my draft readable");
          await expect(title).toBeInViewport({ ratio: 1 });
          await save.focus();
          await expect(save).toBeInViewport({ ratio: 1 });
          await expect(title).toHaveValue("Keep my draft readable");
          await page.screenshot({ path: testInfo.outputPath(`form-${story}-${fontSize}.png`) });
          continue;
        }
        await expect(close).toBeInViewport({ ratio: 1 });
        await expect(save).toBeInViewport({ ratio: 1 });
        // Wait for a stable dialog before comparing control positions across scrolling.
        await close.click({ trial: true });
        const closeBounds = await close.boundingBox();
        const saveBounds = await save.boundingBox();
        await body.focus();
        await page.keyboard.press("End");
        if (story === "long-content") {
          await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        }
        expect(await close.boundingBox()).toEqual(closeBounds);
        expect(await save.boundingBox()).toEqual(saveBounds);
        if (story === "failure") {
          await expect(dialog.getByRole("alert")).toBeInViewport({ ratio: 1 });
        }
        await page.screenshot({ path: testInfo.outputPath(`form-${story}-${fontSize}.png`) });
      }
      await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
      await body.focus();
      await expect(body).toHaveCSS("outline-style", "solid");
      await checkPage(page);
    },
  );
}

for (const application of [false, true]) {
  test(
    `creation dialog retains, discards, and commits ${application ? "an application" : "a round"} draft`,
    { tag: "@cross-browser" },
    async ({ page }) => {
      await page.goto(
        `/iframe.html?id=features-${application ? "applications" : "funding-rounds"}-create--default&viewMode=story`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      const dialog = page.getByRole("dialog");
      const title = dialog.getByRole("textbox", {
        name: application ? "Project title" : "Round name",
      });
      const createLabel = application ? "Add application" : "Create funding round";
      const create = page.getByRole("button", { name: createLabel, exact: true });
      const resume = page.getByRole("button", {
        name: application ? "Resume application" : "Resume funding round",
      });
      await title.fill("Community programme");
      await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
      await expect(dialog).toHaveCount(0);
      await expect(resume).toBeFocused();
      await resume.press("Enter");
      await expect(title).toBeFocused();
      await expect(title).toHaveValue("Community programme");
      await dialog.getByRole("button", { name: "Discard draft" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(create).toBeFocused();
      await create.press("Enter");
      await expect(title).toHaveValue("");
      await dialog.getByRole("button", { name: createLabel, exact: true }).click();
      await expect(title).toBeFocused();
      await expect(title).toHaveAttribute("aria-invalid", "true");
      await title.fill("New community programme");
      await checkPage(page);
      await page.keyboard.press("Control+Enter");
      await expect(dialog).toHaveCount(0);
      await expect(create).toBeFocused();
      await expect(page.getByRole("heading", { name: "New community programme" })).toBeVisible();
    },
  );
}

for (const theme of ["product", "site"]) {
  test(
    `floating dialogs keep their header visible while scrolling in ${theme}`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.goto(
        `/iframe.html?id=components-dialog--floating-long-content&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      const dialog = page.getByRole("dialog");
      const heading = dialog.getByRole("heading", { level: 2 });
      const close = dialog.getByRole("button", { name: "Close dialog" });
      const body = dialog.getByRole("region");

      for (const fontSize of ["100%", "200%"]) {
        await page.evaluate((value) => {
          document.documentElement.style.fontSize = value;
        }, fontSize);
        await checkPage(page);
        await expect(close).toBeInViewport({ ratio: 1 });
        const headingBounds = await heading.boundingBox();
        const closeBounds = await close.boundingBox();
        await body.focus();
        await page.keyboard.press("End");
        await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        expect(await heading.boundingBox()).toEqual(headingBounds);
        expect(await close.boundingBox()).toEqual(closeBounds);
        await expect
          .poll(() =>
            body.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop),
          )
          .toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath(`floating-${theme}-${fontSize}.png`) });
      }

      await close.click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open dialog" })).toBeFocused();
    },
  );

  test(
    `reading dialogs keep their title and actions visible while scrolling in ${theme}`,
    { tag: "@cross-browser" },
    async ({ page }, testInfo) => {
      await page.setViewportSize({ ...page.viewportSize()!, height: 720 });
      await page.goto(
        `/iframe.html?id=components-dialog--long-content&viewMode=story&globals=theme:${theme}`,
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

      const dialog = page.getByRole("dialog");
      const title = dialog.getByRole("heading", { level: 2 });
      const close = dialog.getByRole("button", { name: "Close dialog" });
      const body = dialog.getByRole("region", { name: "Supporting evidence guidance" });
      const done = dialog.getByRole("button", { name: "Done" });

      await checkPage(page);
      await expect(close).toBeInViewport({ ratio: 1 });
      await expect(done).toBeInViewport({ ratio: 1 });
      const titleBounds = await title.boundingBox();
      const actionBounds = await done.boundingBox();
      expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);

      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(body).toBeFocused();
      await page.keyboard.press("End");

      await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await expect(body.getByRole("heading", { name: "Record open questions" })).toBeInViewport();
      await expect(title).toBeInViewport({ ratio: 1 });
      expect(await title.boundingBox()).toEqual(titleBounds);
      expect(await done.boundingBox()).toEqual(actionBounds);
      await checkPage(page);
      await page.screenshot({ path: testInfo.outputPath(`dialog-reading-${theme}.png`) });

      await page.keyboard.press("Tab");
      await expect(done).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open dialog" })).toBeFocused();
    },
  );
}

test("confirmation dialogs focus cancellation, contain focus and show pending and failure states", async ({
  page,
}, testInfo) => {
  await page.goto("/iframe.html?id=patterns-confirmation-dialog--open&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

  const dialog = page.getByRole("dialog", { name: "Revoke invitation?" });
  const cancel = dialog.getByRole("button", { name: "Keep invitation" });
  const confirm = dialog.getByRole("button", { name: "Revoke invitation", exact: true });

  await expect(cancel).toBeFocused();
  await expect(dialog).toHaveAccessibleDescription(
    /alex@example.org will no longer be able to join/,
  );

  await page.keyboard.press("Tab");

  await expect(confirm).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("confirmation-open.png") });
  await page.keyboard.press("Escape");

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review revocation" })).toBeFocused();

  await page.goto("/iframe.html?id=patterns-confirmation-dialog--pending&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  await expect(dialog.getByRole("button", { name: "Revoking invitation…" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(cancel).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeDisabled();

  await page.keyboard.press("Escape");

  await expect(dialog).toBeVisible();

  await checkPage(page);

  await page.goto("/iframe.html?id=patterns-confirmation-dialog--failure&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  await expect(dialog.getByRole("alert")).toContainText("could not be revoked");
  await expect(confirm).toBeEnabled();

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("confirmation-failure.png") });

  await page.goto("/iframe.html?id=patterns-confirmation-dialog--long-content&viewMode=story");

  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  await expect(confirm).toBeInViewport();

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("confirmation-long-content.png") });
});

test(
  "confirmation retry shows progress, recovers from failure and restores focus after success",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto("/iframe.html?id=patterns-confirmation-dialog--retry&viewMode=story");

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const dialog = page.getByRole("dialog", { name: "Revoke invitation?" });
    const confirm = dialog.getByRole("button", { name: "Revoke invitation", exact: true });
    const pending = dialog.getByRole("button", { name: "Revoking invitation…" });
    await confirm.click();

    await expect(pending).toHaveAttribute("aria-disabled", "true");

    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toContainText("could not be revoked");
    await expect(confirm).toBeFocused();

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("confirmation-retry.png") });
    await confirm.click();

    await expect(pending).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Invitation revoked.");

    const trigger = page.getByRole("button", { name: "Review revocation" });

    await expect(trigger).toBeFocused();

    await trigger.click();

    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Keep invitation" })).toBeFocused();
  },
);
