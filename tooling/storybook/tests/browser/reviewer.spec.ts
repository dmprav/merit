import { test, expect, checkPage } from "@merit/test-support/browser";

const reviewer = "features-applications-participate-in-review";
const manager = "features-applications-reviewer-participation";

test("reviewer invitation and management reference comparisons", async ({ page }, testInfo) => {
  for (const id of [
    "features-applications-manage-reviews--changed-application",
    `${manager}--awaiting-acceptance`,
    "features-workspace-accept-invitation--owner",
    `${reviewer}--invitation`,
    "patterns-confirmation-dialog--open",
    `${manager}--end-access`,
  ]) {
    await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:product`);
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath(`${id}.png`), fullPage: true });
  }
});

test("reviewer writing and established recommendation editor share a readable frame @cross-browser", async ({
  page,
}, testInfo) => {
  for (const id of [
    "features-applications-recommendation--resume-editing",
    `${reviewer}--writing`,
  ]) {
    await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:product`);
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath(`${id}.png`), fullPage: true });
  }
  const material = (await page
    .getByRole("region", { name: "Application material", exact: true })
    .boundingBox())!;
  const assessment = (await page
    .getByRole("region", { name: "Your assessment", exact: true })
    .boundingBox())!;
  if (testInfo.project.use.isMobile) {
    expect(assessment.y).toBeGreaterThan(material.y + material.height);
  } else {
    // Panes sit side by side; the assessment pane's title bar aligns with the reference toolbar.
    expect(assessment.x).toBeGreaterThan(material.x + material.width);
    expect(assessment.y).toBeLessThan(material.y);
    await expect(
      page.getByRole("button", { name: "Submit assessment", exact: true }),
    ).toBeInViewport();
  }
  const position = page.getByRole("button", { name: "Funding position" });
  await position.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Fund", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(position).toContainText("Fund with conditions");
  await expect(position).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("reviewer-position-focus.png"),
    fullPage: true,
  });
});

test("reviewer recovery and long content remain readable @cross-browser", async ({
  page,
}, testInfo) => {
  for (const state of [
    "invitation",
    "long-evidence",
    "submitted",
    "amendment",
    "expired-invitation",
    "access-ended",
    "revoked-while-writing",
  ]) {
    await page.goto(`/iframe.html?id=${reviewer}--${state}&viewMode=story`);
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath(`reviewer-${state}.png`), fullPage: true });
  }
});

test("reviewer dialogs fit the screen and return keyboard focus @cross-browser", async ({
  page,
}, testInfo) => {
  // Reviewer participation actions open from the page's More actions menu.
  for (const [id, title, trigger, menuItem] of [
    [
      `${reviewer}--report-conflict`,
      "Report a possible conflict",
      "More actions",
      "Report a possible conflict",
    ],
    [`${reviewer}--withdraw`, "Withdraw from this review?", "More actions", "Withdraw from review"],
    [`${manager}--invite`, "Invite reviewer", "Invite reviewer", null],
    [`${manager}--conflict-resolution`, "Clear conflict", "Clear conflict", null],
    [`${manager}--end-access`, "End Sam Morgan’s access?", "End access", null],
  ] as const) {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeInViewport();
    await checkPage(page);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await page.screenshot({ path: testInfo.outputPath(`${id}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    const opener = page.getByRole("button", { name: trigger, exact: true });
    await expect(opener).toBeFocused();
    if (testInfo.project.use.isMobile) {
      await opener.tap();
    } else {
      await opener.click();
    }
    if (menuItem) {
      await page.getByRole("menuitem", { name: menuItem, exact: true }).click();
    }
    await expect(dialog).toBeVisible();
  }
});

for (const useSaved of [false, true]) {
  test(`reviewer explicitly resolves conflicting drafts using ${useSaved ? "saved" : "local"} text @cross-browser`, async ({
    page,
  }) => {
    await page.goto(`/iframe.html?id=${reviewer}--concurrent-changes&viewMode=story`);
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const reasoning = page.getByRole("textbox", { name: "Overall reasoning" });
    const local = await reasoning.inputValue();
    await checkPage(page);
    await page
      .getByRole("button", {
        name: useSaved ? "Use the saved version" : "Continue with my text",
        exact: true,
      })
      .click();
    await expect(reasoning).toHaveValue(
      useSaved
        ? "Saved on my other device: confirm the attendance evidence before recommending funding."
        : local,
    );
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit assessment", exact: true }),
    ).toBeEnabled();
  });
}

test("reviewer save failure can recover without losing text @cross-browser", async ({ page }) => {
  await page.goto(`/iframe.html?id=${reviewer}--save-failure&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  const reasoning = page.getByRole("textbox", { name: "Overall reasoning" });
  const value = await reasoning.inputValue();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await expect(reasoning).toHaveValue(value);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("reviewer validation feedback stays with the writing task @cross-browser", async ({
  page,
}) => {
  await page.goto(`/iframe.html?id=${reviewer}--validation&viewMode=story`);
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
  const toAssessment = page.getByRole("link", { name: "Go to your assessment", exact: true });
  if (await toAssessment.isVisible()) {
    await toAssessment.click();
  }
  await expect(page.getByRole("alert")).toBeInViewport();
  await checkPage(page);
});

test("reviewer writing supports enlarged text and display preferences @cross-browser", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  for (const id of [
    `${reviewer}--saving`,
    `${manager}--sending`,
    `${manager}--expired-invitation`,
    `${manager}--notification-failure`,
  ]) {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await checkPage(page);
    await page.screenshot({
      path: testInfo.outputPath(`${id}-large-contrast.png`),
      fullPage: true,
    });
    if (id.endsWith("--saving")) {
      await expect(
        page.getByRole("button", { name: "Submit assessment", exact: true }),
      ).toBeDisabled();
    }
    if (id.endsWith("--sending")) {
      await expect(
        page.getByRole("dialog").getByRole("button", { name: "Invite reviewer", exact: true }),
      ).toBeDisabled();
    }
  }
});
