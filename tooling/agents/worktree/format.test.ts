import { expect, test } from "vite-plus/test";

import { formatCleanSummary, formatCreateSummary, formatListSummary } from "./format.ts";
import { WORKTREE_PORT_BASES } from "./ports.ts";

const PORTS_LINE = "  ports:    dev=3100, app=3101, workspace=3102, storybook=6106/6107";
const alpha = {
  slug: "alpha",
  path: "/repo/.tmp/worktrees/alpha",
  branch: "worktree/alpha",
  databaseName: "merit_alpha",
  databaseUrl: "postgres://merit:merit@127.0.0.1:55432/merit_alpha",
  ports: WORKTREE_PORT_BASES,
};

test("summarizes a created worktree", () => {
  expect(formatCreateSummary({ ...alpha, baseRef: "origin/main", databaseCreated: false })).toBe(
    [
      'Created worktree "alpha"',
      "  path:     /repo/.tmp/worktrees/alpha",
      "  branch:   worktree/alpha (from origin/main)",
      "  database: merit_alpha (not created)",
      `  db url:   ${alpha.databaseUrl}`,
      PORTS_LINE,
    ].join("\n"),
  );
});

test("summarizes listed worktrees", () => {
  expect(formatListSummary([alpha])).toBe(
    [
      "alpha  (worktree/alpha)",
      "  path:     /repo/.tmp/worktrees/alpha",
      `  database: merit_alpha (${alpha.databaseUrl})`,
      PORTS_LINE,
    ].join("\n"),
  );
  expect(formatListSummary([])).toBe("No active worktrees.");
});

test("summarizes a cleaned worktree", () => {
  expect(
    formatCleanSummary({
      ...alpha,
      worktreeRemoved: true,
      databaseDropped: false,
      branchDeleted: true,
      registryRemoved: true,
    }),
  ).toBe(
    [
      'Cleaned worktree "alpha"',
      "  path:     /repo/.tmp/worktrees/alpha (removed)",
      "  database: merit_alpha (skipped)",
      "  branch:   worktree/alpha (deleted)",
    ].join("\n"),
  );
});
