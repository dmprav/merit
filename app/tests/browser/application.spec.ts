import type { Page } from "@playwright/test";

import { test, expect, checkPage } from "@merit/test-support/browser";
import { openNavigation, closeNavigation } from "@merit/test-support/browser/navigation";

import {
  openDemo,
  openDemoRound,
  openDemoApplication,
  continueDemoEntry,
  openGuidedDemo,
} from "./demo-navigation.ts";

test("demo exposes the workspace applications overview", async ({ page }) => {
  const workspace = await openDemo(page);
  const navigation = await openNavigation(page);
  await navigation.getByRole("link", { name: "Applications", exact: true }).click();
  await expect(page).toHaveURL(`${workspace}/applications`);
  await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "3 of 3 applications" })).toBeVisible();
  await page.getByRole("link", { name: "Workshop Saturdays", exact: true }).click();
  await page.reload();
  await page.getByRole("link", { name: "Back to applications", exact: true }).click();
  await expect(page).toHaveURL(`${workspace}/applications`);
  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();
});

const localRecovery = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("merit-drafts");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("drafts", "readonly");
          const records = transaction.objectStore("drafts").getAll();
          records.onsuccess = () => resolve(JSON.stringify(records.result));
          records.onerror = () => reject(records.error);
          transaction.oncomplete = () => db.close();
        };
      }),
  );

test(
  "local draft recovery survives closing a tab and protects simultaneous writing",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await openDemoApplication(page, "Workshop Saturdays", true);
    const url = page.url();
    const editName = /^(Edit|Resume editing) recommendation for Workshop Saturdays$/;
    const writing = "Recover this writing after closing the tab.";
    await page.getByRole("button", { name: editName }).click();
    await page.getByRole("textbox", { name: "Reasoning", exact: true }).fill(writing);
    await expect.poll(() => localRecovery(page)).toContain(writing);

    const context = page.context();
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    await reopened.getByRole("button", { name: editName }).click();
    await expect(reopened.getByRole("textbox", { name: "Reasoning", exact: true })).toHaveValue(
      writing,
    );

    const concurrent = await context.newPage();
    await concurrent.goto(url);
    await concurrent.getByRole("button", { name: editName }).click();
    await expect(concurrent.getByRole("textbox", { name: "Reasoning", exact: true })).toHaveValue(
      writing,
    );

    await reopened
      .getByRole("textbox", { name: "Reasoning", exact: true })
      .fill("First tab's saved draft.");
    await expect.poll(() => localRecovery(reopened)).toContain("First tab's saved draft.");
    await concurrent
      .getByRole("textbox", { name: "Reasoning", exact: true })
      .fill("Second tab's retained writing.");
    await expect(concurrent.getByText(/Another tab changed a saved draft/)).toBeVisible();
    await expect(concurrent.getByRole("textbox", { name: "Reasoning", exact: true })).toHaveValue(
      "Second tab's retained writing.",
    );
    await concurrent.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(concurrent.getByText(/Another tab changed a saved draft/)).toHaveCount(0);
    await expect.poll(() => localRecovery(concurrent)).toContain("First tab's saved draft.");
    await checkPage(concurrent);
    await concurrent.close();
    await reopened.close();
  },
);

test(
  "central Docs opens guides without losing the recommendation draft",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await openDemoApplication(page, "Neighbour Table", true);

    await expect(
      page.getByRole("button", { name: /About review status|About this budget/ }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Edit recommendation for Neighbour Table" }).click();
    const reasoning = page.getByRole("textbox", { name: "Reasoning", exact: true });
    await reasoning.fill("Keep this draft while consulting the guide.");
    await page.getByRole("button", { name: /Recommendation$/ }).click();
    await page.getByRole("option", { name: "Defer", exact: true }).click();

    await expect(page.getByLabel("Proposed allocation")).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Budget preview" })).toHaveText(
      "Remaining with draft €32,000",
    );

    await checkPage(page);
    await page.screenshot({
      path: testInfo.outputPath("recommendation-editor.png"),
      fullPage: true,
    });
    await openNavigation(page);
    const docs = page.getByRole("link", {
      name: "Documentation (opens in a new tab)",
      exact: true,
    });
    const newTab = page.waitForEvent("popup");
    if (testInfo.project.use.isMobile) {
      await docs.tap();
    } else {
      await docs.focus();
      await page.keyboard.press("Enter");
    }
    const guide = await newTab;

    await expect(guide).toHaveURL(/\/docs$/);
    await expect(guide).toHaveTitle("Docs · Merit");
    // The development tools mount after hydration; the server-rendered links appear earlier.
    await expect(guide.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible();

    await guide
      .getByRole("article")
      .getByRole("link", { name: /Join a workspace/ })
      .click();

    await expect(guide).toHaveTitle("Join a workspace · Merit");

    await checkPage(guide);
    await guide.getByRole("link", { name: "Continue with Review and recommend" }).click();

    await expect(guide).toHaveTitle("Review and recommend · Merit");

    if (testInfo.project.use.isMobile) {
      await guide.locator("summary").filter({ hasText: "On this page" }).click();
    }
    await guide.getByRole("link", { name: "Check the budget effect", exact: true }).click();

    await expect(guide.locator("#budget")).toBeInViewport();

    await checkPage(guide);
    await guide.close();
    await closeNavigation(page);

    await expect(reasoning).toHaveValue("Keep this draft while consulting the guide.");
    await expect(
      page.getByRole("button", { name: "Save recommendation", exact: true }),
    ).toBeEnabled();
  },
);

test("development tools explain real sign-in without exposing fixture controls", async ({
  page,
}) => {
  await page.goto("/app/sign-in");
  await page.getByRole("button", { name: "Open TanStack Devtools", exact: true }).click();
  const panel = page.getByRole("region", { name: "Merit development tools" });

  await expect(panel).toContainText("Authentication: Clerk");
  await expect(panel).toContainText("vp run dev:workspace");
  await expect(panel.getByRole("group", { name: "Local identity" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Organization administration" })).toBeVisible();
});

test(
  "marketing introduces grant work and leads into the demo workspace",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Bring your grantmaking together.",
    );
    await expect(page).toHaveTitle("Merit · Bring your grantmaking together.");
    await expect(page.getByText("Fictional workspace · No account needed")).toBeVisible();

    const applications = page.getByRole("table", { name: "Applications", exact: true });

    await expect(applications.getByRole("row")).toHaveCount(4);
    await expect(applications.getByRole("row", { name: /Workshop Saturdays/ })).toContainText(
      "1 outdated review, 1 awaiting review",
    );
    await expect(page.getByText("Remaining if approved", { exact: true })).toBeVisible();

    const evidence = page.getByRole("region", { name: "Keep evidence and judgments connected." });

    await expect(evidence).toContainText("Current application v2");
    await expect(evidence).toContainText("Reviewed application v1");

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("marketing-story.png"), fullPage: true });
    const invitation = page.getByRole("region", { name: "See how the pieces fit together." });
    const request = invitation.getByRole("button", { name: "Request an invitation", exact: true });

    await expect(request).toBeEnabled();

    await invitation.screenshot({ path: testInfo.outputPath("marketing-invitation.png") });
    await request.click();
    const dialog = page.getByRole("dialog", { name: "Request an invitation", exact: true });

    await expect(dialog.getByRole("textbox", { name: "Email address" })).toBeFocused();

    await checkPage(page);

    await expect(dialog).toBeInViewport();

    await page.screenshot({ path: testInfo.outputPath("invitation-dialog.png") });
    const email = dialog.getByRole("textbox", { name: "Email address" });
    await email.fill("visitor@example.test");
    const privacyTab = page.waitForEvent("popup");
    await dialog.getByRole("link", { name: "Privacy notice (opens in a new tab)" }).click();
    const privacy = await privacyTab;

    await expect(privacy).toHaveURL(/\/privacy$/);
    await expect(privacy).toHaveTitle("Privacy notice · Merit");
    await expect(privacy.getByRole("heading", { level: 1 })).toHaveText("Privacy notice");

    await checkPage(privacy);
    await privacy.screenshot({ path: testInfo.outputPath("privacy-notice.png"), fullPage: true });
    await privacy.close();

    await expect(email).toHaveValue("visitor@example.test");

    await email.clear();
    await page.keyboard.press("Escape");

    await expect(dialog).toHaveCount(0);
    await expect(request).toBeFocused();

    await invitation.getByRole("link", { name: "Try the demo", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Step into a program manager’s workspace",
    );
    await expect(page.getByText(/You’re preparing funding recommendations/)).toBeVisible();
    await expect(page.getByText(/Workshop Saturdays has lost its free venue/)).toBeVisible();
    await expect(page.getByText(/it remains available for seven days/)).toBeVisible();
    const example = page.getByRole("button", { name: "Explore the example", exact: true });
    const browse = page.getByRole("button", { name: "Browse the workspace", exact: true });
    await expect(example).toBeInViewport();
    await expect(browse).toBeInViewport();
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("demo-introduction.png") });

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await browse.scrollIntoViewIfNeeded();
    await checkPage(page);
    await page.screenshot({
      path: testInfo.outputPath("demo-introduction-enlarged.png"),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await example.focus();
    await page.keyboard.press("Tab");
    await expect(browse).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");

    await expect(page).toHaveTitle("Workshop Saturdays · Merit");
    const guide = page.getByRole("dialog", { name: "Demo guide", exact: true });
    await expect(guide).toBeVisible();
    await expect(guide.getByText(/You’re preparing funding recommendations/)).toBeVisible();
    await expect(guide.getByText(/Workshop Saturdays has lost its free venue/)).toBeVisible();
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("demo-introduction-guide.png") });
    const workspacePath = new URL(page.url()).pathname.split("/applications/")[0]!;
    await guide.getByRole("link", { name: "Exit demo" }).click();
    await page
      .getByRole("region", { name: "Bring your grantmaking together." })
      .getByRole("link", { name: "Try the demo", exact: true })
      .click();

    await expect(page).toHaveURL(`${workspacePath}/rounds`);
    await expect(page).toHaveTitle("Funding rounds · Merit");
    await expect(page.getByRole("dialog", { name: "Demo guide", exact: true })).toHaveCount(0);

    await checkPage(page);
  },
);

test(
  "marketing keeps evidence aligned and content readable with enlarged text",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto("/");
    const evidence = page.getByRole("region", { name: "Keep evidence and judgments connected." });
    const quotations = evidence.getByRole("blockquote");

    await expect(quotations).toHaveCount(2);

    if (!testInfo.project.use.isMobile) {
      const current = await quotations.nth(0).boundingBox();
      const earlier = await quotations.nth(1).boundingBox();

      expect(current).not.toBeNull();
      expect(earlier).not.toBeNull();
      expect(Math.abs(current!.y - earlier!.y)).toBeLessThan(1);
    }

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("marketing-layout.png"), fullPage: true });
    const originalViewport = page.viewportSize()!;
    await page.setViewportSize({ width: 768, height: 1024 });
    const amountLines = await page.getByText("€24,000", { exact: true }).evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    });

    expect(amountLines).toBe(1);
    await checkPage(page);
    await page.setViewportSize(originalViewport);
    await page.addStyleTag({ content: "html { font-size: 200%; }" });

    await expect(page.getByText("Remaining if approved", { exact: true })).toBeVisible();
    await expect(evidence.getByText("Reviewed application v1", { exact: true })).toBeVisible();
    expect(
      await page.locator("html").evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("marketing-enlarged.png"), fullPage: true });
  },
);

test("marketing remains readable with reduced motion and without JavaScript", async ({
  page,
  newContext,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");

  const action = page
    .getByRole("region", { name: "Bring your grantmaking together." })
    .getByRole("link", { name: "Try the demo", exact: true });
  await action.focus();

  await expect(action).toHaveCSS("transition-duration", "0s");
  await expect(action.locator("svg")).toHaveCSS("translate", "none");

  await checkPage(page);
  await page.keyboard.press("Enter");
  await continueDemoEntry(page);

  await expect(page).toHaveURL(/\/app\/demo-[^/]+\/rounds$/);

  const staticContext = await newContext({
    javaScriptEnabled: false,
    viewport: page.viewportSize()!,
  });

  const staticPage = await staticContext.newPage();

  try {
    await staticPage.goto(new URL("/", page.url()).href);

    await expect(staticPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      staticPage.getByRole("table", { name: "Applications", exact: true }),
    ).toBeVisible();
    await expect(
      staticPage.getByRole("region", { name: "Keep evidence and judgments connected." }),
    ).toContainText("Reviewed application v1");

    await staticPage.getByRole("banner").getByRole("link", { name: "Docs", exact: true }).click();

    await expect(staticPage).toHaveURL(/\/docs$/);
    await expect(staticPage).toHaveTitle("Docs · Merit");
  } finally {
    await staticContext.close();
  }
});

test("person identity identifies contacts, reviewers and managers", async ({ page }, testInfo) => {
  await openDemoApplication(page, "Workshop Saturdays");

  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();
  await expect(page).toHaveTitle("Workshop Saturdays · Merit");

  const workspace = page.getByRole("complementary", { name: "Application workspace" });

  await expect(workspace.getByText("Maya Thompson", { exact: true })).toBeVisible();

  const decision = workspace.getByRole("region", { name: "Manager recommendation", exact: true });

  await expect(decision.getByText("Dana Reed", { exact: true })).toBeVisible();

  const panelAction = decision.getByRole("button", { name: /Edit recommendation for/ });

  await expect(panelAction).toBeVisible();

  const reviewChoice = workspace.getByRole("button", { name: /Sam Morgan/ });
  await reviewChoice.click();
  const review = workspace.getByRole("article", { name: "Assessment by Sam Morgan" });

  await expect(review.getByText("Recommends funding", { exact: true })).toBeVisible();
  await expect(review.getByText("Sam Morgan", { exact: true })).toBeVisible();

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("person-identity-reviews.png") });
  await workspace.getByRole("button", { name: "Back to overview" }).click();

  await expect(reviewChoice).toBeFocused();

  const overviewBounds = (await workspace.boundingBox())!;
  await panelAction.click();

  await expect(workspace.getByRole("form")).toBeVisible();

  if (testInfo.project.name === "desktop") {
    const editingBounds = (await workspace.boundingBox())!;

    expect(editingBounds.x).toBe(overviewBounds.x);
    expect(editingBounds.width).toBe(overviewBounds.width);
    expect(editingBounds.y).toBe(overviewBounds.y);
  }
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();

  await expect(panelAction).toBeFocused();

  await page.getByRole("link", { name: "Local Connections 2027", exact: true }).click();
  await page.getByRole("tab", { name: "Overview" }).click();

  await expect(
    page
      .getByRole("complementary", { name: "Round properties" })
      .getByText("Dana Reed", { exact: true }),
  ).toBeVisible();

  await checkPage(page);
});

test("application reading keeps desktop navigation fixed and restores reference position", async ({
  page,
}, testInfo) => {
  await openDemoApplication(page, "Ride Together");

  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();

  const submission = page.getByRole("region", { name: "Applicant submission", exact: true });
  const viewport = submission.locator("..");
  const title = page.getByRole("heading", { name: "Ride Together", exact: true });
  const budgetAnswer = submission.getByText(/^Accessible transport:/);
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1724, height: 700 });
    const bounds = (await viewport.boundingBox())!;
    const workspaceBounds = (await page
      .getByRole("complementary", { name: "Application workspace" })
      .boundingBox())!;

    expect(Math.abs(bounds.x + bounds.width - workspaceBounds.x)).toBeLessThanOrEqual(1);

    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
    await page.mouse.wheel(0, 300);

    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);

    const titleTop = (await title.boundingBox())!.y;
    await viewport.focus();
    await viewport.press("End");
    await expect
      .poll(() =>
        viewport.evaluate((node) =>
          Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop),
        ),
      )
      .toBeLessThanOrEqual(1);

    await expect(budgetAnswer).toBeInViewport();
    expect((await title.boundingBox())!.y).toBe(titleTop);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeInViewport();

    const readingPosition = await viewport.evaluate((node) => node.scrollTop);
    await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
    await page.getByRole("button", { name: "Back to application", exact: true }).click();

    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBe(readingPosition);

    await page.screenshot({ path: testInfo.outputPath("application-scrolled.png") });
    await checkPage(page);
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Local Connections 2027" })
      .click();
    await page.getByRole("link", { name: "Workshop Saturdays" }).click();

    await expect(
      page.getByRole("heading", { name: "Workshop Saturdays", exact: true }),
    ).toBeVisible();
    expect(await viewport.evaluate((node) => node.scrollTop)).toBe(0);

    await page.setViewportSize({ width: 1280, height: 500 });
    await submission.getByText(/^Workshop facilitators/).scrollIntoViewIfNeeded();

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  } else {
    await budgetAnswer.scrollIntoViewIfNeeded();

    await expect(budgetAnswer).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await viewport.evaluate((node) => node.scrollTop)).toBe(0);
  }
  await checkPage(page);
});

test(
  "recommendation editing resumes, saves, restores focus and persists after reload",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await openDemoApplication(page, "Workshop Saturdays", true);
    const edit = page.getByRole("button", { name: "Edit recommendation for Workshop Saturdays" });
    await edit.click();
    await page.getByRole("button", { name: /Recommendation$/ }).click();
    await page.getByRole("option", { name: "Fund", exact: true }).click();
    await page.getByLabel("Proposed allocation").fill("22000");
    const reasoning = page.getByRole("textbox", { name: "Reasoning", exact: true });
    await reasoning.fill("Wait for venue confirmation and the updated review.");
    await page.getByRole("button", { name: "Close recommendation", exact: true }).click();
    const resume = page.getByRole("button", {
      name: "Resume editing recommendation for Workshop Saturdays",
    });

    await expect(resume).toBeFocused();
    await expect(resume).toHaveAttribute("data-draft", "true");
    await resume.click();
    await expect(page.getByLabel("Proposed allocation")).toHaveValue("22000.00");
    await expect(reasoning).toHaveValue("Wait for venue confirmation and the updated review.");
    await page.getByRole("button", { name: "Save recommendation", exact: true }).click();

    await expect(edit).toBeFocused();
    await expect(
      page.getByText("Wait for venue confirmation and the updated review.", { exact: true }),
    ).toBeVisible();

    await page.reload();

    await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();
    await expect(edit).toBeEnabled();
    await expect(
      page.getByText("Wait for venue confirmation and the updated review.", { exact: true }),
    ).toBeVisible();

    await edit.click();
    await expect(page.getByLabel("Proposed allocation")).toHaveValue("22000.00");
    await expect(reasoning).toHaveValue("Wait for venue confirmation and the updated review.");
    await page.screenshot({
      path: testInfo.outputPath("saved-recommendation.png"),
      fullPage: true,
    });

    await checkPage(page);
  },
);

test("recommendation amount rejects invalid native clipboard content without replacing the draft", async ({
  page,
}) => {
  await openDemoApplication(page, "Neighbour Table", true);
  await page.getByRole("button", { name: "Edit recommendation for Neighbour Table" }).click();
  const allocation = page.getByLabel("Proposed allocation");
  await allocation.fill("22000.00");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("1.005"));
  await allocation.selectText();
  await allocation.press("ControlOrMeta+V");

  await expect(allocation).toHaveValue("22000.00");
  await expect(
    page.getByText("Enter no more than two decimal places. The amount was not changed."),
  ).toBeVisible();
});

test("saving announces success with a compact, centred confirmation and restores focus", async ({
  page,
}, testInfo) => {
  await openDemoApplication(page, "Neighbour Table", true);
  const edit = page.getByRole("button", { name: "Edit recommendation for Neighbour Table" });

  await expect(edit).toBeEnabled();

  await edit.click();
  await page.getByRole("button", { name: "Save recommendation", exact: true }).click();

  await expect(edit).toBeFocused();
  const status = page.getByRole("status").filter({ hasText: "Recommendation saved" });

  await expect(status).toHaveCount(1);

  const toast = page
    .locator('span[aria-hidden="true"]')
    .filter({ hasText: "Recommendation saved" });

  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveCSS("position", "fixed");
  await expect(toast).toBeInViewport();

  const bounds = (await toast.boundingBox())!;
  const workspace = (await page.getByRole("main").boundingBox())!;

  expect(Math.abs(bounds.x + bounds.width / 2 - (workspace.x + workspace.width / 2))).toBeLessThan(
    1,
  );
  expect(bounds.height).toBeLessThan(50);

  await page.screenshot({ path: testInfo.outputPath("save-confirmation.png") });
  await checkPage(page);
});

test("split editor keeps the draft and reference available without moving save actions", async ({
  page,
}, testInfo) => {
  await openDemoApplication(page, "Ride Together");

  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();

  const edit = page.getByRole("button", { name: "Edit recommendation for Ride Together" });
  const workspace = page.getByRole("complementary", { name: "Application workspace", exact: true });
  const editor = workspace.getByRole("form");
  const reasoning = page.getByRole("textbox", { name: "Reasoning", exact: true });
  const save = page.getByRole("button", { name: "Save recommendation", exact: true });
  const submission = page.getByRole("region", { name: "Applicant submission", exact: true });
  const viewport = submission.locator("..");
  const mobile = testInfo.project.name === "mobile";

  const chooseReference = async (name: string) => {
    await page.getByRole("button", { name: /^Reference material:/ }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };

  if (!mobile) {
    await page.setViewportSize({ width: 1724, height: 988 });
  }
  const overviewBounds = (await workspace.boundingBox())!;
  await edit.click();

  await expect(edit).toBeHidden();

  await reasoning.fill("Keep provider confirmation as a condition.");
  await save.scrollIntoViewIfNeeded();

  await expect(save).toBeInViewport();

  const saveTop = (await save.boundingBox())!.y;
  if (!mobile) {
    const editingBounds = (await workspace.boundingBox())!;

    expect(editingBounds.x).toBe(overviewBounds.x);
    expect(editingBounds.width).toBe(overviewBounds.width);
  } else {
    await page.getByRole("link", { name: "Browse reference material" }).click();
  }
  await submission.getByText(/^Accessible transport:/).scrollIntoViewIfNeeded();

  await expect(submission.getByText(/^Accessible transport:/)).toBeInViewport();
  if (!mobile) {
    await viewport.focus();
    await viewport.press("End");
    await expect
      .poll(() =>
        viewport.evaluate((node) =>
          Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop),
        ),
      )
      .toBeLessThanOrEqual(1);
  }

  const position = await viewport.evaluate((node) => node.scrollTop);

  if (!mobile) {
    expect(position).toBeGreaterThan(0);
  }

  await chooseReference("Reviewer assessments");

  await expect(
    page.getByRole("region", { name: "Reviewer assessments", exact: true }),
  ).toBeVisible();

  await chooseReference("Application details");

  await expect(
    page.getByRole("region", { name: "Application details", exact: true }),
  ).toBeVisible();

  await chooseReference("Version history");

  await expect(page.getByRole("button", { name: "Back to application", exact: true })).toHaveCount(
    0,
  );

  await chooseReference("Applicant submission");

  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBe(position);

  if (mobile) {
    await page.getByRole("link", { name: "Go to recommendation", exact: true }).click();
  }

  await expect(reasoning).toHaveValue("Keep provider confirmation as a condition.");

  await save.scrollIntoViewIfNeeded();

  await expect(save).toBeInViewport();
  if (!mobile) {
    expect((await save.boundingBox())!.y).toBe(saveTop);
  }

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("split-editor.png") });
  await save.click();

  await expect(editor).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(
    page.getByText("Keep provider confirmation as a condition.", { exact: true }),
  ).toBeVisible();

  await edit.click();
  await reasoning.fill("Discard this change.");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();

  await expect(edit).toBeFocused();
  await expect(page.getByText("Discard this change.", { exact: true })).toHaveCount(0);
  if (!mobile) {
    await page.setViewportSize({ width: 1000, height: 700 });
    await edit.click();

    await expect(save).toBeInViewport();

    await chooseReference("Reviewer assessments");

    await expect(reasoning).toHaveValue("Keep provider confirmation as a condition.");

    await page.setViewportSize({ width: 1280, height: 500 });
    await page.getByRole("link", { name: "Go to recommendation", exact: true }).click();
    await save.scrollIntoViewIfNeeded();

    await expect(save).toBeInViewport();

    await checkPage(page);
  }
});

test(
  "application sorting works with desktop headers and mobile controls",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await openDemoRound(page, true);

    await expect(page).toHaveTitle("Local Connections 2027 · Merit");
    await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();

    const applications = page.getByRole("table", { name: "Applications" });
    const names = applications.locator("tbody tr td:first-child a");
    const mobile = testInfo.project.use.isMobile;
    if (mobile) {
      const select = page.getByRole("button", { name: /Sort applications/ });
      await select.click();
      await page.getByRole("option", { name: "Proposed (ascending)", exact: true }).click();

      await expect(select).toBeFocused();
      await expect(page.getByRole("button", { name: "Proposed", exact: true })).toBeHidden();
    } else {
      const proposed = page.getByRole("button", { name: "Proposed", exact: true });
      await proposed.focus();
      await page.keyboard.press("Enter");

      await expect(proposed).toBeFocused();
      await expect(proposed).toHaveCSS("outline-style", "none");
      await expect(proposed).toHaveCSS("text-decoration-line", "underline");
    }

    await expect(names).toHaveText(["Workshop Saturdays", "Neighbour Table", "Ride Together"]);
    await expect(
      applications.getByRole("columnheader", { name: "Proposed", exact: true }),
    ).toHaveAttribute("aria-sort", "ascending");

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("applications-sorted.png"), fullPage: true });
    if (mobile) {
      await page.getByRole("button", { name: /Sort applications/ }).click();
      await page.getByRole("option", { name: "Proposed (descending)", exact: true }).click();
    } else {
      await page.keyboard.press("Space");
    }

    await expect(names).toHaveText(["Ride Together", "Neighbour Table", "Workshop Saturdays"]);

    await page.getByRole("tab", { name: "Overview" }).click();
    await page.getByRole("tab", { name: /Applications/ }).click();

    await expect(names).toHaveText(["Ride Together", "Neighbour Table", "Workshop Saturdays"]);

    if (mobile) {
      await page.getByRole("button", { name: /Sort applications/ }).click();
      await page.getByRole("option", { name: "Original order", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Proposed", exact: true }).click();
    }

    await expect(names).toHaveText(["Neighbour Table", "Ride Together", "Workshop Saturdays"]);

    await applications
      .getByRole("row", { name: /Workshop Saturdays/ })
      .getByRole("link", { name: /outdated/ })
      .click();

    await expect(
      page.getByRole("region", { name: "Reviewer assessments", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Workshop Saturdays", exact: true }),
    ).toBeVisible();
  },
);

test("round overview keeps context visible and links to the right application section", async ({
  page,
}, testInfo) => {
  await openDemoRound(page);

  await expect(page).toHaveTitle("Local Connections 2027 · Merit");
  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("tab", { name: /Applications/ }).click();

  await expect(page).toHaveURL(/section=applications/);

  const workshop = page.getByRole("row", { name: /Workshop Saturdays/ });
  const review = workshop.getByRole("link", { name: "1 outdated review, 1 awaiting review" });

  await expect(review).toBeVisible();
  await expect(workshop.getByText("€0", { exact: true })).toBeVisible();
  await expect(page.getByText("Written provider confirmation missing")).toHaveCount(0);

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("round-overview.png"), fullPage: true });
  const properties = page.getByRole("complementary", { name: "Round properties", exact: true });

  await expect(properties).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Review status" })).toHaveCount(1);

  await page.getByRole("tab", { name: "Overview", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/demo-[^/]+\/rounds\/local-connections-2027-[^/?]+$/);

  await page.reload();

  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Assessment criteria", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("€60,000", { exact: true })).toBeVisible();
  await expect(page.getByText("21 January 2027", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Community connection", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Local Connections 2027", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Decisions pending", { exact: true })).toBeVisible();

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("round-details.png"), fullPage: true });

  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();

  await page.getByRole("tab", { name: "Overview", exact: true }).focus();

  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toBeFocused();

  await page.keyboard.press("ArrowRight");

  await expect(page.getByRole("tab", { name: /Applications/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await review.focus();

  await expect(review).toHaveCSS("outline-style", "solid");
  await expect(review).toHaveCSS("outline-width", "2px");
  await expect(review).toHaveCSS("text-decoration-line", "underline");

  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("region", { name: "Reviewer assessments", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workshop Saturdays", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Local Connections 2027" })
    .click();

  await expect(page).toHaveURL(/section=applications/);
  await expect(page.getByRole("tab", { name: /Applications/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("link", { name: "Workshop Saturdays", exact: true }).click();

  await expect(
    page.getByRole("region", { name: "Applicant submission", exact: true }),
  ).toBeVisible();
});

test("round breadcrumb restores application sorting", async ({ page }, testInfo) => {
  await openDemoRound(page, true);

  await expect(page).toHaveTitle("Local Connections 2027 · Merit");
  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Sort applications/ }).click();
    await page.getByRole("option", { name: "Application (descending)", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Application", exact: true }).click();
    await page.getByRole("button", { name: "Application", exact: true }).click();
  }
  const firstApplication = page.getByRole("row").nth(1);

  await expect(firstApplication).toContainText("Workshop Saturdays");

  await page.getByRole("link", { name: "Workshop Saturdays", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Workshop Saturdays", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Local Connections 2027" })
    .click();

  await expect(page).toHaveURL(/section=applications/);
  await expect(firstApplication).toContainText("Workshop Saturdays");
  await expect(page.getByRole("tab", { name: /Applications/, selected: true })).toBeVisible();

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("breadcrumb-sort.png"), fullPage: true });
});

test("round list restores its position and keeps application drafts independent", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name === "desktop"
      ? { width: 1280, height: 440 }
      : { width: 390, height: 640 },
  );
  await openDemoRound(page, true);

  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();

  const backToRound = () =>
    page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Local Connections 2027" })
      .click();

  await page.getByRole("link", { name: "Workshop Saturdays" }).scrollIntoViewIfNeeded();
  const listPosition = await page.evaluate(() => window.scrollY);

  expect(listPosition).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Workshop Saturdays" }).click();

  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
  await page.getByRole("button", { name: "Edit recommendation for Workshop Saturdays" }).click();
  const reasoning = page.getByRole("textbox", { name: "Reasoning", exact: true });
  await reasoning.fill("A draft for Workshop Saturdays.");
  await backToRound();

  await expect(page).toHaveURL(/section=applications/);
  await expect(page.getByRole("tab", { name: /Applications/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(listPosition);

  await page.getByRole("link", { name: "Ride Together" }).click();

  await expect(page.getByRole("form")).toHaveCount(0);

  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("application-navigation.png") });
  await page.getByRole("button", { name: "Edit recommendation for Ride Together" }).click();
  await reasoning.fill("A separate draft for Ride Together.");
  await backToRound();
  await page.getByRole("link", { name: "Workshop Saturdays" }).click();

  await expect(page.getByRole("form")).toHaveCount(0);

  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();

  await expect(
    page.getByRole("button", { name: /Resume editing recommendation for/ }),
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("resume-editing.png") });
  await page.getByRole("button", { name: /Resume editing recommendation for/ }).click();

  await expect(reasoning).toHaveValue("A draft for Workshop Saturdays.");

  await backToRound();
  await page.getByRole("link", { name: "Ride Together" }).click();

  await expect(page.getByRole("form")).toHaveCount(0);

  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
  await page.getByRole("button", { name: /Resume editing recommendation for/ }).click();

  await expect(reasoning).toHaveValue("A separate draft for Ride Together.");

  await checkPage(page);
});

test(
  "demo guidance stays optional and reset confirmation uses the product theme",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await openGuidedDemo(page);
    const guide = page.getByRole("dialog", { name: "Demo guide", exact: true });
    const launcher = page.getByRole("button", { name: "Demo guide", exact: true });

    await expect(guide).toBeVisible();
    await expect(guide.getByRole("link", { name: "Review Workshop Saturdays" })).toBeVisible();
    await expect(guide.getByRole("link", { name: "Exit demo" })).toBeVisible();
    await expect(guide.getByRole("button", { name: "Reset demo", exact: true })).toBeVisible();
    await expect(page.getByText("Demo with fictional data", { exact: true })).toHaveCount(0);

    if (testInfo.project.use.isMobile) {
      for (const link of await guide.getByRole("link").all()) {
        // Layout size excludes fractional transforms during the popover's entrance.
        expect(
          await link.evaluate((node) => (node as HTMLElement).offsetHeight),
        ).toBeGreaterThanOrEqual(44);
      }
    }

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("demo-guide.png") });
    await page.keyboard.press("Escape");

    await expect(guide).toHaveCount(0);

    await launcher.focus();
    await page.keyboard.press("Enter");

    await expect(guide).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(launcher).toBeFocused();

    await page.getByRole("button", { name: "Manage reviews", exact: true }).click();

    await expect(
      page.getByRole("region", { name: "Reviewer assessments", exact: true }),
    ).toBeVisible();
    await expect(guide).toHaveCount(0);

    await launcher.click();
    await guide.getByRole("button", { name: "Reset demo", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Reset the demo?" });

    await expect(dialog).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-product-theme", "");
    expect(
      await dialog.evaluate((node) =>
        getComputedStyle(node).getPropertyValue("--background").trim(),
      ),
    ).toBe("#ffffff");

    await checkPage(page);
    await dialog.getByRole("button", { name: "Keep my changes", exact: true }).click();

    await expect(dialog).toHaveCount(0);

    await launcher.click();
    await guide.getByRole("link", { name: "Exit demo" }).click();

    await expect(page).toHaveURL("http://localhost:3001/");
    await expect(page.locator("html")).not.toHaveAttribute("data-product-theme");

    await checkPage(page);
  },
);

test("demo guidance returns to its named scenario from another application", async ({ page }) => {
  await openDemoApplication(page, "Ride Together");
  const workspacePath = new URL(page.url()).pathname.split("/applications/")[0]!;
  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentRequests.push(request.url());
    }
  });
  await page.getByRole("button", { name: "Demo guide", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Demo guide", exact: true });

  await expect(guide).toContainText("Workshop Saturdays has lost its free venue.");
  await guide.getByRole("link", { name: "Review Workshop Saturdays" }).click();

  await expect(page).toHaveTitle("Workshop Saturdays · Merit");
  expect(new URL(page.url()).pathname.split("/applications/")[0]).toBe(workspacePath);
  await expect(
    page.getByRole("region", { name: "Reviewer assessments", exact: true }),
  ).toBeVisible();
  await expect(guide).toHaveCount(0);

  await page.getByRole("button", { name: "Demo guide", exact: true }).click();
  await guide.getByRole("link", { name: "Review Workshop Saturdays" }).click();

  await expect(guide).toHaveCount(0);
  await expect(page).toHaveURL(/\/applications\/workshop-saturdays-[^/?]+\?tab=reviews$/);

  await page.getByRole("button", { name: "Demo guide", exact: true }).click();
  await guide.getByRole("link", { name: "Check the round budget" }).click();

  await expect(page).toHaveTitle("Local Connections 2027 · Merit");
  await expect(page.getByRole("region", { name: "Round summary", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Applications/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(guide).toHaveCount(0);
  expect(new URL(page.url()).pathname.split("/rounds/")[0]).toBe(workspacePath);
  expect(documentRequests).toEqual([]);
  await checkPage(page);
});

test("product theme is present in server-rendered HTML", async ({ request }) => {
  const response = await request.get("/demo/workshop-saturdays");

  expect(response.ok()).toBe(true);
  expect(await response.text()).toMatch(/<html[^>]*data-product-theme/);
});

test(
  "page recovery preserves the active demo workspace navigation",
  { tag: "@cross-browser" },
  async ({ page, browserErrors }, testInfo) => {
    await page.goto("/app");

    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    await expect(page.getByRole("main")).toBeFocused();

    const root = await openDemo(page);
    await expect(page.getByRole("main")).toBeFocused();
    await page.goto(`${root}/applications/missing`);

    await expect(page.getByRole("heading", { name: "Application not available" })).toBeVisible();
    // AppPage focuses main after hydration; navigation links must be interactive.
    await expect(page.getByRole("main")).toBeFocused();

    await openNavigation(page);

    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    await page.getByRole("link", { name: "Funding rounds", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${root}/rounds$`));
    await expect(page.getByRole("heading", { name: "Funding rounds", exact: true })).toBeVisible();

    browserErrors.splice(0).forEach((error) =>
      expect(error).toMatchObject({
        type: "console",
        message: expect.stringMatching(/Failed to load resource.*404/),
      }),
    );
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("demo-recovery.png") });
  },
);

test("workspace URLs preserve review state and canonicalize stale titles", async ({
  page,
}, testInfo) => {
  await openDemoApplication(page, "Workshop Saturdays", true);
  const canonical = new URL(page.url());
  const publicId = canonical.pathname.split("-").at(-1)!;
  const prefix = canonical.pathname.slice(0, canonical.pathname.lastIndexOf("/") + 1);
  await page.goto(`${prefix}previous-name-${publicId}?tab=reviews`);

  await expect(page).toHaveURL(canonical.href);
  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Reviewer assessments", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back to application", exact: true }).click();

  await expect(
    page.getByRole("region", { name: "Applicant submission", exact: true }),
  ).toBeVisible();

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("workspace-application.png") });
  await page.getByRole("link", { name: "Local Connections 2027", exact: true }).click();

  await expect(page).toHaveURL(
    /\/app\/demo-[^/]+\/rounds\/local-connections-2027-[^/?]+\?section=applications$/,
  );
});

test("docs topics, section links, and examples work across screen sizes @cross-browser", async ({
  page,
}, testInfo) => {
  const openGuide = async (path: string) => {
    await page.goto(path);
    // Wait for hydration before following the server-rendered links.
    await expect(page.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible();
  };

  const checkContents = async () => {
    const headings = page.getByRole("article").getByRole("heading", { level: 2 });
    const ids = await headings.evaluateAll((elements) => elements.map((element) => element.id));

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }

    const contents = page.getByRole("navigation", { name: "On this page", includeHidden: true });

    await expect(contents).toHaveCount(2);

    for (const navigation of await contents.all()) {
      const targets = await navigation
        .getByRole("link", { includeHidden: true })
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

      expect(targets).toEqual(ids.map((id) => `#${id}`));
    }
  };

  await openGuide("/docs");

  await expect(page).toHaveTitle("Docs · Merit");
  await expect(page.locator('a[href="/docs/administration"]')).toHaveCount(0);
  expect((await page.request.get("/docs/administration")).status()).toBe(404);

  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("docs-overview.png") });
  await page.getByRole("link", { name: "Read the demo walkthrough", exact: true }).click();

  await expect(page).toHaveTitle("Explore the demo · Merit");
  await expect(page.getByRole("link", { name: "Try Workshop Saturdays" })).toHaveAttribute(
    "href",
    "/demo/workshop-saturdays",
  );

  await checkContents();
  await checkPage(page);

  for (const [slug, title] of [
    ["workspaces", "Join a workspace"],
    ["rounds", "Prepare a funding round"],
    ["applications", "Record and revise applications"],
    ["contacts", "Manage contacts"],
    ["recommendations", "Review and recommend"],
    ["reviews", "Complete a review"],
    ["team", "Manage your team"],
    ["mcp", "Connect through MCP"],
  ]) {
    if (testInfo.project.use.isMobile) {
      await page.locator("summary").filter({ hasText: "Browse docs" }).click();
    }
    const navigation = page
      .getByRole("navigation", { name: "Documentation topics" })
      .filter({ visible: true });
    await navigation.getByRole("link", { name: title, exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/docs/${slug}$`));

    const activeLinks = page
      .getByRole("navigation", { name: "Documentation topics" })
      .filter({ visible: true })
      .locator('a[aria-current="page"]');

    if (!testInfo.project.use.isMobile) {
      await expect(activeLinks).toHaveCount(1);
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
    await expect(page).toHaveTitle(`${title} · Merit`);

    await checkContents();
    await checkPage(page);

    if (testInfo.project.use.isMobile) {
      await expect(page.locator("details").first()).not.toHaveAttribute("open");
    }
  }

  await openGuide("/docs/reviews");
  await page.getByRole("link", { name: "Complete your review through an MCP client" }).click();

  await expect(page).toHaveURL(/\/docs\/mcp#first-request$/);
  await expect(page.locator("#first-request")).toBeInViewport();

  await openGuide("/docs/rounds#applications");
  await page.getByRole("link", { name: "Learn how to record and prepare an application" }).click();

  await expect(page).toHaveURL(/\/docs\/applications$/);

  const contactGuide = page.getByRole("link", { name: "Understand shared contact details" });
  await contactGuide.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/docs\/contacts#details$/);
  await expect(page.locator("#details")).toBeInViewport();
  await page.getByRole("link", { name: "Record or update an application’s contact" }).click();

  await expect(page).toHaveURL(/\/docs\/applications#prepare$/);
  await expect(page.locator("#prepare")).toBeInViewport();

  await openGuide("/docs/rounds#revisions");
  await page.getByRole("link", { name: "Follow the correction and revision steps" }).click();

  await expect(page).toHaveURL(/\/docs\/applications#revisions$/);
  await expect(page.locator("#revisions")).toBeInViewport();

  await openGuide("/docs/recommendations#budget");

  await expect(page.locator("#budget")).toBeInViewport();

  const budgetExample = page.locator('section[aria-labelledby="budget"]').getByRole("table");

  await expect(budgetExample.getByRole("row", { name: "Fund €24,000", exact: true })).toBeVisible();
  await expect(
    budgetExample.getByRole("row", { name: "Remaining if approved €8,000", exact: true }),
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("docs-budget.png"), fullPage: true });
});

test("docs recommendation example previews, saves, and resets without changing stored work", async ({
  page,
}, testInfo) => {
  await openDemoApplication(page, "Neighbour Table");
  await page.getByRole("button", { name: "Edit recommendation for Neighbour Table" }).click();
  await page
    .getByRole("textbox", { name: "Reasoning", exact: true })
    .fill("Keep the saved workspace recommendation.");
  await page.getByRole("button", { name: "Save recommendation", exact: true }).click();

  await expect(
    page.getByText("Keep the saved workspace recommendation.", { exact: true }),
  ).toBeVisible();

  const workspaceApplication = page.url();
  await page.goto("/docs/recommendations#budget");
  const example = page.getByRole("group", { name: "Try a different recommendation", exact: true });
  const edit = example.getByRole("button", { name: "Edit recommendation for Neighbour Table" });
  await expect(edit).toHaveText("Edit recommendation");
  await edit.click();
  const position = example.getByRole("button", { name: /Recommendation$/ });
  const amount = example.getByRole("textbox", { name: "Proposed allocation" });
  const preview = example.getByRole("status", { name: "Budget preview" });

  await expect(preview).toHaveText("Remaining with draft €8,000");

  await amount.fill("40000");

  await expect(preview).toHaveText("Over budget with draft €8,000");

  await checkPage(page);
  await example.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("docs-recommendation-example.png") });

  await position.click();
  await page.getByRole("option", { name: "Defer", exact: true }).click();

  await expect(amount).toHaveCount(0);
  await expect(preview).toHaveText("Remaining with draft €32,000");

  await example.getByRole("textbox", { name: "Reasoning" }).fill("Wait for the next round.");
  await example.getByRole("button", { name: "Save recommendation" }).click();

  await expect(example.getByRole("form")).toHaveCount(0);
  await expect(example.getByText("Wait for the next round.", { exact: true })).toBeVisible();
  await expect(edit).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(preview).toHaveText("Remaining with draft €32,000");

  await example.getByRole("textbox", { name: "Reasoning" }).fill("Discard this change.");
  await example.getByRole("button", { name: "Discard changes", exact: true }).click();

  await expect(example.getByText("Wait for the next round.", { exact: true })).toBeVisible();

  await page.reload();
  await edit.click();

  await expect(amount).toHaveValue("24000.00");
  await expect(preview).toHaveText("Remaining with draft €8,000");

  await page.goto(workspaceApplication);

  await expect(
    page.getByText("Keep the saved workspace recommendation.", { exact: true }),
  ).toBeVisible();
});

test("docs contents follow reading position and close after section selection @cross-browser", async ({
  page,
}, testInfo) => {
  const contents = page.getByRole("navigation", { name: "On this page", includeHidden: true });
  const currentLinks = contents.locator('a[aria-current="location"]');

  const expectCurrent = async (id: string) => {
    await expect(currentLinks).toHaveCount(2);

    for (const link of await currentLinks.all()) {
      await expect(link).toHaveAttribute("href", `#${id}`);
    }
  };

  const chooseSection = async (name: string) => {
    if (testInfo.project.use.isMobile) {
      await page.getByText("On this page", { exact: true }).filter({ visible: true }).click();
    }
    const link = contents.filter({ visible: true }).getByRole("link", { name, exact: true });
    await link.focus();
    await page.keyboard.press("Enter");
  };

  await page.goto("/docs/recommendations#budget");
  await expectCurrent("budget");
  const historyLength = await page.evaluate(() => history.length);
  await page.locator("#reviews").evaluate((heading) => heading.scrollIntoView());
  await expectCurrent("reviews");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectCurrent("saving");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectCurrent("application");

  await expect(page).toHaveURL(/\/docs\/recommendations#budget$/);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  await chooseSection("Understand review status");

  await expect(page).toHaveURL(/#reviews$/);
  await expect(page.locator("#reviews")).toBeFocused();
  await expect(page.locator("#reviews")).toBeInViewport();

  await expectCurrent("reviews");

  if (testInfo.project.use.isMobile) {
    await expect(page.getByRole("article").locator("details")).not.toHaveAttribute("open");
  }

  await chooseSection("Check the budget effect");

  await expect(page.locator("#budget")).toBeFocused();

  await expectCurrent("budget");
  await page.goBack();

  await expect(page).toHaveURL(/#reviews$/);

  await expectCurrent("reviews");
  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath("docs-current-section.png") });

  await page.goto("/docs/workspaces");
  await expectCurrent("joining");
  await chooseSection("Find and switch workspaces");

  await expect(page.locator("#switching")).toBeFocused();
  await expect(page.locator("#switching")).toBeInViewport();

  await expectCurrent("switching");
});

test("MCP URL copy confirms success and explains clipboard failure", async ({ page }, testInfo) => {
  await page.goto("/docs/mcp");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { copiedDocsUrl?: string }).copiedDocsUrl = value;
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy URL", exact: true }).click();

  await expect(page.getByRole("status")).toHaveText("URL copied");
  expect(
    await page.evaluate(() => (window as Window & { copiedDocsUrl?: string }).copiedDocsUrl),
  ).toBe("http://localhost:3001/mcp/workspace");
  await expect(page).toHaveTitle("Connect through MCP · Merit");

  await page.screenshot({ path: testInfo.outputPath("mcp-guide.png"), fullPage: true });
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard unavailable");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy URL", exact: true }).click();

  await expect(page.getByRole("status")).toHaveText("Copy failed. Select and copy the URL above.");
});

test("demo visitors have independent saved work and reset replaces only the current workspace", async ({
  page,
  newContext,
  browserErrors,
}) => {
  await openDemoApplication(page, "Neighbour Table");
  const firstApplication = page.url();
  await page.getByRole("button", { name: "Edit recommendation for Neighbour Table" }).click();
  await page
    .getByRole("textbox", { name: "Reasoning", exact: true })
    .fill("A recommendation saved by this visitor.");
  await page.getByRole("button", { name: "Save recommendation", exact: true }).click();

  await expect(
    page.getByText("A recommendation saved by this visitor.", { exact: true }),
  ).toBeVisible();

  const otherContext = await newContext();

  try {
    const other = await otherContext.newPage();
    await openDemoApplication(other, "Neighbour Table");
    const otherApplication = other.url();

    expect(otherApplication).not.toBe(firstApplication);
    await expect(
      other.getByText("A recommendation saved by this visitor.", { exact: true }),
    ).toHaveCount(0);

    await page.goto("/demo");

    await expect(page).toHaveURL(/\/app\/demo-[^/]+\/rounds$/);

    await page.goto(firstApplication);

    await expect(
      page.getByText("A recommendation saved by this visitor.", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Edit recommendation for Neighbour Table" }).click();
    await page
      .getByRole("textbox", { name: "Reasoning", exact: true })
      .fill("Unfinished before demo reset.");
    await expect.poll(() => localRecovery(page)).toContain("Unfinished before demo reset.");
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          sessionStorage.setItem("merit:drafts:v1:real-account:recommendations", "preserved");
          const request = indexedDB.open("merit-drafts");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction("drafts", "readwrite");
            transaction.objectStore("drafts").put({
              scope: "real-account",
              kind: "recommendations",
              key: "real-workspace/application",
              token: crypto.randomUUID(),
              version: 1,
              value: { reasoning: "Preserve real-account writing." },
            });
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
    );

    await page.getByRole("button", { name: "Demo guide", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Demo guide", exact: true })
      .getByRole("button", { name: "Reset demo", exact: true })
      .click();
    const confirm = page
      .getByRole("dialog", { name: "Reset the demo?" })
      .getByRole("button", { name: "Reset demo", exact: true });
    await confirm.click();

    await expect(page).toHaveURL(/\/app\/demo-[^/]+\/rounds$/);

    const replacementRoot = new URL(page.url()).pathname.replace(/\/rounds$/, "");

    expect(new URL(firstApplication).pathname.startsWith(`${replacementRoot}/`)).toBe(false);
    await expect.poll(() => localRecovery(page)).not.toContain("Unfinished before demo reset.");
    await expect.poll(() => localRecovery(page)).toContain("Preserve real-account writing.");
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("merit:drafts:v1:real-account:recommendations"),
      ),
    ).toBe("preserved");

    await page.goto(firstApplication);

    // The replaced demo workspace is gone, so its frame recovers to the replacement.
    await expect(page.getByRole("heading", { name: "Workspace not available" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Merit" })).toHaveAttribute(
      "href",
      `${replacementRoot}/rounds`,
    );

    await other.reload();

    await expect(other).toHaveURL(otherApplication);
    await expect(
      other.getByRole("heading", { name: "Neighbour Table", exact: true }),
    ).toBeVisible();

    browserErrors.splice(0).forEach((error) =>
      expect(error).toMatchObject({
        type: "console",
        message: expect.stringMatching(/Failed to load resource.*404/),
      }),
    );
  } finally {
    await otherContext.close();
  }
});
