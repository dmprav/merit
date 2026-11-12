import { expect, type Page } from "@playwright/test";

export const continueDemoEntry = async (page: Page) => {
  const guided = new URL(page.url()).pathname === "/demo/workshop-saturdays";
  const start = page.getByRole("button", {
    name: guided ? "Explore the example" : "Browse the workspace",
    exact: true,
  });
  await expect
    .poll(async () => new URL(page.url()).pathname.startsWith("/app/") || (await start.isVisible()))
    .toBe(true);
  if (await start.isVisible()) {
    await start.click();
  }
  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();
};

export const openGuidedDemo = async (page: Page) => {
  await page.goto("/demo/workshop-saturdays");
  await continueDemoEntry(page);
  await expect(page).toHaveTitle("Workshop Saturdays · Merit");
};

export const openDemo = async (page: Page) => {
  await page.goto("/demo");
  await continueDemoEntry(page);
  await expect(page).toHaveURL(/\/app\/demo-[^/]+\/rounds$/);
  return new URL(page.url()).pathname.replace(/\/rounds$/, "");
};

export const openDemoRound = async (page: Page, applications = false) => {
  await openDemo(page);
  const link = page.getByRole("link", { name: "Local Connections 2027", exact: true });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  await page.goto(`${href}${applications ? "?section=applications" : ""}`);
  await expect(page).toHaveTitle("Local Connections 2027 · Merit");
  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();
};

export const openDemoApplication = async (
  page: Page,
  title: "Neighbour Table" | "Ride Together" | "Workshop Saturdays",
  reviews = false,
) => {
  await openDemoRound(page, true);
  const link = page.getByRole("link", { name: title, exact: true });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  await page.goto(`${href}${reviews ? "?tab=reviews" : ""}`);
  await expect(page).toHaveTitle(`${title} · Merit`);
  await expect(page.getByRole("button", { name: "Demo guide", exact: true })).toBeEnabled();
};
