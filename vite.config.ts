import { defineConfig } from "vite-plus";

import { lint } from "./tooling/verification/lint";

export default defineConfig({
  staged: {
    "!(*.css)": "vp check --fix --deny-warnings",
    "*.css": ["stylelint --fix --max-warnings 0", "vp fmt"],
  },
  fmt: {
    ignorePatterns: ["**/routeTree.gen.ts"],
    sortImports: {
      internalPattern: ["@merit/"],
      groups: ["builtin", "external", "internal", ["parent", "sibling", "index"], "unknown"],
      newlinesBetween: true,
      // Keep TypeScript reference directives ahead of imports.
      partitionByComment: true,
      sortSideEffects: false,
    },
  },
  lint,
  test: { allowOnly: false },
  run: {
    // Cloud sandboxes and WSL2 inherit a seccomp user-notify listener, which makes
    // Vite Task's file-tracking listener fail with EBUSY (voidzero-dev/vite-plus#1643).
    ...(process.env.MERIT_TASK_CACHE === "off" ? { cache: false } : {}),
    tasks: {
      dev: "vp run @merit/app#dev",
      "dev:workspace": "vp run @merit/app#dev:workspace",
      storybook: "vp run @merit/storybook#dev",
      "test:browser": [
        "vp run test:browser:tooling",
        "vp run test:browser:stories",
        "vp run test:browser:app",
      ],
      "test:browser:all": [
        "vp run test:browser:tooling:all",
        "vp run test:browser:stories:all",
        "vp run test:browser:app:all",
      ],
      emails: "vp run @merit/emails#dev",
      "eval:mcp": { command: "node app/tests/evals/mcp/run.ts", cache: false },
      "eval:mcp:report": {
        command: "node app/tests/evals/mcp/report.ts",
        cache: false,
      },
      "test:stories": "vp run @merit/storybook#test",
      "test:stories:watch": "vp run @merit/storybook#test:watch",
      "test:browser:app": "vp run @merit/app#test:demo-browser",
      "test:browser:app:all": "vp run @merit/app#test:demo-browser:all",
      ready: {
        // These probes write invalid source; run them after all source readers finish.
        command: "vp run test:checks",
        dependsOn: [
          "ready:static",
          "ready:tests",
          "ready:runtime",
          "ready:tooling",
          "check:security",
        ],
        cache: false,
      },
      "ready:build": {
        command: "vp run -r build",
        dependsOn: ["check:docs"],
        cache: false,
      },
      "ready:static": {
        command: [
          "vp run -r typecheck",
          "vp run check:code",
          "vp run check:react-compiler",
          "vp run check:css",
          "vp run architecture",
          "vp run code-health",
          "vp run check:complexity",
          "vp run @merit/db#db:check",
        ],
        dependsOn: ["ready:build"],
        cache: false,
      },
      "ready:tests": {
        command: "vp run -r --parallel --concurrency-limit 2 test",
        dependsOn: ["ready:build"],
        cache: false,
      },
      "ready:runtime": {
        command: [
          "vp run @merit/app#test:integration",
          "vp run test:browser:all",
          "vp run @merit/app#test:workspace:all",
        ],
        // Database suites spawn many workers; leave capacity for the package tests.
        dependsOn: ["ready:tests"],
        cache: false,
      },
      "ready:tooling": {
        command: [
          "vp run test:docs",
          "vp run test:design-system",
          "vp run test:react-compiler",
          "vp run test:fallow",
          "vp run test:architecture",
          "vp run test:security",
          "vp run test:commits",
          "vp run test:hooks",
          "vp run test:agents",
          "vp run test:ci",
        ],
        cache: false,
      },
      "agent:scout": { command: "vpx tooling/agents/scout.ts", cache: false },
      "agent:proposal": { command: "vpx tooling/agents/proposal.ts", cache: false },
      "agent:queue": { command: "vpx tooling/agents/queue.ts", cache: false },
      "agent:ledger": { command: "vpx tooling/agents/ledger.ts", cache: false },
      "agent:prune-verifications": {
        command: "node tooling/agents/prune-verifications.ts",
        cache: false,
      },
      "worktree:create": { command: "vpx tooling/agents/worktree.ts create", cache: false },
      "worktree:clean": { command: "vpx tooling/agents/worktree.ts clean", cache: false },
      "worktree:list": { command: "vpx tooling/agents/worktree.ts list", cache: false },
      "db:reset": { command: "vpx tooling/scripts/reset-db.ts", cache: false },
      "services:start": { command: "vpx tooling/scripts/start-services.ts", cache: false },
      "test:browser:tooling": "vp run @merit/test-support#test:browser",
      "test:browser:tooling:all": "vp run @merit/test-support#test:browser:all",
      "test:browser:stories": {
        command: "vp run @merit/storybook#test:browser",
        cache: false,
      },
      "test:browser:stories:all": {
        command: "vp run @merit/storybook#test:browser:all",
        cache: false,
      },
      "test:browser:stories:container": {
        command: "vpx tooling/storybook/run-visual-container.ts",
        cache: false,
      },
      "ui:verify": { command: "vpx tooling/storybook/ui-verify.ts", cache: false },
      "check:code": { command: "vp check --deny-warnings", cache: { output: [] } },
      "check:react-compiler": {
        command: "vpx tooling/verification/react-compiler.ts",
        cache: { output: [] },
      },
      "check:commit": { command: "commitlint --edit", cache: false },
      "test:commits": { command: "vp test tooling/verification/commits.test.ts", cache: false },
      "test:hooks": { command: "vp test tooling/verification/hooks.test.ts", cache: false },
      "test:agents": {
        command:
          "vp test tooling/cli.test.ts tooling/agents/ tooling/storybook/ui-verify.test.ts tooling/storybook/ui-verify/",
        cache: false,
      },
      "test:ci": {
        command:
          "vp test tooling/verification/ci.test.ts tooling/verification/ci-changes.test.ts tooling/verification/ci-summary.test.ts tooling/verification/ci-browser-history.test.ts tooling/verification/verification-record.test.ts tooling/verification/agent-policy.test.ts tooling/verification/pr-review-packet.test.ts tooling/verification/pr-screenshots.test.ts",
        cache: false,
      },
      "ci:review-packet": {
        command: "vpx tooling/verification/pr-review-packet.ts",
        cache: false,
      },
      "ci:browser-history": {
        command: "vpx tooling/verification/ci-browser-history.ts",
        cache: false,
      },
      "ci:summary": { command: "vpx tooling/verification/ci-summary.ts", cache: false },
      "check:security": {
        command: ["vp run check:secrets", "vp run check:dependencies"],
        cache: false,
      },
      "check:dependencies": { command: "pnpm audit --audit-level=high", cache: false },
      "check:secrets": { command: "vpx tooling/verification/secrets.ts", cache: false },
      "check:secrets:staged": {
        command: "vpx tooling/verification/secrets.ts staged",
        cache: false,
      },
      "check:secrets:history": {
        command: "vpx tooling/verification/secrets.ts history",
        cache: false,
      },
      "test:security": { command: "vp test tooling/verification/secrets.test.ts", cache: false },
      architecture: {
        command: [
          "vp lint --config tooling/verification/architecture/config.ts .",
          "fallow architecture --no-cache",
          "vp test tooling/verification/architecture/typescript.test.ts",
          "vpx tooling/verification/architecture/mechanisms.ts --check",
        ],
        cache: { output: [] },
      },
      "code-health": { command: "fallow dead-code --no-cache", cache: { output: [] } },
      "check:complexity": {
        command: "fallow health --complexity --production --no-cache",
        cache: { output: [] },
      },
      "test:fallow": { command: "vp test tooling/verification/fallow.test.ts", cache: false },
      "test:architecture": {
        command:
          "vp test tooling/verification/architecture/architecture.test.ts tooling/verification/architecture/mechanisms.test.ts",
        cache: false,
      },
      "test:checks": {
        command:
          "vp test tooling/verification/checks.test.ts tooling/scripts/reset-db.test.ts tooling/scripts/start-services.test.ts",
        cache: false,
      },
      "test:docs": { command: "vp test tooling/verification/docs.test.ts", cache: false },
      "test:design-system": {
        command:
          "vp test tooling/storybook/catalog.test.ts tooling/storybook/design-system/tokens.test.ts tooling/storybook/design-system/fonts.test.ts tooling/storybook/design-system/bundle.test.ts tooling/storybook/design-system/build.test.ts",
        cache: false,
      },
      "test:react-compiler": {
        command: "vp test tooling/verification/react-compiler.test.ts",
        cache: false,
      },
      "check:docs": {
        command: "remark . --ext md,mdx --ignore-path .gitignore --frail --no-stdout --quiet",
        cache: { output: [] },
      },
      "check:css": {
        command:
          'stylelint "{interfaces,app,capabilities,foundation,tooling}/**/*.css" --max-warnings 0',
        cache: { output: [] },
      },
    },
  },
});
