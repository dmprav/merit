import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ArchitectureOutput, CheckOutput, HealthOutput } from "fallow/types";
import { loadConfigFromFile } from "vite-plus";
import { expect, test } from "vite-plus/test";

const fallowConfig = readFileSync(new URL("../../.fallowrc.jsonc", import.meta.url), "utf8");
const fallowCli = fileURLToPath(import.meta.resolve("fallow/bin/fallow"));

const checkFallow = <Command extends "architecture" | "dead-code" | "health" = "architecture">(
  files: Record<string, string>,
  command: Command = "architecture" as Command,
) => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "merit-fallow-"));

  const writeFixtureFile = (path: string, content: string) => {
    const target = join(workspaceRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };

  try {
    writeFixtureFile(".fallowrc.jsonc", fallowConfig);
    writeFixtureFile(
      "package.json",
      JSON.stringify({
        private: true,
        workspaces: [
          "app",
          "foundation/*",
          "interfaces/*",
          "capabilities/access",
          "capabilities/*/business",
          "capabilities/*/web",
          "tooling/storybook",
          "tooling/testing",
        ],
      }),
    );

    // Package manifests let Fallow resolve public exports and detect package cycles.
    const packageDirectories = new Set(
      Object.keys(files)
        .filter((path) =>
          /^(app|interfaces|foundation|capabilities)\/|^tooling\/(storybook|testing)\//.test(path),
        )
        .map((path) =>
          path.startsWith("app/")
            ? "app"
            : path
                .split("/")
                .slice(
                  0,
                  path.startsWith("capabilities/") && !path.startsWith("capabilities/access/")
                    ? 3
                    : 2,
                )
                .join("/"),
        ),
    );

    const packageName = (directory: string) => {
      const manifest = files[`${directory}/package.json`];
      const declaredName = manifest ? (JSON.parse(manifest) as { name?: string }).name : undefined;
      if (declaredName?.startsWith("@merit/")) {
        return declaredName.slice("@merit/".length);
      }

      return directory.startsWith("capabilities/")
        ? directory
            .replace(/\/business$/, "")
            .split("/")
            .slice(1)
            .join("-")
        : directory.split("/").at(-1)!;
    };

    for (const packageDirectory of packageDirectories) {
      writeFixtureFile(
        `${packageDirectory}/package.json`,
        JSON.stringify({
          name: `@merit/${packageName(packageDirectory)}`,
          type: "module",
          exports: { ".": "./src/index.ts" },
        }),
      );
    }

    for (const [path, content] of Object.entries(files)) {
      writeFixtureFile(path, content);
    }

    // Resolve package subpath exports as an installed workspace would.
    mkdirSync(join(workspaceRoot, "node_modules/@merit"), { recursive: true });

    for (const packageDirectory of packageDirectories) {
      symlinkSync(
        join(workspaceRoot, packageDirectory),
        join(workspaceRoot, "node_modules/@merit", packageName(packageDirectory)),
        "dir",
      );
    }

    const result = spawnSync(
      process.execPath,
      [
        fallowCli,
        command,
        ...(command === "health" ? ["--complexity", "--production"] : []),
        "--root",
        workspaceRoot,
        "--no-cache",
        "--format",
        "json",
      ],
      { encoding: "utf8" },
    );

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.stdout, result.stderr).not.toBe("");

    return {
      exitCode: result.status,
      report: JSON.parse(result.stdout) as Command extends "health"
        ? HealthOutput
        : ArchitectureOutput | CheckOutput,
    };
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
};

test("detects a package cycle with a type-only edge even when no files form a cycle", () => {
  const { exitCode, report } = checkFallow({
    "foundation/ui/src/button.ts": 'export { actor } from "../../auth/src/index";',
    "foundation/auth/src/index.ts": "export const actor = 1;",
    "foundation/auth/src/mcp.ts": 'export type { Button } from "../../ui/src/types";',
    "foundation/ui/src/types.ts": "export type Button = string;",
  });

  expect(exitCode).toBe(1);
  // Different files create each edge: UI → auth and auth → UI.
  expect(report.circular_dependencies).toHaveLength(0);
  expect(report.package_cycles).toHaveLength(1);
});

test("follows Cloudflare configuration imports while still detecting unused tooling", () => {
  const { exitCode, report } = checkFallow(
    {
      "app/cloudflare.config.ts": 'export { config as default } from "./scripts/config";',
      "app/scripts/config.ts": "export const config = {};",
      "app/scripts/unused.ts": "export const unused = 1;",
    },
    "dead-code",
  );

  expect(exitCode).toBe(1);
  expect(report.unused_files.map(({ path }) => path)).toEqual(["app/scripts/unused.ts"]);
  expect(report.unused_exports).toHaveLength(0);
});

test("recognizes the dynamically loaded architecture resolver without hiding unused tooling", () => {
  const { exitCode, report } = checkFallow(
    {
      "tooling/verification/architecture/resolver.mjs":
        "export const interfaceVersion = 2; export const resolve = () => ({ found: false });",
      "tooling/unused.mjs": "export const unused = 1;",
    },
    "dead-code",
  );

  expect(exitCode).toBe(1);
  expect(report.unused_files).toEqual([expect.objectContaining({ path: "tooling/unused.mjs" })]);
  expect(report.unused_exports).toHaveLength(0);
});

test("recognizes the workspace browser configuration launched by the database harness", () => {
  const { exitCode, report } = checkFallow(
    {
      "app/tests/browser/workspace.playwright.config.ts":
        'export { config as default } from "./workspace-config";',
      "app/tests/browser/workspace-config.ts": "export const config = {};",
      "tooling/unused.ts": "export const unused = 1;",
    },
    "dead-code",
  );

  expect(exitCode).toBe(1);
  expect(report.unused_files.map(({ path }) => path)).toEqual(["tooling/unused.ts"]);
  expect(report.unused_exports).toHaveLength(0);
});

test.each([
  "capabilities/grantmaking/business/tests",
  "capabilities/access/tests",
  "foundation/auth/tests",
])("keeps app-collected integration suites reachable in %s", (directory) => {
  const { exitCode, report } = checkFallow(
    {
      [`${directory}/behavior.integration.ts`]: 'import { value } from "./fixture"; void value;',
      [`${directory}/fixture.ts`]: "export const value = 1;",
      [`${directory}/unused.ts`]: "export const unused = 1;",
    },
    "dead-code",
  );

  expect(exitCode).toBe(1);
  expect(report.unused_files.map(({ path }) => path)).toEqual([`${directory}/unused.ts`]);
  expect(report.unused_exports).toHaveLength(0);
});

test.each([true, false])("checks the host's site dependency when imported: %s", (imported) => {
  const { exitCode, report } = checkFallow(
    {
      "app/package.json": JSON.stringify({
        name: "@merit/app",
        type: "module",
        dependencies: { "@merit/site": "workspace:*" },
      }),
      "app/cloudflare.config.ts": 'import { routes } from "./routes"; export default { routes };',
      "app/routes.ts": imported
        ? 'import { routesDirectory } from "@merit/site/routing"; export const routes = [routesDirectory];'
        : "export const routes = [];",
      "interfaces/site/package.json": JSON.stringify({
        name: "@merit/site",
        type: "module",
        exports: { "./routing": "./routing.ts" },
      }),
      "interfaces/site/routing.ts":
        'export const routesDirectory = new URL("./src/routes/", import.meta.url);',
    },
    "dead-code",
  );

  expect(exitCode).toBe(imported ? 0 : 1);
  expect(report.unused_dependencies).toEqual(
    imported
      ? []
      : [expect.objectContaining({ package_name: "@merit/site", path: "app/package.json" })],
  );
  expect(report.total_issues).toBe(imported ? 0 : 1);
});

test("allows shared export names without exempting unused exports", () => {
  const { exitCode, report } = checkFallow(
    {
      "foundation/i18n/src/index.ts":
        'export { en as first } from "./first"; export { en as second } from "./second";',
      "foundation/i18n/src/first.ts": "export const en = {}; export const unused = 1;",
      "foundation/i18n/src/second.ts": "export const en = {};",
    },
    "dead-code",
  );

  expect(exitCode).toBe(1);
  expect(report.duplicate_exports).toHaveLength(0);
  expect(report.unused_exports).toEqual([
    expect.objectContaining({ path: "foundation/i18n/src/first.ts", export_name: "unused" }),
  ]);
});

test.each([
  "capabilities/grantmaking/business",
  "capabilities/access",
  "capabilities/grantmaking/web",
  "capabilities/contacts/web",
  "capabilities/organizations/web",
])("checks %s entry exports while preserving framework entry exports", (directory) => {
  const entry = directory.endsWith("/web") ? "src/contracts/index.ts" : "src/domain/index.ts";
  const { exitCode, report } = checkFallow(
    {
      [`${directory}/package.json`]: JSON.stringify({
        name: "@merit/example",
        type: "module",
        exports: { "./entry": `./${entry}` },
      }),
      [`${directory}/${entry}`]:
        "export const used = 1; export const unused = 2; export type Unused = string;",
      "app/src/index.ts": `import { used } from "../../${directory}/${entry}"; export default { used };`,
    },
    "dead-code",
  );

  expect(exitCode).toBe(1);
  expect(report.unused_exports).toEqual([
    expect.objectContaining({
      path: `${directory}/${entry}`,
      export_name: "unused",
    }),
  ]);
  expect(report.unused_types).toEqual([
    expect.objectContaining({
      path: `${directory}/${entry}`,
      export_name: "Unused",
    }),
  ]);
  expect(report.total_issues).toBe(2);
});

test.each([
  { reason: " -- Loaded by an external harness", used: false, exitCode: 0 },
  { reason: "", used: false, exitCode: 1 },
  { reason: " -- Loaded by an external harness", used: true, exitCode: 1 },
])("requires a current suppression with a reason: %j", ({ reason, used, exitCode }) => {
  const { exitCode: actualExitCode, report } = checkFallow(
    {
      "foundation/ui/src/index.ts": used ? 'export { value } from "./external";' : "export {};",
      "foundation/ui/src/external.ts": `// fallow-ignore-file unused-file${reason}\nexport const value = 1;`,
    },
    "dead-code",
  );

  expect(actualExitCode).toBe(exitCode);
  expect(report.unused_files).toHaveLength(0);

  if (exitCode === 0) {
    expect(report.total_issues).toBe(0);
  } else {
    expect(report.stale_suppressions?.length).toBeGreaterThan(0);
  }
});

test("recognizes React Email preview files as development entry points", () => {
  const { exitCode, report } = checkFallow(
    {
      "interfaces/emails/src/features/organizations/previews/owner.tsx":
        'import { example } from "../example"; export default () => example;',
      "interfaces/emails/src/features/organizations/example.ts":
        'export const example = "Invitation";',
    },
    "dead-code",
  );

  expect(report.total_issues).toBe(0);
  expect(exitCode).toBe(0);
});

test("allows the CLI-loaded preview dependency only in the email app", () => {
  const { exitCode, report } = checkFallow(
    {
      "interfaces/emails/package.json": JSON.stringify({
        name: "@merit/emails",
        private: true,
        devDependencies: { "@react-email/ui": "6.11.8" },
      }),
      "interfaces/product/package.json": JSON.stringify({
        name: "@merit/product",
        private: true,
        devDependencies: { "@react-email/ui": "6.11.8" },
      }),
    },
    "dead-code",
  );

  expect(exitCode).toBe(1);
  expect(report.unused_dev_dependencies).toHaveLength(1);
  expect(report.unused_dev_dependencies[0]).toEqual(
    expect.objectContaining({
      package_name: "@react-email/ui",
      path: "interfaces/product/package.json",
    }),
  );
});

test("recognizes Storybook manual mocks without hiding ordinary unused feature files", () => {
  const { report } = checkFallow(
    {
      "interfaces/product/src/features/team/__mocks__/team.functions.ts":
        "export const readTeam = () => null;",
      "interfaces/product/src/app/__mocks__/workspace-account.tsx":
        "export const WorkspaceAccount = () => null;",
      "interfaces/admin/src/features/organizations/data/server/__mocks__/organizations.functions.ts":
        "export const readOrganization = () => null;",
      "interfaces/product/src/features/team/unused.ts": "export const unused = true;",
    },
    "dead-code",
  );

  expect(report.unused_files.map(({ path }) => path)).toEqual([
    "interfaces/product/src/features/team/unused.ts",
  ]);
});

const branches = (name: string, count: number) =>
  `export const ${name} = (value: number) => {
    ${Array.from({ length: count }, (_, index) => `if (value === ${index}) { return ${index}; }`).join("\n")}
    return -1;
  };`;

const switchCases = (count: number) =>
  `export const choose = (value: number) => {
    switch (value) {
      ${Array.from({ length: count }, (_, index) => `case ${index}: return ${index};`).join("\n")}
      default: return -1;
    }
  };`;

test.each([
  { dimension: "cognitive", source: branches("choose", 15), exitCode: 0 },
  { dimension: "cognitive", source: branches("choose", 16), exitCode: 1 },
  { dimension: "cyclomatic", source: switchCases(19), exitCode: 0 },
  { dimension: "cyclomatic", source: switchCases(20), exitCode: 1 },
])("enforces the $dimension boundary (exit $exitCode)", ({ dimension, source, exitCode }) => {
  const result = checkFallow({ "foundation/ui/src/index.ts": source }, "health");

  expect(result.exitCode, JSON.stringify(result.report.findings)).toBe(exitCode);
  expect(result.report.summary).toMatchObject({
    max_cognitive_threshold: 15,
    max_cyclomatic_threshold: 20,
    max_crap_threshold: 0,
  });
  expect(result.report.findings).toEqual(
    exitCode === 0 ? [] : [expect.objectContaining({ name: "choose", exceeded: dimension })],
  );
});

test.each([
  "foundation/ui/src/new-component.tsx",
  "capabilities/example/business/src/domain/new-rule.ts",
  "app/src/new-handler.ts",
])("checks new production source even without an entry import: %s", (path) => {
  const { exitCode, report } = checkFallow(
    { "foundation/ui/src/index.ts": "export {};", [path]: branches("complex", 16) },
    "health",
  );

  expect(exitCode).toBe(1);
  expect(report.findings).toEqual([expect.objectContaining({ path, name: "complex" })]);
});

test.each([
  "foundation/ui/src/routeTree.gen.ts",
  "foundation/ui/src/example.test.ts",
  "foundation/ui/src/example.spec.tsx",
  "foundation/ui/src/example.stories.tsx",
  "foundation/ui/tests/example.integration.ts",
  "foundation/ui/src/fixtures/example.ts",
  "foundation/ui/src/__fixtures__/example.ts",
  "foundation/ui/src/__mocks__/example.ts",
  "tooling/verification/example.ts",
])("excludes nonproduction complexity: %s", (path) => {
  const { exitCode, report } = checkFallow(
    { "foundation/ui/src/index.ts": "export {};", [path]: branches("complex", 25) },
    "health",
  );

  expect(exitCode).toBe(0);
  expect(report.findings).toEqual([]);
});

test("keeps health exclusions out of dead-code analysis", () => {
  const { exitCode, report } = checkFallow(
    {
      "foundation/ui/src/index.ts": "export {};",
      "foundation/ui/src/fixtures/unused.ts": "export const unused = 1;",
    },
    "dead-code",
  );

  expect(exitCode).toBe(1);
  expect(report.unused_files).toEqual([
    expect.objectContaining({ path: "foundation/ui/src/fixtures/unused.ts" }),
  ]);
});

test("does not gate function length, parameter count, or estimated coverage risk", () => {
  const source = `export const long = (a: number, b: number, c: number, d: number, e: number) => {
    let value = a + b + c + d + e;
    ${"value += 1;\n".repeat(600)}
    return value;
  };\n${branches("untested", 15)}`;
  const { exitCode, report } = checkFallow({ "foundation/ui/src/index.ts": source }, "health");

  expect(exitCode).toBe(0);
  expect(report.findings).toEqual([]);
});

test("runs complexity as a required static check with the tested production flags", async () => {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  );
  const tasks = loaded?.config.run?.tasks;

  expect(tasks?.["check:complexity"]).toMatchObject({
    command: "fallow health --complexity --production --no-cache",
    cache: { output: [] },
  });
  expect(tasks?.["ready:static"]).toHaveProperty(
    "command",
    expect.arrayContaining(["vp run check:complexity"]),
  );
});

// Nesting reaches the cognitive ceiling without also exceeding the cyclomatic limit.
const nestedBranches = (name: string, count: number) =>
  branches(name, count - 6).replace(
    "return -1;",
    "if (value < 0) { if (value < -1) { if (value < -2) { return -2; } } } return -1;",
  );

test.each([
  {
    path: "capabilities/reviews/web/src/controllers/reviewer/use-reviewer.ts",
    name: "useReviewer",
    count: 20,
    exitCode: 0,
  },
  {
    path: "capabilities/reviews/web/src/controllers/reviewer/use-reviewer.ts",
    name: "useReviewer",
    count: 21,
    exitCode: 1,
  },
  {
    path: "capabilities/reviews/web/src/controllers/reviewer/use-reviewer.ts",
    name: "unrelated",
    count: 16,
    exitCode: 1,
  },
  {
    path: "capabilities/reviews/web/src/controllers/reviewer/other.ts",
    name: "useReviewer",
    count: 16,
    exitCode: 1,
  },
])(
  "bounds the configured exception to $path / $name / $count",
  ({ path, name, count, exitCode }) => {
    const result = checkFallow({ [path]: nestedBranches(name, count) }, "health");
    expect(result.exitCode, JSON.stringify(result.report.findings)).toBe(exitCode);
  },
);
