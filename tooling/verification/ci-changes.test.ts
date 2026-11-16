import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import { classifyChangedFiles, loadWorkspacePackages } from "./ci-changes.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const workspacePackages = loadWorkspacePackages(repoRoot);

describe("ci-changes", () => {
  test("runs full suite on non-PR events", () => {
    for (const eventName of ["push", "merge_group", "workflow_dispatch"]) {
      const result = classifyChangedFiles({
        eventName,
        changedFiles: ["docs/README.md"],
        workspacePackages,
      });
      expect(result.full_run).toBe(true);
      expect(result.docs_only).toBe(false);
      expect(result.run_app).toBe(true);
      expect(result.run_storybook).toBe(true);
      expect(result.run_tooling).toBe(true);
      expect(result.package_filters).toBe("--filter '@merit/*' --filter '!@merit/storybook'");
    }
  });

  test("classifies docs-only PRs including package READMEs", () => {
    const result = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["docs/guides/verification.md", "capabilities/grants/business/README.md"],
      workspacePackages,
    });
    expect(result.docs_only).toBe(true);
    expect(result.renovate_only).toBe(false);
    expect(result.full_run).toBe(false);
    expect(result.run_app).toBe(false);
    expect(result.run_storybook).toBe(false);
  });

  test("routes verification records like documentation", () => {
    const docsResult = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["docs/guides/verification.md", "verifications/42.md"],
      workspacePackages,
    });
    expect(docsResult.docs_only).toBe(true);

    const cleanupResult = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["verifications/40.md", "verifications/41.md"],
      workspacePackages,
    });
    expect(cleanupResult.docs_only).toBe(true);

    const codeResult = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["capabilities/grantmaking/business/src/index.ts", "verifications/42.md"],
      workspacePackages,
    });
    expect(codeResult.docs_only).toBe(false);
    expect(codeResult.full_run).toBe(false);
    expect(codeResult.run_tooling).toBe(false);
    expect(codeResult.package_filters).toContain("--filter '@merit/grantmaking'");

    const renovateResult = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["renovate.json", "verifications/42.md"],
      workspacePackages,
    });
    expect(renovateResult.renovate_only).toBe(true);
    expect(renovateResult.docs_only).toBe(false);
    expect(renovateResult.full_run).toBe(false);
  });

  test("classifies renovate-only PRs without triggering full suite", () => {
    const result = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["renovate.json"],
      workspacePackages,
    });
    expect(result.renovate).toBe(true);
    expect(result.renovate_only).toBe(true);
    expect(result.docs_only).toBe(false);
    expect(result.full_run).toBe(false);
    expect(result.run_app).toBe(false);
  });

  test("triggers full_run when root or workflow files change", () => {
    const result = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: [".github/workflows/verify.yml"],
      workspacePackages,
    });
    expect(result.full_run).toBe(true);
    expect(result.renovate).toBe(false);
    expect(result.run_app).toBe(true);
    expect(result.run_storybook).toBe(true);
    expect(result.run_tooling).toBe(true);
  });

  test("routes capability changes to transitive dependents without running storybook unnecessarily", () => {
    const result = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["capabilities/grantmaking/business/src/index.ts"],
      workspacePackages,
    });
    expect(result.full_run).toBe(false);
    expect(result.run_app).toBe(true);
    expect(result.run_storybook).toBe(false);
    expect(result.run_tooling).toBe(false);
    expect(result.run_package_tests).toBe(true);
    expect(result.package_filters).toContain("--filter '@merit/grantmaking'");
    expect(result.package_filters).toContain("--filter '@merit/app'");
  });

  test("routes shared UI changes to both app and storybook", () => {
    const result = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["foundation/ui/src/index.ts"],
      workspacePackages,
    });
    expect(result.full_run).toBe(false);
    expect(result.run_app).toBe(true);
    expect(result.run_storybook).toBe(true);
  });

  test("routes direct Storybook story sources in forms and capability web packages", () => {
    const formsResult = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["foundation/forms/src/form/form-dialog.stories.tsx"],
      workspacePackages,
    });
    expect(formsResult.run_storybook).toBe(true);
    expect(formsResult.run_app).toBe(true);

    const webResult = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["capabilities/reviews/web/src/components/assessment.stories.tsx"],
      workspacePackages,
    });
    expect(webResult.run_storybook).toBe(true);
    expect(webResult.run_app).toBe(true);
  });
});
