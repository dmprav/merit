import { expect, test, vi } from "vite-plus/test";

import { browserFailures } from "./ci-browser-history";

test("counts first failures and explicit passes of the same browser test on later attempts", () => {
  const job = { id: 1, name: "browser-storybook (5/5)", run_attempt: 1, conclusion: "failure" };

  const result = (mark: string, browser: string, title: string) =>
    `2026-11-18T22:52:37.2388911Z   ${mark}    1 [${browser}] › tests/navigation.spec.ts:94:1 › ${title} (12.8s)`;

  const logs = new Map([
    [
      1,
      [
        result("✘", "webkit", "focus"),
        result("✘", "mobile", "focus"),
        result("✘", "mobile", "scroll"),
      ].join("\n"),
    ],
    [3, [result("✓", "webkit", "focus"), result("✘", "mobile", "scroll")].join("\n")],
  ]);
  const results = browserFailures(
    100,
    [
      job,
      { ...job, id: 2, conclusion: "cancelled" },
      { ...job, id: 3, run_attempt: 2 },
      { ...job, id: 4, name: "security-checks" },
    ],
    (id) => {
      const log = logs.get(id);
      if (!log) {
        throw new Error(`Unexpected request for job ${id}`);
      }
      return log;
    },
  );
  expect(Object.fromEntries(results)).toEqual({
    "browser-storybook [webkit] tests/navigation.spec.ts › focus": true,
    "browser-storybook [mobile] tests/navigation.spec.ts › focus": false,
    "browser-storybook [mobile] tests/navigation.spec.ts › scroll": false,
  });
});

test("counts a browser test once per run and marks it recovered when its retry passes", () => {
  const attempt = (mark: string, title: string, retry = "") =>
    `2026-11-22T10:08:11.0Z   ${mark}    3 [webkit] › tests/navigation.spec.ts:3:1 › ${title}${retry} (9.2s)`;

  const log = [
    attempt("✘", "focus"),
    attempt("✘", "scroll"),
    attempt("✓", "focus", " (retry #1)"),
    attempt("✘", "scroll", " (retry #1)"),
  ].join("\n");

  const results = browserFailures(
    100,
    [{ id: 1, name: "browser-storybook (5/5)", run_attempt: 1, conclusion: "failure" }],
    () => log,
  );

  expect(Object.fromEntries(results)).toEqual({
    "browser-storybook [webkit] tests/navigation.spec.ts › focus": true,
    "browser-storybook [webkit] tests/navigation.spec.ts › scroll": false,
  });
});

const failedJob = { id: 1, name: "browser-storybook (5/5)", run_attempt: 1, conclusion: "failure" };

test.each([404, 410])("skips the whole run when a rerun log is unavailable (HTTP %i)", (status) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const jobs = [failedJob, { ...failedJob, id: 2, run_attempt: 2, conclusion: "success" }];
    const result = browserFailures(100, jobs, (id) => {
      if (id === 1) {
        return "2026-11-18T22:52:37Z  ✘  1 [webkit] › test.spec.ts:1:1 › focus (1.2s)";
      }
      throw Object.assign(new Error("Command failed"), {
        stderr: `gh: Log unavailable (HTTP ${status})`,
      });
    });
    expect(result.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping Verify run 100"));
  } finally {
    warn.mockRestore();
  }
});

test.each(["gh: Bad credentials (HTTP 401)", "gh: Forbidden (HTTP 403)", "connection timed out"])(
  "propagates other log request failures (%s)",
  (stderr) => {
    const error = Object.assign(new Error("Command failed"), { stderr });
    expect(() =>
      browserFailures(100, [failedJob], () => {
        throw error;
      }),
    ).toThrow(error);
  },
);
