import { test, expect, checkPage } from "@merit/test-support/browser";

test(
  "review selection focuses the assessment and returns to the matching overview button",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-applications-application-detail--changed-evidence&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const workspace = page.getByRole("complementary", { name: "Application workspace" });

    for (const reviewer of [/Sam Morgan/, /Jules Patel/]) {
      const trigger = workspace.getByRole("button", { name: reviewer });
      await trigger.focus();
      await trigger.press("Enter");

      await expect(
        page
          .getByRole("group", { name: "Reference", exact: true })
          .getByRole("heading", { name: "Assessment", exact: true }),
      ).toBeFocused();
      await expect(
        page
          .getByRole("group", { name: "Reference", exact: true })
          .getByRole("article", { name: reviewer }),
      ).toBeVisible();
      await expect(workspace.getByRole("heading", { name: "Application details" })).toBeVisible();
      await page.getByRole("button", { name: "Back to assessments", exact: true }).press("Enter");

      await expect(trigger).toBeFocused();
      await expect(trigger).toBeInViewport();
    }

    await checkPage(page);
  },
);

test(
  "intake sections preserve separate drafts and restore editing focus",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-applications-manage-intake--ready-to-mark&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const editSummary = page.getByRole("button", { name: "Edit summary", exact: true });
    await editSummary.focus();
    await editSummary.press("Enter");
    await page
      .getByRole("textbox", { name: "Staff summary", exact: true })
      .fill("Unfinished staff summary");
    await page.getByRole("button", { name: "Edit applicant submission", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Staff summary", exact: true })).toHaveCount(0);
    const response = page
      .getByRole("textbox", { name: "Applicant’s response", exact: true })
      .first();
    await response.fill("Unfinished applicant response");
    await page.getByRole("button", { name: "Close", exact: true }).click();

    const resumeSubmission = page.getByRole("button", {
      name: "Continue editing applicant submission",
      exact: true,
    });
    await expect(resumeSubmission).toBeFocused();
    const resumeSummary = page.getByRole("button", {
      name: "Continue editing summary",
      exact: true,
    });
    await resumeSummary.click();
    await expect(page.getByRole("textbox", { name: "Staff summary", exact: true })).toHaveValue(
      "Unfinished staff summary",
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await expect(resumeSummary).toBeFocused();
    await resumeSummary.press("Enter");
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(editSummary).toBeFocused();
    await resumeSubmission.click();

    await expect(response).toHaveValue("Unfinished applicant response");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Edit applicant submission", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("region", { name: "Applicant submission", exact: true }),
    ).toContainText("Unfinished applicant response");
    await checkPage(page);
  },
);

test(
  "assessment details and history stay in the pane and restore their originating controls",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-applications-manage-reviews--assessment-history&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const assessment = page.getByRole("article", { name: "Assessment by Sam Morgan" });
    const latestDetails = assessment.getByRole("button", { name: "Review details", exact: true });
    await latestDetails.focus();
    await latestDetails.press("Enter");
    const details = page.getByRole("region", { name: "Review details", exact: true });

    await expect(
      details
        .getByRole("term")
        .filter({ hasText: /^Submission$/ })
        .locator(".."),
    ).toContainText("Version 1");
    await expect(details.getByText("Dana Reed", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to assessments", exact: true }).click();
    await expect(details).toHaveCount(0);
    await expect(latestDetails).toBeFocused();

    const historyAction = assessment.getByRole("button", { name: "Earlier assessments and edits" });
    await historyAction.click();
    const history = page.getByRole("heading", {
      name: "Earlier assessments and edits",
      exact: true,
    });
    await expect(history).toBeFocused();
    await expect(assessment).toContainText("The free venue makes the budget credible.");
    await expect(
      details
        .getByRole("term")
        .filter({ hasText: /^Submission$/ })
        .locator(".."),
    ).toContainText("Version 1");
    const criteriaAction = details.getByRole("button", { name: "View criteria used" });
    await criteriaAction.click();
    await expect(page.getByRole("heading", { name: "Criteria reviewed" })).toBeFocused();
    await expect(details).toHaveCount(0);
    await checkPage(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to assessment history", exact: true }).click();
    await expect(criteriaAction).toBeFocused();
    await page.getByRole("button", { name: "Back to assessments", exact: true }).click();

    await expect(history).toHaveCount(0);
    await expect(historyAction).toBeFocused();
    await expect(assessment).toContainText(
      "The revised venue costs are supported by a written quote.",
    );
  },
);

for (const choice of ["Keep my changes", "Discard & load latest"]) {
  test(
    `intake conflict recovery restores editing focus after "${choice}"`,
    { tag: "@cross-browser" },
    async ({ page }) => {
      await page.goto(
        "/iframe.html?id=features-applications-intake-form--concurrent-changes&viewMode=story",
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      const dialog = page.getByRole("form", { name: "Edit application details", exact: true });
      await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await expect(dialog.getByRole("textbox", { name: "Applicant", exact: true })).toHaveValue(
        "Neighbourhood Kitchen — local edit",
      );
      // Each field that differs shows its saved value beneath it.
      await expect(dialog.getByText(/^Now saved as Neighbourhood Kitchen$/)).toBeVisible();
      const recover = dialog.getByRole("button", { name: choice, exact: true });
      await recover.focus();
      await recover.press("Enter");

      const applicant = dialog.getByRole("textbox", { name: "Applicant", exact: true });
      await expect(applicant).toBeFocused();
      await expect(applicant).toHaveValue(
        choice === "Keep my changes"
          ? "Neighbourhood Kitchen — local edit"
          : "Neighbourhood Kitchen",
      );
      await expect(
        dialog.getByRole("textbox", { name: "Requested amount", exact: true }),
      ).toHaveValue("28000.00");
      await expect(dialog.getByText("Now saved as", { exact: true })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
      await checkPage(page);
    },
  );
}

test(
  "inspecting a review preserves recommendation writing and restores its reading position",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    if (!testInfo.project.use.isMobile) {
      // Short enough that the compact assessment list scrolls to reach the review.
      await page.setViewportSize({ width: 1280, height: 480 });
    }
    await page.goto(
      "/iframe.html?id=features-applications-recommendation--resume-editing&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const reference = page.getByRole("group", { name: "Reference", exact: true });
    const detail = reference
      .getByRole("article", { name: "Assessment by Jules Patel", exact: true })
      .getByRole("button", { name: "Review details", exact: true });
    await detail.focus();

    // The pane or the page scrolls, depending on the space available; either keeps the position.
    const readPosition = () =>
      reference.evaluate((element) => Math.round(element.scrollTop + window.scrollY));

    const position = await readPosition();
    expect(position).toBeGreaterThan(0);
    await detail.press("Enter");

    await expect(reference.getByRole("region", { name: "Review details" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Reasoning", exact: true })).toHaveValue(
      "Confirm the delivery dates.",
    );
    await reference.getByRole("button", { name: "Back to assessments", exact: true }).click();

    await expect(detail).toBeFocused();
    await expect.poll(readPosition).toBe(position);
    await checkPage(page);
  },
);

test(
  "review request controls restore focus and replace reviewers without changing assessments",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-applications-manage-reviews--changed-application&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const add = page.getByRole("button", { name: "Add review request", exact: true });
    await add.focus();
    await add.press("Enter");
    const picker = page.getByRole("dialog", { name: "Add review request", exact: true });
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(picker).toHaveCount(0);
    await expect(add).toBeFocused();
    await page.getByRole("button", { name: "Request actions for Jules Patel" }).click();
    await page.getByRole("menuitem", { name: "Replace reviewer" }).click();
    const replacement = page.getByRole("dialog", { name: "Replace reviewer", exact: true });
    await expect(replacement.getByRole("option", { name: /Jules Patel/ })).toBeDisabled();
    await replacement.getByRole("option", { name: /Sam Morgan/ }).click();

    await expect(replacement).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Jules Patel", exact: true })).toHaveCount(0);
    const request = page.getByRole("article", { name: "Sam Morgan", exact: true });
    await expect(request).toContainText("Awaiting assessment");
    await expect(page.getByRole("article", { name: "Assessment by Sam Morgan" })).toContainText(
      "The free venue makes the budget credible.",
    );
    await request.getByRole("button", { name: "Request actions for Sam Morgan" }).click();
    await page.getByRole("menuitem", { name: "Cancel request" }).click();

    await expect(request).toHaveCount(0);
    await expect(add).toBeEnabled();
    await checkPage(page);
  },
);

test(
  "compact review pickers keep search and actions reachable in a short viewport",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.setViewportSize({ ...page.viewportSize()!, height: 360 });
    await page.goto(
      "/iframe.html?id=features-applications-manage-reviews--changed-application&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const add = page.getByRole("button", { name: "Add review request", exact: true });
    await add.focus();
    await add.press("Enter");
    const picker = page.getByRole("dialog", { name: "Add review request", exact: true });
    const surface = page.locator('[data-appearance="picker"]').filter({ has: picker });
    const search = picker.getByRole("textbox", { name: "Find a contact" });
    await expect(search).toBeFocused();
    await expect(search).toBeInViewport({ ratio: 1 });
    await expect(picker.getByRole("option", { name: /Jules Patel/ })).toBeDisabled();
    await expect
      .poll(() => surface.evaluate((node) => node.scrollHeight - node.clientHeight))
      .toBeGreaterThan(0);

    const create = picker.getByRole("button", { name: "Add contact", exact: true });
    await create.focus();
    await expect(create).toBeInViewport({ ratio: 1 });
    await expect.poll(() => surface.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await search.focus();
    await expect(search).toBeInViewport({ ratio: 1 });
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("compact-picker-short-viewport.png") });
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(add).toBeFocused();
  },
);

test(
  "external reference navigation restores reading position and focus",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    if (!testInfo.project.use.isMobile) {
      await page.setViewportSize({ width: 1440, height: 800 });
    }
    await page.goto(
      "/iframe.html?id=features-applications-application-detail--external-reference-navigation&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const reference = page.getByRole("group", { name: "Reference", exact: true });
    await reference.evaluate((node) => {
      node.scrollTop = 150;
    });
    const position = await reference.evaluate((node) => node.scrollTop);
    if (!testInfo.project.use.isMobile) {
      expect(position).toBeGreaterThan(0);
    }

    await page.getByRole("button", { name: "Open assessments externally" }).click();
    await expect(page.getByRole("region", { name: "Reviewer assessments" })).toBeVisible();
    await expect(reference).toBeFocused();
    await page.getByRole("button", { name: "Open submission externally" }).click();
    await expect(page.getByRole("region", { name: "Applicant submission" })).toBeVisible();
    await expect.poll(() => reference.evaluate((node) => node.scrollTop)).toBe(position);
    await expect(reference).toBeFocused();
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("restored-reference.png") });
  },
);

test(
  "deleted round recovery remains accessible and retries returning to the list",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto(
      "/iframe.html?id=features-funding-rounds-manage-round--round-deleted-return-to-list-failed&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const back = page.getByRole("button", { name: "Return to funding rounds" });
    await expect(page.getByRole("status")).toHaveText("Round deleted.");
    await expect(back).toBeFocused();
    await expect(back).toBeInViewport();
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("deleted-round-recovery.png") });
    await back.press("Enter");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Round deleted.");
    await expect(back).toBeFocused();
  },
);
