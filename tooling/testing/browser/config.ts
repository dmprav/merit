import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, type PlaywrightTestProject } from "@playwright/test";

const desktopViewport = { width: 1440, height: 1000 };
const mobileOptions = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

// Chromium runs the full suites; tagged journeys also run in the other engines.
export const browserProjects: PlaywrightTestProject[] = [
  { name: "desktop", use: { browserName: "chromium", viewport: desktopViewport } },
  { name: "mobile", use: { browserName: "chromium", ...mobileOptions } },
  {
    name: "firefox",
    grep: /@cross-browser/,
    use: { browserName: "firefox", viewport: desktopViewport },
  },
  {
    name: "webkit",
    grep: /@cross-browser/,
    use: { browserName: "webkit", viewport: desktopViewport },
  },
  {
    name: "webkit-mobile",
    grep: /@cross-browser/,
    use: { browserName: "webkit", ...mobileOptions },
  },
];

// Only the non-blocking deferred workflow sets retries, so it can report flaky tests.
const retries = Number(process.env.MERIT_BROWSER_RETRIES ?? 0);

export const browserConfig = defineConfig({
  forbidOnly: true,
  retries,
  testDir: ".",
  outputDir: join(tmpdir(), "merit-browser-results"),
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: browserProjects,
});
