import { openNavigation, closeNavigation } from "@merit/test-support/browser/navigation";

import { openDemo, openDemoApplication } from "./demo-navigation.ts";
import { test, expect } from "./workspace-test.ts";

test(
  "offline route recovery retains the document and unfinished recommendation",
  { tag: "@cross-browser" },
  async ({ page, context, browserErrors }) => {
    await page.goto("/app/alder/rounds");
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("link", { name: "Local Connections 2027", exact: true }).click();
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("tab", { name: /Applications/ }).click();
    await expect(page.getByRole("tab", { name: /Applications/, selected: true })).toBeVisible();
    await page.getByRole("link", { name: "Workshop Saturdays", exact: true }).click();
    await page.getByRole("button", { name: "Edit recommendation for Workshop Saturdays" }).click();
    await page.getByRole("textbox", { name: /Reasoning/ }).fill("Keep this unfinished reasoning.");
    await page.getByRole("form").getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate(() => {
      document.body.dataset.recoveryDocument = "retained";
    });

    await context.setOffline(true);
    try {
      await page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "Local Connections 2027", exact: true })
        .click();
      await expect(page.getByRole("heading", { name: "Round could not be loaded" })).toBeVisible();
      // Engines report the deliberately failed request and React's handled route error differently.
      browserErrors.splice(0).forEach((error) =>
        expect(error).toMatchObject({
          type: "console",
          message: expect.stringMatching(
            /ERR_INTERNET_DISCONNECTED|Failed to fetch|Load failed|NetworkError|WebKit encountered an internal error|JSHandle@object\s+The above error occurred in the <MatchInnerImpl> component/,
          ),
        }),
      );
    } finally {
      await context.setOffline(false);
    }

    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Local Connections 2027", exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute("data-recovery-document", "retained");
    await page.getByRole("tab", { name: /Applications/ }).click();
    await page.getByRole("link", { name: "Workshop Saturdays", exact: true }).click();
    await page
      .getByRole("button", { name: "Resume editing recommendation for Workshop Saturdays" })
      .click();
    await expect(page.getByRole("textbox", { name: /Reasoning/ })).toHaveValue(
      "Keep this unfinished reasoning.",
    );
  },
);

test("demo and workspace show the expected assessment and inspectable review basis", async ({
  page,
}, testInfo) => {
  await page.goto("/app");

  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("link", { name: "Local Connections 2027", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/alder\/rounds\//);
  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("tab", { name: /Applications/ }).click();

  await expect(page.getByRole("tab", { name: /Applications/, selected: true })).toBeVisible();

  await page.getByRole("link", { name: "Workshop Saturdays", exact: true }).click();

  await expect(page).toHaveTitle("Workshop Saturdays · Merit");
  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Manage reviews", exact: true }).click();
  const assessment = page.getByRole("article", { name: "Assessment by Sam Morgan" });
  for (const surface of ["workspace", "demo"]) {
    if (surface === "demo") {
      await openDemoApplication(page, "Workshop Saturdays", true);

      await expect(
        page
          .getByRole("article", { name: "Jules Patel", exact: true })
          .getByRole("button", { name: "Record assessment", exact: true }),
      ).toBeVisible();
    }
    await expect(assessment).toBeVisible();
    await expect(assessment.getByText("Recommends funding", { exact: true })).toBeVisible();
    await expect(assessment.getByText("€18,000 proposed", { exact: true })).toBeVisible();
    await expect(
      assessment.getByText(
        "The activities fit the round and there is initial interest. The free venue makes the budget credible.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      assessment.getByText("Application changed since this assessment", { exact: true }),
    ).toBeVisible();

    await assessment.getByText("Review details", { exact: true }).click();

    await expect(
      page.getByRole("dialog", { name: "Review details" }).getByText("Version 1", { exact: true }),
    ).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath(`${surface}-review-details.png`),
      fullPage: true,
    });
  }

  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test(
  "shared screens read and save workspace recommendations while preserving access boundaries",
  { tag: "@cross-browser" },
  async ({ page, request }, testInfo) => {
    const clerkRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("clerk.example")) {
        clerkRequests.push(request.url());
      }
    });

    await page.goto("/app");

    await expect(page.getByRole("main")).toBeFocused();
    await expect(page).toHaveURL("http://127.0.0.1:3002/app/alder/rounds");
    await expect(page).toHaveTitle("Funding rounds · Merit");

    // AppPage focuses main after hydration and after each pathname change.
    await expect(page.getByRole("main")).toBeFocused();

    const navigation = await openNavigation(page);

    await expect(navigation.getByText("Alder Foundation", { exact: true })).toBeVisible();
    await expect(navigation.getByText("Dana Reed", { exact: true })).toBeVisible();

    await closeNavigation(page);
    const rounds = page.getByRole("table", { name: "Funding rounds", exact: true });
    const summary = await rounds
      .getByRole("row")
      .filter({ hasText: "Local Connections 2027" })
      .innerText();
    await page.screenshot({ path: testInfo.outputPath("workspace-rounds.png") });
    await openDemo(page);

    await expect(
      page
        .getByRole("table", { name: "Funding rounds", exact: true })
        .getByRole("row")
        .filter({ hasText: "Local Connections 2027" }),
    ).toHaveText(summary, { useInnerText: true });

    await page.screenshot({ path: testInfo.outputPath("demo-rounds.png") });
    await page.goto("/app");
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("link", { name: "Alder Foundation", exact: true }).click();

    await expect(page.getByRole("main")).toBeFocused();

    await page.getByRole("link", { name: "Local Connections 2027", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/alder\/rounds\//);

    const roundUrl = page.url();

    await expect(page.getByRole("main")).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Local Connections 2027", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Overview", selected: true })).toBeVisible();

    await page.getByRole("tab", { name: /Applications/ }).click();
    await page
      .getByRole("link", { name: /Workshop Saturdays/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/app\/alder\/applications\//);
    await expect(page).toHaveTitle("Workshop Saturdays · Merit");
    await expect(page.getByRole("main")).toBeFocused();

    await page.getByRole("button", { name: "Manage reviews", exact: true }).click();

    await expect(page.getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );

    await page.screenshot({ path: testInfo.outputPath("local-workspace.png") });

    const applicationUrl = page.url();
    const edit = page.getByRole("button", { name: "Edit recommendation for Workshop Saturdays" });
    await edit.click();
    const reasoning = page.getByRole("textbox", { name: /Reasoning/ });
    const savedReasoning = `Confirmed venue costs (${testInfo.project.name}).`;
    await reasoning.fill(savedReasoning);
    await page.screenshot({ path: testInfo.outputPath("workspace-editor.png") });
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Funding rounds", exact: true })
      .click();

    await expect(rounds).toBeVisible();

    await page.goBack();
    await page
      .getByRole("button", { name: "Resume editing recommendation for Workshop Saturdays" })
      .click();

    await expect(reasoning).toHaveValue(savedReasoning);

    const competing = await page.context().newPage();
    await competing.goto(applicationUrl);

    await expect(competing.getByRole("main")).toBeFocused();

    await competing
      .getByRole("button", {
        name: /^(Edit|Resume editing) recommendation for Workshop Saturdays$/,
      })
      .click();
    await competing
      .getByRole("textbox", { name: /Reasoning/ })
      .fill("A competing draft must survive.");
    await page.getByRole("button", { name: "Save recommendation", exact: true }).click();

    await expect(page.getByRole("form")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Recommendation saved" })).toHaveCount(
      1,
    );
    await expect(page.getByText(savedReasoning, { exact: true })).toBeVisible();

    await page.reload();

    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.getByText(savedReasoning, { exact: true })).toBeVisible();

    await competing.getByRole("button", { name: "Save recommendation", exact: true }).click();

    await expect(competing.getByRole("alert")).toContainText(
      "This application or recommendation has changed.",
    );
    await expect(competing.getByRole("textbox", { name: /Reasoning/ })).toHaveValue(
      "A competing draft must survive.",
    );

    await competing.getByRole("button", { name: "Discard changes", exact: true }).click();

    await expect(competing.getByText(savedReasoning, { exact: true })).toBeVisible();

    await competing.close();

    await page.goto("/app/birch/rounds");

    await expect(page.getByRole("heading", { name: "Workspace not available" })).toBeVisible();
    await expect(page.getByRole("main")).toBeFocused();

    await page.goto(roundUrl.replace("/alder/", "/birch/"));

    await expect(page.getByRole("heading", { name: "Workspace not available" })).toBeVisible();
    await expect(page.getByRole("main")).toBeFocused();

    await page.goto("/app/sign-in");
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("link", { name: "Back to workspace", exact: true }).click();
    await expect(page.getByRole("main")).toBeFocused();
    await page.getByRole("link", { name: "Alder Foundation", exact: true }).click();

    await expect(
      page.getByRole("link", { name: "Local Connections 2027", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toBeFocused();

    const denied = await request.get("/app", { headers: { Origin: "https://foreign.example" } });

    expect(denied.status()).toBe(403);

    // MCP's configured local resource uses localhost, independently of the web fixture origin.
    const mcp = await request.post("/mcp/workspace", { headers: { Host: "localhost:3002" } });

    expect([401, 503]).toContain(mcp.status());
    expect(clerkRequests).toEqual([]);
  },
);
