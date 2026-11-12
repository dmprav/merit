import { test, expect } from "./workspace-test.ts";

test("contacts and reviews preserve judgments across application and criteria changes", async ({
  page,
}, testInfo) => {
  const stamp = testInfo.project.name;
  const sam = `Sam review ${stamp}`;
  const jules = `Jules review ${stamp}`;
  await page.goto("/app/alder/contacts");

  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();

  for (const name of [sam, jules]) {
    await page.getByRole("button", { name: "Add contact", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add contact", exact: true });
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await dialog
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(name.startsWith("Sam") ? `sam.${stamp}@example.test` : `jules.${stamp}@example.test`);
    await dialog.getByRole("button", { name: "Save contact", exact: true }).click();

    await expect(dialog).not.toBeVisible();
  }

  await page.getByRole("textbox", { name: "Find a contact" }).fill(`${stamp}`);

  await page.goto("/app/alder/rounds");

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Create funding round", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Create funding round" });
  await dialog.getByRole("textbox", { name: "Round name" }).fill(`Review acceptance ${stamp}`);
  await dialog.getByRole("button", { name: "Create funding round", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: `Review acceptance ${stamp}`, exact: true }),
  ).toBeVisible();

  const roundUrl = page.url();
  await page.getByRole("button", { name: "Edit criteria", exact: true }).click();
  dialog = page.getByRole("form", { name: "Edit criteria" });
  await dialog.getByRole("button", { name: "Add criterion" }).click();
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Community connection");
  await dialog
    .getByRole("textbox", { name: "Reviewer guidance" })
    .fill("Consider who will participate.");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(dialog).not.toBeVisible();

  await page.getByRole("tab", { name: /Applications/ }).click();
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Add application" });
  await dialog
    .getByRole("textbox", { name: "Project title" })
    .fill("Workshop Saturdays acceptance");
  await dialog.getByRole("textbox", { name: "Applicant", exact: true }).fill("Repair Collective");
  await dialog.getByRole("textbox", { name: "Requested amount" }).fill("18000");
  await dialog
    .getByRole("textbox", { name: "Submitted material" })
    .fill("Repair workshops using a free venue.");
  await dialog.getByRole("button", { name: "Add application", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Workshop Saturdays acceptance", exact: true }),
  ).toBeVisible();

  const applicationUrl = page.url();
  await page.getByRole("button", { name: "Mark ready for review", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "Mark ready for review", exact: true }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
  await page.getByRole("button", { name: "Record assessment", exact: true }).click();
  await page
    .getByRole("form", { name: "Record assessment" })
    .getByRole("button", { name: "Close", exact: true })
    .click();

  await expect(page.getByRole("button", { name: "Resume editing", exact: true })).toHaveCount(0);

  for (const name of [sam, jules]) {
    await page.getByRole("button", { name: "Add review request", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Add review request" });
    await picker.getByRole("textbox", { name: "Find a contact" }).fill(name);
    await picker.getByRole("option", { name: new RegExp(name) }).click();

    await expect(picker).not.toBeVisible();
  }

  const request = page.getByRole("article").filter({ hasText: sam });
  await request.getByRole("button", { name: "Record assessment", exact: true }).click();
  let form = page.getByRole("form", { name: "Record assessment" });
  await form.getByRole("button", { name: "Application material reviewed" }).click();
  await page.getByRole("option", { name: /current/ }).click();
  await form.getByRole("button", { name: "Criteria used" }).click();
  await page.getByRole("option", { name: "Current criteria", exact: true }).click();
  await form.getByRole("button", { name: "Funding position" }).click();
  await page.getByRole("option", { name: "Fund", exact: true }).click();
  await form.getByRole("textbox", { name: "Proposed amount" }).fill("18000");
  await form
    .getByRole("textbox", { name: "Assessment text" })
    .fill("Practical plan supported by the free venue.");
  await page
    .getByRole("form", { name: "Record assessment" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to application", exact: true }).click();
  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
  await page.getByRole("button", { name: "Resume editing", exact: true }).click();

  await expect(form.getByRole("textbox", { name: "Assessment text" })).toHaveValue(
    "Practical plan supported by the free venue.",
  );

  await form.getByRole("button", { name: "Save assessment", exact: true }).click();

  await expect(form).not.toBeVisible();
  await expect(
    page.getByRole("article", { name: `Assessment by ${sam}`, exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Add recommendation for/ }).click();
  await page
    .getByRole("textbox", { name: "Reasoning", exact: true })
    .fill("The original plan is fundable; retain this recommendation for discussion.");
  await page.getByRole("button", { name: "Save recommendation", exact: true }).click();

  await expect(page.getByRole("button", { name: /Edit recommendation for/ })).toBeVisible();

  await page.getByRole("button", { name: "Back to application", exact: true }).click();
  await page.getByRole("button", { name: "Application actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Start revised submission" }).click();
  await page.getByRole("button", { name: "Edit application details" }).click();
  dialog = page.getByRole("form", { name: "Edit application details" });
  await dialog.getByRole("textbox", { name: "Requested amount" }).fill("22000");
  await dialog
    .getByRole("textbox", { name: "What changed and why" })
    .fill("The applicant needs to rent a venue.");
  await dialog.getByRole("button", { name: "Save working revision", exact: true }).click();

  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: "Record revision", exact: true }).click();

  await expect(page.getByText("€22,000 requested", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();

  await expect(
    page.getByText("Application changed since this assessment", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: jules })
      .getByText("Awaiting assessment", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The original plan is fundable; retain this recommendation for discussion.", {
      exact: true,
    }),
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("revised-reviews.png"), fullPage: true });
  await page.goto(roundUrl);

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Edit criteria", exact: true }).click();
  dialog = page.getByRole("form", { name: "Edit criteria" });
  await dialog
    .getByRole("textbox", { name: "Reviewer guidance" })
    .fill("Consider who participates and whether venue costs are justified.");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(dialog).not.toBeVisible();

  await page.getByRole("tab", { name: /Applications/ }).click();

  await expect(page.getByRole("link", { name: /Criteria changed/ })).toBeVisible();

  await page.goto(applicationUrl + "?tab=reviews");

  await expect(page.getByRole("main")).toBeFocused();
  await expect(
    page.getByText("Criteria changed since this assessment", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: `Assessment actions for ${sam}` }).click();
  await page.getByRole("menuitem", { name: "Edit recorded assessment", exact: true }).click();
  form = page.getByRole("form", { name: "Edit recorded assessment" });
  await form
    .getByRole("textbox", { name: "Assessment text" })
    .fill("Practical plan supported by the free venue. Corrected transcription.");
  await form.getByRole("textbox", { name: "Change note" }).fill("Corrected a transcription error.");
  await form.getByRole("button", { name: "Save assessment", exact: true }).click();

  await expect(form).not.toBeVisible();

  await page.getByText("Earlier assessments and edits", { exact: true }).click();

  await expect(
    page.getByText("Practical plan supported by the free venue.", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("dialog", { name: "Earlier assessments and edits" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.goto("/app/alder/contacts");

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("textbox", { name: "Find a contact" }).fill(jules);
  await page.getByRole("button", { name: `Actions for ${jules}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();

  await expect(
    page.getByText("Resolve these outstanding review requests before archiving this contact:", {
      exact: true,
    }),
  ).toBeVisible();

  await page.goto(applicationUrl + "?tab=reviews");

  await expect(page.getByRole("main")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("criteria-changed.png"), fullPage: true });
  await page.getByRole("button", { name: `Assessment actions for ${sam}` }).click();
  await page.getByRole("menuitem", { name: "Record follow-up assessment", exact: true }).click();
  form = page.getByRole("form", { name: "Record assessment" });

  await expect(
    form.getByText(
      "This records a new judgment from this reviewer and preserves their earlier assessment.",
      { exact: true },
    ),
  ).toBeVisible();

  await form
    .getByRole("textbox", { name: "Assessment text" })
    .fill("The new venue needs clarification before deciding an amount.");
  await form.getByRole("button", { name: "Save assessment", exact: true }).click();

  await expect(form).not.toBeVisible();
  await expect(
    page.getByText("Funding position: Not stated", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Proposed amount: Not stated", { exact: true }).first(),
  ).toBeVisible();
});
