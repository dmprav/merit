import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  buildScreenshotRawUrl,
  cleanupPrScreenshotsFromOrphanBranch,
  publishScreenshotsToOrphanBranch,
  resolveStoryImportPath,
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

  test("selects direct and sibling stories round-robin and caps total stories", () => {
    const indexEntries = {
      "components-button--docs": {
        id: "components-button--docs",
        title: "Components/Button",
        name: "Docs",
        type: "docs",
        importPath: "../../foundation/ui/src/components/button/button.stories.tsx",
      },
      "components-button--overview": {
        id: "components-button--overview",
        title: "Components/Button",
        name: "Overview",
        type: "story",
        importPath: "../../foundation/ui/src/components/button/button.stories.tsx",
      },
      "components-button--disabled": {
        id: "components-button--disabled",
        title: "Components/Button",
        name: "Disabled",
        type: "story",
        importPath: "../../foundation/ui/src/components/button/button.stories.tsx",
      },
      "components-dialog--default": {
        id: "components-dialog--default",
        title: "Components/Dialog",
        name: "Default",
        type: "story",
        importPath: "../../foundation/ui/src/components/dialog/dialog.stories.tsx",
      },
      "components-dialog--long": {
        id: "components-dialog--long",
        title: "Components/Dialog",
        name: "Long",
        type: "story",
        importPath: "../../foundation/ui/src/components/dialog/dialog.stories.tsx",
      },
    };

    const result = selectStoriesForPr({
      changedPaths: [
        "foundation/ui/src/components/button/button.module.css",
        "foundation/ui/src/components/dialog/dialog.stories.tsx",
      ],
      indexEntries,
      maxStories: 3,
    });

    expect(result.selected.map((s) => s.id)).toEqual([
      "components-button--overview",
      "components-dialog--default",
      "components-button--disabled",
    ]);
    expect(result.omittedCount).toBe(1);
  });

  test("returns empty selection when no UI or story files changed", () => {
    expect(
      selectStoriesForPr({
        changedPaths: ["capabilities/reviews/business/src/server/index.ts", "docs/README.md"],
        indexEntries: {},
      }),
    ).toEqual({ selected: [], omittedCount: 0 });
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
});
