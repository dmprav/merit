import type { Page } from "@playwright/test";

/** Exercise the same destinations through the sidebar or compact navigation drawer. */
export const openNavigation = async (page: Page) => {
  const trigger = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await page.evaluate(() => window.matchMedia("(max-width: 600px)").matches)) {
    if (!(await page.getByRole("button", { name: "Close navigation", exact: true }).isVisible())) {
      await trigger.click();
    }
    return page.getByRole("dialog").filter({ has: page.getByRole("navigation") });
  }

  return page.getByRole("complementary").filter({ has: page.getByRole("navigation") });
};

export const closeNavigation = async (page: Page) => {
  const close = page.getByRole("button", { name: "Close navigation", exact: true });
  if (await close.isVisible()) {
    await close.click();
  }
};
