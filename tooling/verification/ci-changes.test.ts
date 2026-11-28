import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { REPO_ROOT } from "../paths.ts";
import { classifyChangedFiles, loadWorkspacePackages } from "./ci-changes.ts";

const workspacePackages = loadWorkspacePackages(REPO_ROOT);

describe("ci-changes", () => {
  test.each(["other", "@merit/*", "@merit/a b", "@merit/trailing\n"])(
    "rejects invalid workspace package name %j before producing filters",
    (name) => {
      const root = mkdtempSync(join(tmpdir(), "merit-ci-manifest-"));
      try {
        mkdirSync(join(root, "app"));
        writeFileSync(join(root, "app/package.json"), JSON.stringify({ name }));
        expect(() => loadWorkspacePackages(root)).toThrow(
          "Invalid Merit package name in app/package.json",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

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
      expect(result.package_filters).toEqual(["@merit/*", "!@merit/storybook"]);
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
    expect(codeResult.package_filters).toContain("@merit/grantmaking");

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
    expect(result.package_filters).toContain("@merit/grantmaking");
    expect(result.package_filters).toContain("@merit/app");
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

  test("routes reviewer tool changes to the AI package and MCP consumer", () => {
    const result = classifyChangedFiles({
      eventName: "pull_request",
      changedFiles: ["capabilities/reviews/ai/src/tools.ts"],
      workspacePackages,
    });
    expect(result.package_filters).toContain("@merit/reviews-ai");
    expect(result.package_filters).toContain("@merit/mcp");
    expect(result.run_app).toBe(true);
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
  test.each([
    ["pull_request", ["capabilities/grantmaking/business/src/index.ts"], false],
    ["pull_request", ["docs/guides/verification.md"], false],
    ["pull_request", ["pnpm-lock.yaml"], true],
    ["pull_request", ["foundation/ui/package.json", "foundation/ui/src/index.ts"], true],
    ["pull_request", ["pnpm-workspace.yaml"], true],
    ["push", ["docs/README.md"], false],
    ["push", ["package.json"], true],
    ["push", null, true],
    ["merge_group", null, true],
    ["workflow_dispatch", ["docs/README.md"], true],
  ] as const)(
    "marks dependency changes for %s of %j as %s",
    (eventName, changedFiles, expected) => {
      const result = classifyChangedFiles({
        eventName,
        changedFiles: changedFiles === null ? null : [...changedFiles],
        workspacePackages,
      });
      expect(result.dependencies_changed).toBe(expected);
    },
  );
  test("imports only Node built-ins, because the changes job runs before dependencies install", () => {
    const source = readFileSync(new URL("./ci-changes.ts", import.meta.url), "utf8");
    const specifiers = [...source.matchAll(/^import [^;]*? from "([^"]+)";$/gms)].map(
      ([, specifier]) => specifier,
    );
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((specifier) => !specifier?.startsWith("node:"))).toEqual([]);
  });

  test("routes agent, hook, and review-config changes to the tooling job", () => {
    for (const files of [
      [".agents/hooks/guard-git.mjs"],
      [".agents/skills/build-feature/review.md"],
      [".claude/settings.json"],
      [".claude/agents/feature-reviewer.md"],
      [".greptile/files.json"],
      [".coderabbit.yaml"],
    ]) {
      const result = classifyChangedFiles({
        eventName: "pull_request",
        changedFiles: files,
        workspacePackages,
      });
      expect(result.docs_only).toBe(false);
      expect(result.run_tooling).toBe(true);
    }
  });
});
