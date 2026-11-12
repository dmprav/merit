import { test, expect } from "./workspace-test.ts";

test("record, complete, recommend, and revise an application without a budget", async ({
  page,
}, testInfo) => {
  const title = `Intake ${testInfo.project.name}`;
  await page.goto("/app/alder/rounds");

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Create funding round", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Create funding round" });
  await dialog.getByRole("textbox", { name: "Round name" }).fill(title);
  await dialog.getByRole("button", { name: "Create funding round", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/alder\/rounds\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /Applications/ }).click();
  const roundUrl = page.url();
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Add application" });
  await dialog.getByRole("textbox", { name: "Project title" }).fill("Weekly meals");
  await dialog.getByRole("button", { name: "Add application", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/alder\/applications\/[^/]+$/);
  await expect(page).toHaveTitle("Weekly meals · Merit");
  await expect(page.getByText("Requested amount not known", { exact: true })).toBeVisible();

  const applicationUrl = page.url();

  await expect(page.getByRole("button", { name: "Mark ready for review" })).toBeDisabled();

  await page.getByRole("button", { name: "Edit application details", exact: true }).click();
  dialog = page.getByRole("form", { name: "Edit application details", exact: true });
  await dialog
    .getByRole("textbox", { name: "Applicant", exact: true })
    .fill("Neighbourhood Kitchen");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(dialog).not.toBeVisible();

  await page.reload();

  await expect(page.getByRole("main")).toBeFocused();
  await expect(
    page
      .getByRole("complementary", { name: "Application workspace" })
      .getByText("Neighbourhood Kitchen", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit application details", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Requested amount" }).fill("24000.001");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("at most two decimal places");

  await dialog.getByRole("textbox", { name: "Requested amount" }).fill("24000");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Edit applicant submission", exact: true }).click();
  dialog = page.getByRole("form", { name: "Edit applicant submission", exact: true });
  await dialog.getByRole("button", { name: "Add section" }).click();
  await dialog.getByRole("textbox", { name: "Heading or question" }).fill("Project plan");
  await dialog
    .getByRole("textbox", { name: "Applicant’s response" })
    .fill("Weekly shared meals for local residents.");
  await page.screenshot({ path: testInfo.outputPath("application-intake-editor.png") });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: title, exact: true })
    .click();
  await page.getByRole("link", { name: "Weekly meals", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue editing applicant submission", exact: true })
    .click();

  await expect(page.getByText("€24,000 requested", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Applicant’s response" })).toHaveValue(
    "Weekly shared meals for local residents.",
  );

  const colleague = await page.context().newPage();
  await colleague.goto(applicationUrl);

  await expect(colleague.getByRole("main")).toBeFocused();

  const contactControl = colleague.getByRole("button", { name: "Change contact", exact: true });
  await contactControl.focus();
  await contactControl.press("Enter");
  const changeContactDialog = colleague.getByRole("dialog", { name: "Change contact" });
  const addContact = changeContactDialog.getByRole("button", { name: "Add contact", exact: true });
  await addContact.click();
  const createContactDialog = colleague.getByRole("dialog", { name: "Add contact" });
  await expect(
    createContactDialog.getByRole("textbox", { name: "Name", exact: true }),
  ).toBeFocused();
  await colleague.keyboard.press("Escape");

  await expect(createContactDialog).not.toBeVisible();
  await expect(changeContactDialog).toBeVisible();
  await expect(addContact).toBeFocused();
  await addContact.press("Enter");
  await createContactDialog.getByRole("textbox", { name: "Name", exact: true }).fill("Leah Martin");
  await createContactDialog
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(`leah.${testInfo.project.name}@example.test`);
  await createContactDialog.getByRole("button", { name: "Save contact", exact: true }).click();

  await expect(createContactDialog).not.toBeVisible();
  await expect(changeContactDialog).not.toBeVisible();
  const assignedContact = colleague.getByRole("button", {
    name: "Change contact: Leah Martin",
    exact: true,
  });
  await expect(assignedContact).toBeFocused();

  await colleague.getByRole("button", { name: "Undo", exact: true }).click();

  await expect(
    colleague.getByRole("button", { name: "Change contact", exact: true }),
  ).toBeVisible();
  await expect(contactControl).toBeFocused();

  await colleague.getByRole("button", { name: "Change contact", exact: true }).click();
  await changeContactDialog
    .getByRole("textbox", { name: "Find a contact" })
    .fill(`leah.${testInfo.project.name}@example.test`);
  await changeContactDialog.getByRole("option", { name: /Leah Martin/ }).click();

  await expect(changeContactDialog).not.toBeVisible();
  await expect(assignedContact).toBeFocused();

  await colleague.getByRole("button", { name: "Add staff summary" }).click();
  const contactDialog = colleague.getByRole("form", { name: "Edit staff summary" });
  await contactDialog
    .getByRole("textbox", { name: "Staff summary" })
    .fill("A staff summary of the meals proposal.");
  await contactDialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(contactDialog).not.toBeVisible();

  await colleague.close();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(dialog.getByRole("button", { name: "Keep my changes" })).toBeVisible();

  await dialog.getByRole("button", { name: "Keep my changes" }).click();

  await expect(dialog.getByRole("textbox", { name: "Applicant’s response" })).toHaveValue(
    "Weekly shared meals for local residents.",
  );

  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Application workspace" })
      .getByText(`leah.${testInfo.project.name}@example.test`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Staff summary" }).getByText("Dana Reed", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Mark ready for review" }).click();

  await expect(
    page.getByRole("button", { name: "Mark ready for review", exact: true }),
  ).toBeHidden();

  await page.getByRole("button", { name: /Add recommendation for/ }).click();
  await page
    .getByRole("textbox", { name: "Reasoning" })
    .fill("The submitted plan supports funding.");
  await page.getByRole("button", { name: "Save recommendation", exact: true }).click();

  await expect(
    page.getByRole("button", { name: /Edit recommendation for Weekly meals/ }),
  ).toBeVisible();
  await expect(
    page.getByText("The submitted plan supports funding.", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Application actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Start revised submission" }).click();

  await expect(page.getByRole("button", { name: "Edit application details" })).toBeVisible();

  await page.getByRole("button", { name: "Edit application details" }).click();
  dialog = page.getByRole("form", { name: "Edit application details" });
  await dialog.getByRole("textbox", { name: "Requested amount" }).fill("28000");
  await dialog
    .getByRole("textbox", { name: "What changed and why" })
    .fill("The applicant supplied revised venue costs.");
  await dialog.getByRole("button", { name: "Save working revision", exact: true }).click();

  await expect(dialog).not.toBeVisible();

  await page.reload();

  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByText("€24,000 requested", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Record revision", exact: true }).click();

  await expect(page.getByText("€28,000 requested", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Manager recommendation" }).getByText(/Earlier submission v/),
  ).toBeVisible();
  await expect(
    page.getByText("The submitted plan supports funding.", { exact: true }),
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("application-revised-review.png") });
  await page.getByRole("button", { name: "View version history", exact: true }).click();

  await expect(
    page
      .getByRole("list", { name: "Recorded updates" })
      .getByText("The applicant supplied revised venue costs.", { exact: true }),
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("application-history.png") });
  await page.goto(roundUrl);

  await expect(page.getByText("Earlier application version", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: "Weekly meals", exact: true }) })
      .getByRole("cell", { name: "€24,000", exact: true }),
  ).toBeVisible();

  await page.goto(applicationUrl);

  await expect(page.getByRole("heading", { name: "Weekly meals", exact: true })).toBeVisible();

  await page.goto(roundUrl);

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Add application", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Add application" });
  await dialog.getByRole("textbox", { name: "Project title" }).fill("Accidental record");
  await dialog.getByRole("button", { name: "Add application", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/alder\/applications\/[^/]+$/);

  await page.getByRole("button", { name: "Application actions" }).click();
  await page.getByRole("menuitem", { name: "Delete application", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Delete application" });
  await dialog.getByRole("button", { name: "Delete application", exact: true }).click();

  await expect(page).toHaveURL(roundUrl);
  await expect(page.getByRole("link", { name: "Accidental record", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Weekly meals", exact: true })).toBeVisible();
});

test("create and continue preparing a round and application", async ({ page }, testInfo) => {
  const title = `Community grants ${testInfo.project.name === "desktop" ? "2027" : "2028"}`;
  await page.goto("/app/alder/rounds");

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Create funding round", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Create funding round" });

  await expect(dialog.getByRole("textbox", { name: "Round name" })).toBeFocused();
  await expect(dialog.getByText("Purpose", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Budget" })).toHaveAttribute(
    "placeholder",
    "Not set",
  );
  await expect(dialog.getByText("€", { exact: true })).toBeHidden();

  await dialog.screenshot({ path: testInfo.outputPath("round-creation-empty.png") });
  await page.keyboard.type(title);
  await page.keyboard.press("Tab");

  await expect(dialog.getByRole("textbox", { name: "Purpose" })).toBeFocused();

  await page.keyboard.type("Support neighbourhood projects that bring people together.");
  await page.keyboard.press("Tab");

  await expect(dialog.getByRole("textbox", { name: "Budget" })).toBeFocused();

  await page.keyboard.type("50,000.00");

  await expect(dialog.getByText("€", { exact: true })).toBeVisible();

  await page.keyboard.press("Tab");

  await expect(dialog.getByLabel("Committee date", { exact: true })).toBeFocused();

  await dialog.getByLabel("Committee date", { exact: true }).fill("2027-03-14");
  await dialog.getByRole("button", { name: "Choose date for Committee date" }).click();
  const calendar = page.getByRole("dialog", { name: "Committee date", exact: true });
  await calendar.getByRole("button", { name: "Monday, 15 March 2027" }).click();

  await expect(calendar).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Committee date", { exact: true })).toHaveValue("2027-03-15");

  await page.keyboard.press("Escape");

  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: "Resume funding round", exact: true }).click();

  await expect(dialog.getByRole("textbox", { name: "Purpose" })).toHaveValue(
    "Support neighbourhood projects that bring people together.",
  );
  await expect(dialog.getByRole("textbox", { name: "Budget" })).toHaveValue("50,000.00");

  await dialog.screenshot({ path: testInfo.outputPath("round-creation.png") });
  await dialog.getByRole("textbox", { name: "Purpose" }).fill("Long grant evidence. ".repeat(400));

  await expect(
    dialog.getByRole("button", { name: "Create funding round", exact: true }),
  ).toBeInViewport();

  await dialog
    .getByRole("textbox", { name: "Purpose" })
    .fill("Support neighbourhood projects that bring people together.");
  if (testInfo.project.name === "mobile") {
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 640 });
    await page.screenshot({
      path: testInfo.outputPath("round-creation-narrow.png"),
      fullPage: true,
    });

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(
      dialog.getByRole("button", { name: "Create funding round", exact: true }),
    ).toBeInViewport();

    await page.setViewportSize(viewport);
  }
  await dialog.getByRole("textbox", { name: "Round name" }).focus();
  await page.keyboard.press("Control+Enter");

  await expect(page).toHaveTitle(`${title} · Merit`);
  await expect(page).toHaveURL(/\/app\/alder\/rounds\/[^/]+$/);

  await page.reload();

  await expect(page.getByRole("main")).toBeFocused();
  await expect(
    page.getByText("Support neighbourhood projects that bring people together.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "€50,000" })).toBeVisible();

  await page.getByRole("tab", { name: /Applications/ }).click();
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Add application" });

  await expect(dialog.getByRole("textbox", { name: "Project title" })).toBeFocused();
  await expect(dialog.getByText("Submitted material", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add another", exact: true })).toHaveCount(0);

  await dialog.screenshot({ path: testInfo.outputPath("application-creation-empty.png") });
  await page.keyboard.type("Neighbourhood meals");
  await page.keyboard.press("Tab");

  await expect(dialog.getByRole("textbox", { name: "Applicant", exact: true })).toBeFocused();

  await page.keyboard.type("Neighbourhood Kitchen");
  await page.keyboard.press("Tab");

  await expect(dialog.getByRole("textbox", { name: "Requested amount" })).toBeFocused();

  await page.keyboard.type("12,50");
  await page.keyboard.press("Tab");

  await expect(dialog.getByRole("textbox", { name: "Submitted material" })).toBeFocused();

  await page.keyboard.type("Weekly shared meals, planned and cooked by local residents.");
  await dialog.screenshot({ path: testInfo.outputPath("application-creation.png") });
  await dialog.getByRole("button", { name: "Add application", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/alder\/applications\/[^/]+$/);

  await page.reload();

  await expect(page).toHaveTitle("Neighbourhood meals · Merit");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByText("€12.50 requested", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Application workspace" })
      .getByText("Neighbourhood Kitchen", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Weekly shared meals, planned and cooked by local residents.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark ready for review", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});
