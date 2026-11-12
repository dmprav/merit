import { test, expect, checkPage } from "@merit/test-support/browser";

test(
  "team refresh recovery returns focus to the active directory",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-team-manage-team--saved-but-refresh-failed&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const refresh = page.getByRole("button", { name: "Refresh team" });

    await expect(refresh).toBeFocused();
    await refresh.press("Enter");

    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(refresh).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Invitations/ })).toBeFocused();
    await expect(page.getByRole("table", { name: "Invitations" })).toContainText(
      "leah@example.test",
    );
    await checkPage(page);
  },
);

test(
  "owner invitation revocation returns focus to the next action",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-administration-organization-details--confirm-revocation&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const dialog = page.getByRole("dialog", { name: "Revoke invitation" });

    await dialog.getByRole("button", { name: "Revoke invitation", exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Needs an owner", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite owner" })).toBeFocused();
    await checkPage(page);
  },
);

test(
  "owner refresh recovery returns focus to the joined owner",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto(
      "/iframe.html?id=features-administration-organization-details--owner-joined-after-refresh&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    await expect(page.getByRole("region", { name: "Owner" })).toBeFocused();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resend invitation" })).toHaveCount(0);
    await checkPage(page);
  },
);

test(
  "expanded translated copy keeps invitation drafts usable in narrow layouts",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(
      "/iframe.html?id=features-workspace-request-access--expanded-copy&viewMode=story",
    );
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const dialog = page.getByRole("dialog");
    const input = dialog.getByRole("textbox", {
      name: "⟦Email address where you would like to receive your invitation⟧",
    });
    const submit = dialog.getByRole("button", {
      name: "⟦Submit this request for a workspace invitation⟧",
    });
    const close = dialog
      .getByRole("button", {
        name: "⟦Close this invitation request⟧",
        exact: true,
      })
      .first();

    await input.fill("unfinished@");
    await submit.click();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Resume invitation request" }).click();
    await expect(input).toHaveValue("unfinished@");
    await input.fill("visitor@example.test");
    await submit.click();
    await expect(dialog.getByRole("alert")).toContainText("Your email address is still here");
    await expect(input).toHaveValue("visitor@example.test");

    for (const fontSize of ["100%", "200%"]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, fontSize);
      await expect
        .poll(() => dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
        .toBe(true);
      await expect
        .poll(() => submit.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
        .toBe(true);
      await input.focus();
      await expect(input).toBeInViewport();
      await input.press("ArrowRight");
      await input.press("Backspace");
      await input.press("t");
      await expect(input).toBeInViewport();
      await checkPage(page);
      await input.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`expanded-copy-${fontSize}.png`) });
      await submit.focus();
      await expect(submit).toBeInViewport();
      await expect(input).toHaveValue("visitor@example.test");
      await page.screenshot({ path: testInfo.outputPath(`expanded-copy-actions-${fontSize}.png`) });
      await close.focus();
      await expect(close).toBeInViewport({ ratio: 1 });
    }

    for (const width of [900, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await input.focus();
      await expect(input).toBeInViewport({ ratio: 1 });
      await input.press("ArrowRight");
      await input.press("Backspace");
      await input.press("t");
      await expect(input).toBeInViewport({ ratio: 1 });
      await submit.focus();
      await expect(submit).toBeInViewport({ ratio: 1 });
    }
    await close.click();
    await page.getByRole("button", { name: "Resume invitation request" }).click();
    await expect(input).toHaveValue("visitor@example.test");
  },
);

test(
  "demo guide keeps utilities reachable with enlarged text",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto("/iframe.html?id=features-demo-guidance--open&viewMode=story");
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const guide = page.getByRole("dialog", { name: "Demo guide", exact: true });
    const content = guide.getByRole("region", { name: "Demo guide", exact: true });
    const exit = guide.getByRole("link", { name: "Exit demo" });
    const reset = guide.getByRole("button", { name: "Reset demo", exact: true });

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("demo-guide.png") });
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.getByRole("button", { name: "Demo guide", exact: true }).click();

    await expect
      .poll(() => guide.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
      .toBe(true);
    await expect(guide.getByRole("heading", { name: "Demo guide", exact: true })).toBeInViewport({
      ratio: 1,
    });
    // Enlarged prose scrolls within the guide; the heading stays visible above it.
    const task = guide.getByRole("heading", { name: "Review a revised request" });
    await task.scrollIntoViewIfNeeded();
    await expect(task).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("demo-guide-enlarged-reading.png") });
    await content.focus();
    await page.keyboard.press("End");
    await reset.focus();
    await expect(exit).toBeInViewport();
    await expect(reset).toBeInViewport();
    await expect(guide.getByRole("heading", { name: "Demo guide", exact: true })).toBeInViewport();
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("demo-guide-enlarged.png") });
    await page.emulateMedia({ forcedColors: "active" });
    await exit.focus();
    await expect(exit).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("demo-guide-forced-colors.png") });
    await reset.click();
    await expect(page.getByRole("dialog", { name: "Reset the demo?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep my changes" }).click();
    await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeFocused();
  },
);

test(
  "invitation recovery leads with the problem and keeps recipients readable",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto("/iframe.html?id=features-team-invitations--delivery-states&viewMode=story");
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const table = page.getByRole("table", { name: "Invitations" });
    const failed = table.getByRole("row").filter({ hasText: "Email sending failed" });
    const recipient = failed.getByRole("cell").first();
    const address = recipient.getByText(
      "alexandria.montgomery-worthington@community-partnerships.example.org",
      { exact: true },
    );
    const failure = failed.getByText("Email sending failed");
    const acceptance = failed.getByText("Awaiting acceptance");
    const resend = failed.getByRole("button", { name: /Resend invitation to/ });

    expect((await failure.boundingBox())!.y).toBeLessThan((await acceptance.boundingBox())!.y);
    await expect(resend).toBeVisible();
    expect((await resend.boundingBox())!.y).toBeGreaterThan((await acceptance.boundingBox())!.y);
    if (!testInfo.project.use.isMobile) {
      expect((await recipient.boundingBox())!.width).toBeGreaterThan(
        (await failed.getByRole("cell").nth(1).boundingBox())!.width * 1.8,
      );
      // The long fixture should use at most two lines with the wider recipient column.
      expect((await address.boundingBox())!.height).toBeLessThanOrEqual(
        await address.evaluate((node) => parseFloat(getComputedStyle(node).lineHeight) * 2 + 1),
      );
    }
    for (const cell of await table.getByRole("cell").all()) {
      expect(await cell.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("invitation-recovery.png") });
  },
);

test(
  "contact history keeps comparison readable and returns to the directory",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto("/iframe.html?id=features-contacts-directory--long-history&viewMode=story");
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const dialog = page.getByRole("dialog", { name: "Contact history" });
    const history = dialog.getByRole("region", { name: "Contact history" });
    const before = await dialog
      .getByRole("group", { name: "Before", exact: true })
      .first()
      .boundingBox();
    const saved = await dialog
      .getByRole("group", { name: "Saved", exact: true })
      .nth(1)
      .boundingBox();

    expect(before).not.toBeNull();
    expect(saved).not.toBeNull();
    if (testInfo.project.use.isMobile) {
      expect(saved!.y).toBeGreaterThan(before!.y + before!.height);
    } else {
      expect(saved!.y).toBeCloseTo(before!.y, 0);
      expect(saved!.x).toBeGreaterThan(before!.x + before!.width);
    }
    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("contact-history.png") });
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    const closeTop = (await close.boundingBox())!.y;

    await history.focus();
    await page.keyboard.press("End");

    await expect.poll(() => history.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    expect((await close.boundingBox())!.y).toBeCloseTo(closeTop, 0);
    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Contact history for Leah Martin" }),
    ).toBeFocused();
    await expect(page.getByRole("table", { name: "Contacts" })).toBeVisible();
  },
);

test(
  "contact archive and restore preserve the filter and focus after removing a row",
  { tag: "@cross-browser" },
  async ({ page }) => {
    await page.goto("/iframe.html?id=features-contacts-directory--overview&viewMode=story");
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    const search = page.getByRole("textbox", { name: "Find a contact" });
    const actions = page.getByRole("button", { name: "Actions for Leah Martin" });
    const add = page.getByRole("button", { name: "Add contact", exact: true });
    await search.fill("Leah");
    await actions.click();
    await page.getByRole("menuitem", { name: "Archive", exact: true }).click();

    await expect(actions).toHaveCount(0);
    await expect(page.getByText("No contacts match your search.")).toBeVisible();
    await expect(add).toBeFocused();
    await expect(search).toHaveValue("Leah");

    await page.getByRole("button", { name: /Status/ }).click();
    await page.getByRole("option", { name: "Archived", exact: true }).click();
    await actions.click();
    await page.getByRole("menuitem", { name: "Restore", exact: true }).click();

    await expect(actions).toHaveCount(0);
    await expect(page.getByText("No contacts match your search.")).toBeVisible();
    await expect(add).toBeFocused();
    await expect(search).toHaveValue("Leah");

    await page.getByRole("button", { name: /Status/ }).click();
    await page.getByRole("option", { name: "Active", exact: true }).click();
    await expect(actions).toBeVisible();
    await checkPage(page);
  },
);

test(
  "contact search keeps the toolbar stable and supporting content aligned",
  { tag: "@cross-browser" },
  async ({ page }, testInfo) => {
    await page.goto("/iframe.html?id=features-contacts-directory--overview&viewMode=story");
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    const search = page.getByRole("textbox", { name: "Find a contact" });
    const clear = page.getByRole("button", { name: "Clear search" });
    const table = page.getByRole("table", { name: "Contacts" });
    const tableTop = (await table.boundingBox())!.y;
    const fieldBounds = (await search.boundingBox())!;
    const clearBounds = (await clear.boundingBox())!;

    await expect(clear).toBeDisabled();
    expect(clearBounds.y + clearBounds.height).toBeCloseTo(fieldBounds.y + fieldBounds.height, 0);
    await search.fill("Leah");

    await expect(clear).toBeEnabled();
    expect((await table.boundingBox())!.y).toBeCloseTo(tableTop, 0);
    await clear.click();

    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    expect((await table.boundingBox())!.y).toBeCloseTo(tableTop, 0);
    const name = table.getByText("Leah Martin", { exact: true });
    const supporting = table.getByText("Neighbour Table", { exact: true });
    expect((await supporting.boundingBox())!.x).toBeCloseTo((await name.boundingBox())!.x, 0);

    await checkPage(page);
    await page.screenshot({ path: testInfo.outputPath("contacts-toolbar.png") });
  },
);

test("administration invitation states and organization lists remain readable and accessible", async ({
  page,
}, testInfo) => {
  for (const id of [
    "features-administration-owner-invitation--sending-failed",
    "features-administration-owner-invitation--sending-unconfirmed",
    "features-administration-owner-invitation--expired",
    "features-administration-owner-invitation--joined",
    "features-administration-owner-invitation--revoked",
    "features-administration-owner-invitation--needs-administrator",
    "features-administration-owner-invitation--long-email",
    "features-administration-organizations--populated",
    "features-administration-organizations--empty",
  ]) {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");

    await checkPage(page);
    if (id.endsWith("--populated") || id.endsWith("--sending-failed")) {
      await page.screenshot({ path: testInfo.outputPath(`${id}.png`), fullPage: true });
    }
  }
});

for (const id of [
  "features-administration-create-organization--suggested-address",
  "features-administration-organization-details--confirm-replacement",
  "features-team-manage-team--demotion-consequences",
  "features-team-manage-team--removal-failure",
  "features-workspace-accept-invitation--administrator-without-grant-access",
  "features-workspace-entry-and-recovery--failed-application",
  "features-funding-rounds-manage-round--concurrent-edits",
  "features-funding-rounds-manage-round--budget-history",
  "features-funding-rounds-manage-round--resume-purpose",
  "features-funding-rounds-manage-round--resolved-conflict",
  "features-funding-rounds-manage-round--assign-manager",
  "features-funding-rounds-manage-round--criteria-with-reviews",
  "features-funding-rounds-manage-round--committee-date",
  "features-funding-rounds-manage-round--rename-round",
  "features-applications-manage-intake--working-revision",
  "features-applications-manage-intake--separate-editing-scopes",
  "features-applications-manage-intake--edit-contact-and-project-dates",
  "features-applications-manage-intake--history",
  "features-contacts-edit-contact--concurrent-changes",
  "features-contacts-contact-picker--add-contact",
  "features-applications-manage-reviews--create-reviewer",
  "features-applications-manage-reviews--concurrent-changes",
  "features-applications-manage-reviews--saved-but-refresh-failed",
  "features-workspace-request-access--rate-limited",
  "features-administration-access-requests--saved-but-refresh-failed",
  "features-demo-guidance--reset-failure",
]) {
  const quickPicker = [
    "features-funding-rounds-manage-round--committee-date",
    "features-funding-rounds-manage-round--assign-manager",
  ].includes(id);
  test(`feature composition: ${id}${quickPicker ? " @cross-browser" : ""}`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);

    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true");
    await expect(page.locator(".sb-show-errordisplay")).toHaveCount(0);
    await expect(page.getByRole("heading").first()).toBeVisible();

    await checkPage(page);
    const dialog = page.getByRole("dialog").last();
    if (await dialog.isVisible()) {
      // Popover content may scroll; its visible shell must fit the viewport.
      const bounds = await dialog.evaluate((node) => {
        const parent = node.parentElement!;
        const shell = getComputedStyle(parent).overflowY === "auto" ? parent : node;
        const { x, y, width, height } = shell.getBoundingClientRect();
        return { x, y, width, height };
      });
      const viewport = page.viewportSize()!;

      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    }

    if (id === "features-contacts-edit-contact--concurrent-changes") {
      await expect(dialog.getByRole("heading", { name: "Edit contact details" })).toBeInViewport();
      await expect(
        dialog.getByRole("button", { name: "Save contact", exact: true }),
      ).toBeInViewport();
    }
    if (id === "features-funding-rounds-manage-round--committee-date") {
      const field = await dialog.getByRole("textbox", { name: "Committee date" }).boundingBox();
      const save = await dialog.getByRole("button", { name: "Save date" }).boundingBox();

      expect(Math.abs(field!.y + field!.height / 2 - save!.y - save!.height / 2)).toBeLessThan(2);
      const clear = dialog.getByRole("button", { name: "Clear date" });
      await clear.scrollIntoViewIfNeeded();

      await expect(clear).toBeInViewport();
    }
    if (id === "features-applications-manage-intake--working-revision") {
      const preview = dialog.getByRole("region", { name: "Review saved working revision" });
      await preview
        .getByText("Include accessible transport to the venue.")
        .scrollIntoViewIfNeeded();

      await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
      await expect(
        preview.getByText("Include accessible transport to the venue."),
      ).toBeInViewport();

      await preview.evaluate((element) => {
        element.scrollTop = 0;
      });
    }
    await page.screenshot({ path: testInfo.outputPath(`${id}.png`), fullPage: true });
    if (quickPicker) {
      const isDate = id.endsWith("--committee-date");
      await dialog.getByRole("button", { name: isDate ? "Cancel" : "Close", exact: true }).click();

      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: isDate ? /^Edit committee date:/ : /^Assign manager:/ }),
      ).toBeFocused();
    }
  });
}
