import { expect, test } from "vite-plus/test";

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
