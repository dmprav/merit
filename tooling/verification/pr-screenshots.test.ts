import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  buildImporterGraph,
  buildScreenshotRawUrl,
  cleanupPrScreenshotsFromOrphanBranch,
  collectCapturedScreenshots,
  EVERY_STORY,
  filterSelectedDesktopTargets,
  parseCleanupArgs,
  parsePublishArgs,
  parseSelectArgs,
  previewStatsSchema,
  publishScreenshotsToOrphanBranch,
  resolveStatsModulePath,
  resolveStoryImportPath,
  MAX_SCREENSHOT_STORIES,
  SCREENSHOT_BRANCH,
  selectStoriesForPr,
} from "./pr-screenshots.ts";

describe("pr-screenshots", () => {
  test("resolves Storybook importPath values relative to tooling/storybook", () => {
    expect(
      resolveStoryImportPath("../../foundation/ui/src/components/button/button.stories.tsx"),
    ).toBe("foundation/ui/src/components/button/button.stories.tsx");
    expect(
      resolveStoryImportPath("../../capabilities/reviews/web/src/views/banner.stories.tsx"),
    ).toBe("capabilities/reviews/web/src/views/banner.stories.tsx");
  });

  const story = (id: string, importPath: string, type = "story") => ({
    id,
    title: id.split("--")[0] ?? id,
    name: id.split("--")[1] ?? id,
    type,
    importPath: `../../${importPath}`,
  });

  const indexEntries = Object.fromEntries(
    [
      story("button--docs", "foundation/ui/src/button/button.stories.tsx", "docs"),
      story("button--overview", "foundation/ui/src/button/button.stories.tsx"),
      story("button--disabled", "foundation/ui/src/button/button.stories.tsx"),
      story("dialog--default", "foundation/ui/src/dialog/dialog.stories.tsx"),
      story("dialog--long", "foundation/ui/src/dialog/dialog.stories.tsx"),
      story("editor--empty", "capabilities/grantmaking/web/src/views/editor.stories.tsx"),
      story("history--three", "capabilities/grantmaking/web/src/views/history.stories.tsx"),
    ].map((entry) => [entry.id, entry]),
  );

  /** A preview where the editor story renders a decisions view that uses the button. */
  const stats = {
    modules: [
      {
        name: "./../../foundation/ui/src/button/button.tsx",
        reasons: [
          { moduleName: "./../../foundation/ui/src/button/button.stories.tsx" },
          { moduleName: "./../../foundation/ui/src/dialog/dialog.tsx" },
          { moduleName: "./../../capabilities/decisions/web/src/views/decision-editor.tsx" },
        ],
      },
      {
        name: "./../../foundation/ui/src/button/button.module.css?used",
        reasons: [{ moduleName: "./../../foundation/ui/src/button/button.tsx" }],
      },
      {
        name: "./../../foundation/ui/src/dialog/dialog.tsx",
        reasons: [{ moduleName: "./../../foundation/ui/src/dialog/dialog.stories.tsx" }],
      },
      {
        name: "./../../capabilities/decisions/web/src/views/decision-editor.tsx",
        reasons: [
          { moduleName: "./../../capabilities/grantmaking/web/src/views/editor.stories.tsx" },
        ],
      },
      {
        name: "./../../foundation/ui/src/tokens.css",
        reasons: [{ moduleName: "./.storybook/preview.tsx" }],
      },
      {
        name: "./.storybook/preview.tsx",
        reasons: [{ moduleName: "/virtual:/@storybook/builder-vite/project-annotations.js" }],
      },
      {
        name: "./../../node_modules/.pnpm/react@19/node_modules/react/index.js",
        reasons: [{ moduleName: "./../../foundation/ui/src/button/button.tsx" }],
      },
      ...[
        "foundation/ui/src/button/button.stories.tsx",
        "foundation/ui/src/dialog/dialog.stories.tsx",
        "capabilities/grantmaking/web/src/views/editor.stories.tsx",
        "capabilities/grantmaking/web/src/views/history.stories.tsx",
      ].map((path) => ({
        name: `./../../${path}`,
        reasons: [{ moduleName: "/virtual:/@storybook/builder-vite/storybook-stories.js" }],
      })),
    ],
  };
  const importers = buildImporterGraph(previewStatsSchema.parse(stats));

  const select = (changedPaths: string[], maxStories?: number) =>
    selectStoriesForPr({ changedPaths, indexEntries, importers, maxStories });

  test("maps preview-stats module names to repository paths", () => {
    expect(resolveStatsModulePath("./../../foundation/ui/src/button/button.tsx")).toBe(
      "foundation/ui/src/button/button.tsx",
    );
    expect(resolveStatsModulePath("./../../foundation/ui/src/a.module.css?used")).toBe(
      "foundation/ui/src/a.module.css",
    );
    expect(resolveStatsModulePath("./.storybook/preview.tsx")).toBe(
      "tooling/storybook/.storybook/preview.tsx",
    );
    expect(resolveStatsModulePath("/virtual:/@storybook/builder-vite/project-annotations.js")).toBe(
      EVERY_STORY,
    );
    expect(resolveStatsModulePath("/virtual:/@storybook/builder-vite/storybook-stories.js")).toBe(
      null,
    );
    expect(resolveStatsModulePath("\0vite/preload-helper.js")).toBe(null);
    expect(resolveStatsModulePath("./../../node_modules/.pnpm/react/index.js")).toBe(null);
    expect(importers.get("foundation/ui/src/button/button.tsx")).toEqual(
      new Set([
        "foundation/ui/src/button/button.stories.tsx",
        "foundation/ui/src/dialog/dialog.tsx",
        "capabilities/decisions/web/src/views/decision-editor.tsx",
      ]),
    );
  });

  test("ranks affected story files by import distance and takes one story per file in turn", () => {
    const result = select(["foundation/ui/src/button/button.module.css"], 4);

    // button.stories imports button.tsx (distance 2); dialog.stories and editor.stories reach it
    // through one more module (distance 3); history.stories never imports it.
    expect(result.selected.map((s) => s.id)).toEqual([
      "button--overview",
      "editor--empty",
      "dialog--default",
      "button--disabled",
    ]);
    expect(result.affected).toEqual({ storyFiles: 3, directStoryFiles: 0 });
  });

  test("puts changed story files first and counts files that import a changed module as direct", () => {
    const result = select([
      "capabilities/decisions/web/src/views/decision-editor.tsx",
      "foundation/ui/src/dialog/dialog.stories.tsx",
    ]);

    expect(result.selected.map((s) => s.id)).toEqual([
      "dialog--default",
      "editor--empty",
      "dialog--long",
    ]);
    expect(result.affected).toEqual({ storyFiles: 2, directStoryFiles: 2 });
  });

  test("reaches every story when a module the Storybook preview imports changes", () => {
    const result = select(["foundation/ui/src/tokens.css"], 4);

    expect(result.selected.map((s) => s.storyFile)).toEqual([
      "capabilities/grantmaking/web/src/views/editor.stories.tsx",
      "capabilities/grantmaking/web/src/views/history.stories.tsx",
      "foundation/ui/src/button/button.stories.tsx",
      "foundation/ui/src/dialog/dialog.stories.tsx",
    ]);
    expect(result.affected).toEqual({ storyFiles: 4, directStoryFiles: 0 });
  });

  test("counts no story file as direct when the Storybook preview itself changes", () => {
    const result = select(["tooling/storybook/.storybook/preview.tsx"], 1);

    expect(result.selected.map((s) => s.id)).toEqual(["editor--empty"]);
    expect(result.affected).toEqual({ storyFiles: 4, directStoryFiles: 0 });
  });

  test("selects a changed story file first even when the stats do not list it", () => {
    const newStory = story("banner--default", "foundation/ui/src/banner/banner.stories.tsx");
    const result = selectStoriesForPr({
      changedPaths: [
        "foundation/ui/src/banner/banner.stories.tsx",
        "capabilities/decisions/web/src/views/decision-editor.tsx",
      ],
      indexEntries: { ...indexEntries, [newStory.id]: newStory },
      importers,
    });

    expect(result.selected.map((s) => s.id)).toEqual(["banner--default", "editor--empty"]);
    expect(result.affected).toEqual({ storyFiles: 2, directStoryFiles: 2 });
  });

  test("selects nothing for changes no story bundles, such as tests, server code, and docs", () => {
    expect(
      select([
        "capabilities/decisions/web/src/views/decision-editor.test.tsx",
        "interfaces/product/src/features/grantmaking/data/server/recommendations.functions.ts",
        "docs/README.md",
      ]),
    ).toEqual({ selected: [], affected: { storyFiles: 0, directStoryFiles: 0 } });
  });

  test("builds commit-pinned raw.githubusercontent.com URLs", () => {
    expect(
      buildScreenshotRawUrl({
        repo: "dmprav/merit",
        commitSha: "abc123",
        prNumber: 264,
        filename: "components-button--overview-desktop.png",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/dmprav/merit/abc123/pr-264/components-button--overview-desktop.png",
    );
  });

  test("publishes squashed 1-commit orphan branch preserving sibling PRs and cleans up on close", () => {
    const temp = mkdtempSync(join(tmpdir(), "merit-shots-test-"));
    try {
      const bareRemote = join(temp, "remote.git");
      execFileSync("git", ["init", "--bare", "--quiet", bareRemote]);

      const shotA = join(temp, "a.png");
      const shotB = join(temp, "b.png");
      writeFileSync(shotA, "png-a");
      writeFileSync(shotB, "png-b");

      const first = publishScreenshotsToOrphanBranch({
        remoteUrl: bareRemote,
        prNumber: 10,
        files: [{ filename: "story-a.png", sourcePath: shotA }],
      });
      expect(first.commitSha).toMatch(/^[0-9a-f]{40}$/u);

      const second = publishScreenshotsToOrphanBranch({
        remoteUrl: bareRemote,
        prNumber: 20,
        files: [{ filename: "story-b.png", sourcePath: shotB }],
      });
      expect(second.commitSha).toMatch(/^[0-9a-f]{40}$/u);

      // Branch stays a single squashed orphan commit with both PR directories intact.
      const commitCount = execFileSync(
        "git",
        ["rev-list", "--count", `refs/heads/${SCREENSHOT_BRANCH}`],
        { cwd: bareRemote, encoding: "utf8" },
      ).trim();
      expect(commitCount).toBe("1");

      const tree = execFileSync(
        "git",
        ["ls-tree", "-r", "--name-only", `refs/heads/${SCREENSHOT_BRANCH}`],
        { cwd: bareRemote, encoding: "utf8" },
      )
        .trim()
        .split(/\r?\n/)
        .sort();
      expect(tree).toEqual(["pr-10/story-a.png", "pr-20/story-b.png"]);

      // Closing PR #10 removes only pr-10/ and keeps pr-20/.
      expect(cleanupPrScreenshotsFromOrphanBranch({ remoteUrl: bareRemote, prNumber: 10 })).toEqual(
        { action: "updated" },
      );
      const remaining = execFileSync(
        "git",
        ["ls-tree", "-r", "--name-only", `refs/heads/${SCREENSHOT_BRANCH}`],
        { cwd: bareRemote, encoding: "utf8" },
      ).trim();
      expect(remaining).toBe("pr-20/story-b.png");

      // Closing a PR without screenshots is a noop.
      expect(
        cleanupPrScreenshotsFromOrphanBranch({ remoteUrl: bareRemote, prNumber: 999 }),
      ).toEqual({ action: "noop" });

      // Closing the last PR deletes the screenshot branch entirely.
      expect(cleanupPrScreenshotsFromOrphanBranch({ remoteUrl: bareRemote, prNumber: 20 })).toEqual(
        { action: "deleted" },
      );
      const refs = execFileSync("git", ["for-each-ref"], {
        cwd: bareRemote,
        encoding: "utf8",
      }).trim();
      expect(refs).toBe("");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test("filters captured desktop targets to exact selected story IDs in selection order", () => {
    const targets = [
      {
        kind: "story" as const,
        target: "components-button--default-disabled",
        viewport: "desktop" as const,
        screenshot: "screenshots/disabled.png",
      },
      {
        kind: "story" as const,
        target: "components-button--default",
        viewport: "desktop" as const,
        screenshot: "screenshots/default.png",
      },
      {
        kind: "story" as const,
        target: "components-dialog--open",
        viewport: "desktop" as const,
        screenshot: "screenshots/dialog.png",
      },
      {
        kind: "story" as const,
        target: "components-dialog--open",
        viewport: "mobile" as const,
        screenshot: "screenshots/dialog-mobile.png",
      },
    ];

    expect(
      filterSelectedDesktopTargets(targets, [
        "components-dialog--open",
        "components-button--default",
      ]).map((t) => t.target),
    ).toEqual(["components-dialog--open", "components-button--default"]);
  });

  test("pairs captured screenshots with their selected stories and skips missing captures", () => {
    const temp = mkdtempSync(join(tmpdir(), "merit-shots-collect-"));
    try {
      mkdirSync(join(temp, "screenshots"));
      writeFileSync(join(temp, "screenshots", "editor.png"), "png");
      writeFileSync(join(temp, "screenshots", "dialog.png"), "png");

      const target = (id: string, screenshot: string | null, viewport = "desktop") => ({
        kind: "story",
        target: id,
        name: id,
        viewport,
        passed: id !== "dialog--default",
        screenshot,
      });

      const resultsPath = join(temp, "results.json");
      writeFileSync(
        resultsPath,
        JSON.stringify({
          targets: [
            target("dialog--default", "screenshots/dialog.png"),
            target("dialog--default", "screenshots/dialog.png", "mobile"),
            target("editor--empty", "screenshots/editor.png"),
            target("button--overview", "screenshots/missing.png"),
            target("history--three", "screenshots/dialog.png"),
          ],
        }),
      );
      // The editor and button stories import changed modules; the dialog story is one step further.
      const result = select([
        "capabilities/decisions/web/src/views/decision-editor.tsx",
        "foundation/ui/src/button/button.tsx",
      ]);
      const selection = { storyIds: result.selected.map((s) => s.id), ...result };

      const captured = (id: string, storyFile: string, filename: string, passed: boolean) => ({
        storyId: id,
        title: id.split("--")[0],
        name: id.split("--")[1],
        storyFile,
        passed,
        filename,
        sourcePath: join(temp, "screenshots", filename),
      });

      // The button capture is missing, the mobile capture is not desktop, and history is unselected.
      expect(collectCapturedScreenshots(resultsPath, selection)).toEqual([
        captured(
          "editor--empty",
          "capabilities/grantmaking/web/src/views/editor.stories.tsx",
          "editor.png",
          true,
        ),
        captured(
          "dialog--default",
          "foundation/ui/src/dialog/dialog.stories.tsx",
          "dialog.png",
          false,
        ),
      ]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test("fails loudly on unreachable remotes instead of misclassifying as a missing branch", () => {
    const temp = mkdtempSync(join(tmpdir(), "merit-shots-err-"));
    try {
      const shot = join(temp, "a.png");
      writeFileSync(shot, "png-a");
      const missingRemote = join(temp, "does-not-exist.git");

      expect(() =>
        publishScreenshotsToOrphanBranch({
          remoteUrl: missingRemote,
          prNumber: 10,
          files: [{ filename: "a.png", sourcePath: shot }],
        }),
      ).toThrow(/Failed to push screenshots/);

      expect(() =>
        cleanupPrScreenshotsFromOrphanBranch({
          remoteUrl: missingRemote,
          prNumber: 10,
        }),
      ).toThrow(/Failed to clean screenshots/);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test("reads each command's flags strictly, with CI's environment as the fallback", () => {
    expect(parseSelectArgs([], {})).toEqual({
      baseRef: "origin/main",
      headRef: "HEAD",
      index: "tooling/storybook/dist/index.json",
      stats: "tooling/storybook/dist/preview-stats.json",
      maxStories: MAX_SCREENSHOT_STORIES,
    });
    expect(
      parseSelectArgs(["--max", "3", "--stats", "s.json"], {
        PR_BASE_SHA: "base",
        PR_HEAD_SHA: "head",
      }),
    ).toMatchObject({ baseRef: "base", headRef: "head", stats: "s.json", maxStories: 3 });
    expect(() => parseSelectArgs(["--max", "3.5"], {})).toThrow("--max must be a whole number");

    const publishArgs = [
      "--results",
      "r.json",
      "--selection",
      "s.json",
      "--out-manifest",
      "m.json",
    ];
    expect(
      parsePublishArgs(publishArgs, { PR_NUMBER: "12", GITHUB_REPOSITORY: "dmprav/merit" }),
    ).toEqual({
      prNumber: 12,
      repo: "dmprav/merit",
      results: "r.json",
      selection: "s.json",
      outManifest: "m.json",
    });
    expect(() => parsePublishArgs(publishArgs, { GITHUB_REPOSITORY: "dmprav/merit" })).toThrow(
      "publish requires --pr",
    );
    expect(() =>
      parsePublishArgs(["--results", "r.json", "--out-manifest", "m.json", "--pr", "12"], {
        GITHUB_REPOSITORY: "dmprav/merit",
      }),
    ).toThrow("--selection");
    expect(() => parsePublishArgs([...publishArgs, "--omitted", "1"], {})).toThrow();

    expect(parseCleanupArgs([], { PR_NUMBER: "9" })).toBe(9);
    expect(parseCleanupArgs(["--pr", "10"], { PR_NUMBER: "9" })).toBe(10);
    expect(() => parseCleanupArgs([], {})).toThrow("cleanup requires --pr or PR_NUMBER.");
    expect(() => parseCleanupArgs(["--pr", "NaN"], {})).toThrow("--pr must be a whole number");
  });
});
