import { test, expect } from "./workspace-test.ts";

for (const action of ["Close", "Discard draft"]) {
  test(`creation ${action} retains its form throughout dismissal`, async ({ page }) => {
    await page.goto("/app/alder/rounds");

    await expect(page.getByRole("main")).toBeFocused();

    const trigger = page.getByRole("button", { name: "Create funding round", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Create funding round" });

    await expect(dialog.getByRole("textbox", { name: "Round name" })).toBeFocused();

    if (action === "Discard draft") {
      await dialog.getByRole("textbox", { name: "Round name" }).fill("Draft to discard");
    }

    await expect(page.locator("[data-entering]")).toHaveCount(0);

    const dismissal = await dialog.evaluate(async (element, closeLabel) => {
      const height = element.getBoundingClientRect().height;
      const fields = element.querySelectorAll("input, textarea").length;
      const title = element.querySelector("input")!.value;
      Array.from(element.querySelectorAll<HTMLButtonElement>("button"))
        .find(
          (button) =>
            button.getAttribute("aria-label") === closeLabel ||
            button.textContent?.trim() === closeLabel,
        )!
        .click();

      for (let frame = 0; frame < 30; frame++) {
        await new Promise(requestAnimationFrame);
        if (!element.isConnected) {
          return "dismissed";
        }
        if (
          element.getBoundingClientRect().height !== height ||
          element.querySelectorAll("input, textarea").length !== fields ||
          element.querySelector("input")?.value !== title
        ) {
          return "collapsed before dismissal";
        }
      }

      return "still open";
    }, action);

    expect(dismissal).toBe("dismissed");
    await expect(trigger).toBeFocused();

    await trigger.click();

    await expect(dialog.getByRole("textbox", { name: "Round name" })).toHaveValue("");

    await page.keyboard.press("Escape");

    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test("create, prepare, reconcile and delete an empty funding round", async ({ page }, testInfo) => {
  const title = `Community grants ${testInfo.project.name}`;
  await page.goto("/app/alder/rounds");

  await expect(page).toHaveTitle("Funding rounds · Merit");
  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Create funding round", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Create funding round" });
  await dialog.getByRole("button", { name: "Create funding round", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("Enter a round name");

  await dialog.getByRole("textbox", { name: "Round name" }).fill(title);
  await dialog.getByRole("button", { name: "Create funding round", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/alder\/rounds\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  const roundUrl = page.url();

  await expect(page.getByText("Preparing", { exact: true })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "Not set" })).toBeVisible();
  await expect(page.getByText("Not scheduled", { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.getByRole("button", { name: title, exact: true }).click();
  const nameEditor = page.getByRole("textbox", { name: "Edit round name" });
  await nameEditor.fill(`${title} renamed`);
  await page.screenshot({ path: testInfo.outputPath("inline-round-name.png") });
  await nameEditor.press("Enter");

  await expect(page.getByRole("heading", { name: `${title} renamed`, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();

  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit purpose", exact: true }).click();
  dialog = page.getByRole("form", { name: "Edit purpose" });

  await expect(dialog.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await expect(page.getByRole("button", { name: "Edit purpose", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit purpose", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Purpose" })
    .fill("Build lasting neighbourhood connections.");
  await page.screenshot({ path: testInfo.outputPath("inline-round-purpose.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Funding rounds", exact: true })
    .click();
  await page.getByRole("link", { name: title, exact: true }).click();
  await page.reload();

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Continue editing purpose", exact: true }).click();

  await expect(dialog.getByRole("textbox", { name: "Purpose" })).toHaveValue(
    "Build lasting neighbourhood connections.",
  );

  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Build lasting neighbourhood connections.", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Edit committee date:/ }).click();
  dialog = page.getByRole("dialog", { name: "Edit committee date" });
  await dialog.getByLabel("Committee date", { exact: true }).fill("2027-03-15");
  await page.screenshot({ path: testInfo.outputPath("round-date-editor.png") });
  await dialog.getByRole("textbox", { name: "Committee date" }).press("Enter");

  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit committee date: 15 March 2027" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit criteria", exact: true }).click();
  dialog = page.getByRole("form", { name: "Edit criteria" });
  await dialog.getByRole("button", { name: "Add criterion" }).click();
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Community need");
  await dialog
    .getByRole("textbox", { name: "Reviewer guidance" })
    .fill("Consider evidence from the people the project will reach.");
  await dialog.getByRole("button", { name: "Add criterion" }).click();
  await dialog.getByRole("textbox", { name: "Title", exact: true }).nth(1).fill("Feasibility");

  await expect(dialog.getByRole("textbox", { name: "Title", exact: true }).nth(1)).toBeFocused();

  await dialog.getByRole("button", { name: "Add criterion" }).click();
  await dialog.getByRole("textbox", { name: "Title", exact: true }).nth(2).fill("Impact");
  await dialog.getByRole("button", { name: "Move up criterion 3" }).focus();
  await page.keyboard.press("Enter");

  await expect(dialog.getByRole("button", { name: "Move up criterion 2" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(dialog.getByRole("textbox", { name: "Title", exact: true }).first()).toBeFocused();

  await dialog.getByRole("button", { name: "Remove criterion 1" }).click();

  await expect(dialog.getByRole("textbox", { name: "Title", exact: true }).first()).toBeFocused();

  await dialog.getByRole("button", { name: "Move up criterion 2" }).click();
  const fullViewport = page.viewportSize()!;
  await page.setViewportSize({ width: fullViewport.width, height: 440 });
  await dialog.getByRole("button", { name: "Save changes" }).scrollIntoViewIfNeeded();
  const saveBox = await dialog.getByRole("button", { name: "Save changes" }).boundingBox();

  expect(saveBox!.y + saveBox!.height).toBeLessThan(page.viewportSize()!.height);
  expect(saveBox!.y).toBeGreaterThan(0);

  await page.screenshot({ path: testInfo.outputPath("criteria-short-viewport.png") });
  await page.setViewportSize(fullViewport);
  await page.screenshot({ path: testInfo.outputPath("round-criteria.png"), fullPage: true });

  await expect(dialog.getByRole("textbox", { name: "Title", exact: true }).first()).toHaveValue(
    "Feasibility",
  );

  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Feasibility", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Edit budget:/ }).click();
  dialog = page.getByRole("dialog", { name: "Edit budget" });
  await dialog.getByRole("textbox", { name: "Round budget" }).fill("100.123");
  await dialog.getByRole("button", { name: "Update budget", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("no more than two decimal places");
  await expect(dialog.getByRole("textbox", { name: "Round budget" })).toHaveValue("100.123");

  await dialog.getByRole("textbox", { name: "Round budget" }).fill("0");
  await dialog.getByRole("button", { name: "Update budget", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "€0" })).toBeVisible();

  await page.getByRole("button", { name: /^Edit budget:/ }).click();
  await dialog.getByRole("textbox", { name: "Round budget" }).fill("1250.75");
  await dialog.getByRole("button", { name: "Update budget", exact: true }).click();

  await expect(dialog.getByRole("alert").filter({ hasText: "Explain why" })).toBeVisible();

  await dialog
    .getByRole("textbox", { name: "Reason for change" })
    .fill("Board approved the allocation.");
  await dialog.getByRole("button", { name: "Update budget", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "€1,250.75" })).toBeVisible();

  await page.getByRole("button", { name: /^Edit budget:/ }).click();

  await expect(dialog.getByRole("button", { name: "Update budget" })).toBeDisabled();
  await expect(dialog.getByRole("textbox", { name: "Reason for change" })).not.toHaveAttribute(
    "aria-required",
    "true",
  );
  await expect(
    dialog.getByText("Board approved the allocation.", { exact: true }),
  ).not.toBeVisible();

  await dialog.getByText("Budget history", { exact: true }).click();

  await expect(dialog.getByText("via Merit web", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("Board approved the allocation.", { exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("round-budget-history.png") });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Assign manager:/ }).click();
  dialog = page.getByRole("dialog", { name: "Assign manager" });
  await page.screenshot({ path: testInfo.outputPath("round-manager-picker.png") });
  await dialog.getByRole("option", { selected: false }).first().click();

  await expect(dialog).not.toBeVisible();

  const competing = await page.context().newPage();
  await competing.goto(roundUrl);

  await expect(competing.getByRole("main")).toBeFocused();

  await competing.getByRole("button", { name: "Edit purpose", exact: true }).click();
  await competing.getByRole("textbox", { name: "Purpose" }).fill("A competing purpose draft.");
  await page.getByRole("button", { name: "Edit purpose", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Purpose" })
    .fill("Updated purpose from the first manager.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByRole("form", { name: "Edit purpose" })).not.toBeVisible();

  await page.getByRole("button", { name: /^Edit committee date:/ }).click();
  await page.getByRole("textbox", { name: "Committee date", exact: true }).fill("2027-04-20");
  await page.getByRole("textbox", { name: "Committee date", exact: true }).press("Enter");

  await expect(page.getByRole("dialog")).not.toBeVisible();

  await competing.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(competing.getByText("Latest saved values", { exact: true })).toBeVisible();
  await expect(
    competing
      .getByRole("form")
      .getByText("Updated purpose from the first manager.", { exact: true }),
  ).toBeVisible();
  await expect(competing.getByRole("textbox", { name: "Purpose" })).toHaveValue(
    "A competing purpose draft.",
  );
  await expect(competing.getByRole("button", { name: "Apply choices to draft" })).toBeDisabled();

  await competing.getByRole("button", { name: /Value to keep for Purpose/ }).click();
  await competing.getByRole("option", { name: "Keep my value" }).click();
  await competing.getByRole("button", { name: "Apply choices to draft" }).click();
  await competing.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(competing.getByRole("form", { name: "Edit purpose" })).not.toBeVisible();
  await expect(
    competing.getByRole("button", { name: "Edit committee date: 20 April 2027" }),
  ).toBeVisible();

  await competing.close();
  await page.reload();

  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByText("A competing purpose draft.", { exact: true })).toBeVisible();
  await expect(page.getByText("Preparing", { exact: true })).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );

  await page.screenshot({ path: testInfo.outputPath("prepared-round.png"), fullPage: true });

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete round", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Delete this empty round?" });

  await expect(dialog).toContainText(title);

  await dialog.getByRole("button", { name: "Delete round", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/alder\/rounds$/);
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);

  await page.goto(roundUrl);

  await expect(page.getByRole("heading", { name: "Round not available" })).toBeVisible();
});
