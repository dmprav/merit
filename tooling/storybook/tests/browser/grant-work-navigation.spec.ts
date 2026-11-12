import { test, expect, checkPage } from "@merit/test-support/browser";

test(
  "review selection focuses the assessment and returns to the matching overview button",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-applications-overview--changed-evidence&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const workspace = page.getByRole("complementary", { name: "Application workspace" });

    for (const reviewer of [/Sam Morgan/, /Jules Patel/]) {
      const trigger = workspace.getByRole("button", { name: reviewer });
      await trigger.focus();
      await trigger.press("Enter");

      await expect(
        workspace.getByRole("heading", { name: "Assessment", exact: true }),
      ).toBeFocused();
      await expect(workspace.getByRole("article", { name: reviewer })).toBeVisible();
      await expect(page.getByRole("region", { name: "Applicant submission" })).toBeVisible();
      await workspace.getByRole("button", { name: "Back to overview" }).press("Enter");

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
  "assessment details preserve history context and restore both focus targets",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-applications-manage-reviews--correction-saved&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const assessment = page.getByRole("article", { name: "Assessment by Sam Morgan" });
    const latestDetails = assessment.getByRole("button", { name: "Review details", exact: true });
    await latestDetails.focus();
    await latestDetails.press("Enter");
    const details = page.getByRole("dialog", { name: "Review details", exact: true });

    await expect(details.getByText("Version 1", { exact: true })).toBeVisible();
    await expect(details.getByText("Dana Reed", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await expect(latestDetails).toBeFocused();

    const historyAction = assessment.getByRole("button", { name: "Earlier assessments and edits" });
    await historyAction.click();
    const history = page.getByRole("dialog", {
      name: "Earlier assessments and edits",
      exact: true,
    });
    await expect(history).toContainText("The free venue makes the budget credible.");
    const earlierDetails = history.getByRole("button", { name: "Review details", exact: true });
    await earlierDetails.focus();
    await earlierDetails.press("Enter");

    await expect(details.getByText("Version 1", { exact: true })).toBeVisible();
    await expect(details.getByRole("heading", { name: "Criteria reviewed" })).toBeVisible();
    await checkPage(page);
    await page.keyboard.press("Escape");

    await expect(details).toHaveCount(0);
    await expect(history).toBeVisible();
    await expect(earlierDetails).toBeFocused();
    await history.getByRole("button", { name: "Close", exact: true }).click();

    await expect(history).toHaveCount(0);
    await expect(historyAction).toBeFocused();
    await expect(assessment).toContainText(
      "The revised venue costs are supported by a written quote.",
    );
  },
);

for (const choice of ["Keep my changes", "Use saved values"]) {
  test(
    `intake conflict recovery restores editing focus after "${choice}"`,
    { tag: "@cross-browser" },
    async ({ page }) => {
      await page.goto(
        "/iframe.html?id=features-applications-intake-form--concurrent-changes&viewMode=story",
      );
      await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
      const dialog = page.getByRole("dialog", { name: "Edit application details", exact: true });
      const applicant = dialog.getByRole("textbox", { name: "Applicant", exact: true });

      await expect(applicant).toHaveValue("Neighbourhood Kitchen — local edit");
      await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await dialog.getByText("Latest saved values", { exact: true }).click();
      await expect(
        dialog.getByText("Applicant: Neighbourhood Kitchen", { exact: true }),
      ).toBeVisible();
      await expect(dialog.getByText("Requested amount: 28000.00", { exact: true })).toBeVisible();
      const recover = dialog.getByRole("button", { name: choice, exact: true });
      await recover.focus();
      await recover.press("Enter");

      await expect(applicant).toBeFocused();
      await expect(applicant).toHaveValue(
        choice === "Keep my changes"
          ? "Neighbourhood Kitchen — local edit"
          : "Neighbourhood Kitchen",
      );
      await expect(
        dialog.getByRole("textbox", { name: "Requested amount", exact: true }),
      ).toHaveValue("28000.00");
      await expect(dialog.getByText("Latest saved values", { exact: true })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
      await checkPage(page);
    },
  );
}

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
  "external reference navigation restores reading position and focus",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    if (!testInfo.project.use.isMobile) {
      await page.setViewportSize({ width: 1440, height: 800 });
    }
    await page.goto(
      "/iframe.html?id=features-applications-overview--external-reference-navigation&viewMode=story",
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
      "/iframe.html?id=features-funding-rounds-deletion-recovery--return-failed&viewMode=story",
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
