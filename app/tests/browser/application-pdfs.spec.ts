import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { deleteLocalTestFile } from "../local-file-storage.ts";
import { openDemoRound } from "./demo-navigation.ts";
import { test, expect } from "./workspace-test.ts";

test("attaches a PDF during creation and opens the saved bytes beside the intake editor @cross-browser", async ({
  page,
}) => {
  await page.goto("/app/alder/rounds");
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("link", { name: "Local Connections 2027", exact: true }).click();
  await page.getByRole("tab", { name: /Applications/ }).click();
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Add application" });
  await create.getByRole("textbox", { name: "Project title" }).fill("Repair workshops");
  const picked = page.waitForEvent("filechooser");
  await create.getByRole("button", { name: "Choose PDFs" }).click();
  const chooser = await picked;
  const budget = new URL("../../src/server/application-pdfs/samples/budget.pdf", import.meta.url);
  await chooser.setFiles(fileURLToPath(budget));
  await expect(create.getByText("budget.pdf", { exact: true })).toBeVisible();
  await create.getByRole("button", { name: "Add application", exact: true }).click();
  await expect(page).toHaveTitle("Repair workshops · Merit");
  await expect(page.getByRole("button", { name: "Mark ready for review" })).toBeDisabled();

  await page.getByRole("button", { name: "Edit application details", exact: true }).click();
  const applicant = page.getByRole("textbox", { name: "Applicant", exact: true });
  await applicant.fill("Saturday Repair Collective");
  await page.getByRole("button", { name: /Reference material:/ }).click();
  const response = page.waitForResponse(
    (res) => res.url().includes("/api/application-pdfs/") && res.request().method() === "GET",
  );
  await page.getByRole("menuitem", { name: "budget.pdf", exact: true }).click();
  const opened = await response;
  expect(opened.status()).toBe(200);
  expect(opened.headers()["content-type"]).toBe("application/pdf");
  const downloaded = await page.request.get(opened.url());
  expect(await downloaded.body()).toEqual(await readFile(budget));
  await expect(page.getByTitle("budget.pdf", { exact: true })).toBeVisible();
  await expect(applicant).toHaveValue("Saturday Repair Collective");
});

test("offers only sample PDFs in a demo application", async ({ page }) => {
  await openDemoRound(page, true);
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Add application" });
  await create.getByRole("textbox", { name: "Project title" }).fill("Demo proposal");
  await expect(create.getByRole("button", { name: "Choose PDFs" })).toHaveCount(0);
  await create.getByRole("button", { name: "Choose a sample PDF" }).click();
  await page.getByRole("menuitem", { name: /proposal/i }).click();
  await expect(create.getByText("Workshop Saturdays proposal.pdf", { exact: true })).toBeVisible();
  await create.getByRole("button", { name: "Add application", exact: true }).click();
  await expect(page).toHaveTitle("Demo proposal · Merit");
});

// The workspace fixture owns a disposable database. Its object keys belong to this test run.
test.afterEach(async ({ workspaceDatabase }) => {
  const files = await workspaceDatabase.query<{ object_key: string }>(
    "SELECT object_key FROM application_pdfs",
  );
  for (const { object_key } of files.rows) {
    expect(await deleteLocalTestFile(object_key)).toBe(true);
  }
});
