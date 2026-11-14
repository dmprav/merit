import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import {
  collectCiSummaries,
  formatDuration,
  formatSummaryMarkdown,
  summarizePlaywrightReport,
  summarizeVitestReport,
} from "./ci-summary";

test("summarizes Playwright stats along with failed and flaky tests", () => {
  const summary = summarizePlaywrightReport(
    {
      stats: { duration: 125_400, expected: 40, skipped: 1, unexpected: 1, flaky: 1 },
      suites: [
        {
          title: "application.spec.ts",
          file: "app/tests/browser/application.spec.ts",
          suites: [
            {
              title: "demo flow",
              specs: [
                {
                  title: "creates a round",
                  file: "app/tests/browser/application.spec.ts",
                  line: 42,
                  tests: [
                    {
                      projectName: "desktop",
                      status: "unexpected",
                      results: [
                        {
                          status: "failed",
                          error: {
                            message: "\u001b[31mError: timed out waiting\u001b[39m\n  at line 45",
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  title: "reloads draft",
                  file: "app/tests/browser/application.spec.ts",
                  line: 88,
                  tests: [
                    {
                      projectName: "mobile",
                      status: "flaky",
                      results: [{ status: "failed", errors: [{ message: "Timeout" }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    "Demo browser shard 1/2",
  );

  expect(summary).toEqual({
    label: "Demo browser shard 1/2",
    passed: 40,
    failed: 1,
    flaky: 1,
    skipped: 1,
    durationMs: 125_400,
    findings: [
      {
        kind: "failed",
        title: "application.spec.ts › demo flow › creates a round [desktop]",
        location: "app/tests/browser/application.spec.ts:42",
        message: "Error: timed out waiting",
      },
      {
        kind: "flaky",
        title: "application.spec.ts › demo flow › reloads draft [mobile]",
        location: "app/tests/browser/application.spec.ts:88",
        message: "Timeout",
      },
    ],
  });
});

test("summarizes Vitest assertion failures and suite-level errors", () => {
  const summary = summarizeVitestReport(
    {
      numTotalTests: 3,
      numPassedTests: 2,
      numFailedTests: 1,
      numPendingTests: 0,
      numTodoTests: 0,
      startTime: 1_000,
      success: false,
      testResults: [
        {
          name: "/repo/capabilities/access/tests/policy.test.ts",
          status: "failed",
          startTime: 1_000,
          endTime: 4_500,
          assertionResults: [
            {
              fullName: "policy rejects outsider",
              title: "rejects outsider",
              status: "failed",
              failureMessages: ["AssertionError: expected 200 to be 403\n    at ..."],
            },
          ],
        },
        {
          name: "/repo/capabilities/access/tests/broken.test.ts",
          status: "failed",
          startTime: 4_500,
          endTime: 6_200,
          message: "Error: Failed to load module",
          assertionResults: [],
        },
      ],
    },
    "capabilities/access",
    "/repo",
  );

  expect(summary.durationMs).toBe(5_200);
  expect(summary.findings).toEqual([
    {
      kind: "failed",
      title: "policy rejects outsider",
      location: "capabilities/access/tests/policy.test.ts",
      message: "AssertionError: expected 200 to be 403",
    },
    {
      kind: "failed",
      title: "Suite failure: capabilities/access/tests/broken.test.ts",
      location: "capabilities/access/tests/broken.test.ts",
      message: "Error: Failed to load module",
    },
  ]);
});

test("collects reports from report directory and scanned package Vitest files", () => {
  const root = mkdtempSync(join(tmpdir(), "merit-ci-summary-"));
  try {
    const reportDir = join(root, "reports");
    const pkgDir = join(root, "foundation/money");
    mkdirSync(reportDir, { recursive: true });
    mkdirSync(pkgDir, { recursive: true });

    writeFileSync(
      join(reportDir, "playwright.json"),
      JSON.stringify({
        stats: { duration: 15_000, expected: 12, skipped: 0, unexpected: 0, flaky: 0 },
        suites: [],
      }),
    );
    writeFileSync(
      join(pkgDir, ".vitest-report.json"),
      JSON.stringify({
        numTotalTests: 10,
        numPassedTests: 10,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        startTime: 100,
        success: true,
        testResults: [
          { name: join(pkgDir, "tests/money.test.ts"), status: "passed", endTime: 900 },
        ],
      }),
    );

    const summaries = collectCiSummaries({
      reportDir,
      scanVitestFilename: ".vitest-report.json",
      workspaceRoot: root,
    });
    const markdown = formatSummaryMarkdown("CI Summary", summaries);

    expect(summaries).toHaveLength(2);
    expect(markdown).toContain("| playwright | 12 | 0 | 0 | 0 | 15.0s |");
    expect(markdown).toContain("| foundation/money | 10 | 0 | 0 | 0 | 0.8s |");
    expect(formatDuration(125_000)).toBe("2m 5s");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports Playwright startup errors when no test suites executed and escapes cells", () => {
  const summary = summarizePlaywrightReport(
    {
      errors: [{ message: "Error: Timed out waiting 120000ms from config.webServer.\n  at ..." }],
      suites: [],
      stats: { duration: 1_200, expected: 0, skipped: 0, unexpected: 0, flaky: 0 },
    },
    "Demo\\browser|shard",
  );

  expect(summary).toEqual({
    label: "Demo\\browser|shard",
    passed: 0,
    failed: 1,
    flaky: 0,
    skipped: 0,
    durationMs: 1_200,
    findings: [
      {
        kind: "failed",
        title: "Runner setup failure",
        message: "Error: Timed out waiting 120000ms from config.webServer.",
      },
    ],
  });

  const markdown = formatSummaryMarkdown("Browser", [summary]);
  expect(markdown).toContain("| Demo\\\\browser\\|shard | 0 | 1 | 0 | 0 | 1.2s |");
  expect(markdown).toContain(
    "- **FAILED** Runner setup failure: Error: Timed out waiting 120000ms from config.webServer.",
  );
});
