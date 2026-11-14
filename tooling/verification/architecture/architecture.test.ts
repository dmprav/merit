import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import architectureConfig from "./config";

const config = fileURLToPath(new URL("./config.ts", import.meta.url));
const vpPackage = fileURLToPath(import.meta.resolve("vite-plus/package.json"));
const vp = join(dirname(vpPackage), "bin/vp");
const oxlint = join(dirname(createRequire(vpPackage).resolve("oxlint/package.json")), "bin/oxlint");
const resultSchema = z.object({
  diagnostics: z.array(
    z.object({ code: z.string(), message: z.string(), help: z.string().nullish() }),
  ),
});
const source = "capabilities/grantmaking/web/src/views/probe.ts";
const contactPackage = {
  name: "@merit/contacts",
  type: "module",
  exports: { "./domain": "./src/domain/index.ts", "./server": "./src/server/index.ts" },
};
const baseFiles = {
  "capabilities/organizations/business/package.json": JSON.stringify({
    name: "@merit/organizations",
    type: "module",
    exports: { "./server": "./src/server/index.ts" },
  }),
  "capabilities/organizations/business/src/server/index.ts":
    "export const server = 1; export type Server = number;",
  "capabilities/contacts/business/package.json": JSON.stringify(contactPackage),
  "capabilities/contacts/business/src/domain/index.ts":
    'export { value } from "./model"; export type { Value } from "./model";',
  "capabilities/contacts/business/src/domain/model.ts":
    "export const value = 1; export type Value = number;",
  "capabilities/contacts/business/src/server/index.ts":
    "export const server = 1; export type Server = number;",
};

const grantmakingRoot = "capabilities/grantmaking/business";
const grantmakingFiles = {
  [`${grantmakingRoot}/package.json`]: JSON.stringify({
    name: "@merit/grantmaking",
    type: "module",
    exports: {
      "./domain": "./src/domain/value.ts",
      "./api": "./src/api/index.ts",
      "./server": "./src/server/index.ts",
      "./server/integrations": "./src/server/integrations.ts",
      "./server/demo": "./src/server/demo.ts",
      "./examples": "./src/examples/value.ts",
    },
  }),
  ...Object.fromEntries(
    [
      "domain/value.ts",
      "api/commands.ts",
      "api/commands/value.ts",
      "api/queries.ts",
      "api/queries/value.ts",
      "api/values.ts",
      "api/index.ts",
      "api/service.ts",
      "server/commands/value.ts",
      "server/queries/value.ts",
      "server/persistence/commands/value.ts",
      "server/persistence/queries/value.ts",
      "server/persistence/schema.ts",
      "server/persistence/encoding.ts",
      "server/persistence/locks.ts",
      "server/persistence/projections.ts",
      "server/index.ts",
      "server/service.ts",
      "server/integrations.ts",
      "server/demo.ts",
      "examples/value.ts",
    ].map((path) => [
      `${grantmakingRoot}/src/${path}`,
      "export const value = 1; export type Value = number;",
    ]),
  ),
};

const contactsRoot = "capabilities/contacts/business";
const contactsFiles = Object.fromEntries(
  Object.entries(grantmakingFiles).map(([path, contents]) => [
    path.replace(grantmakingRoot, contactsRoot),
    contents.replaceAll("@merit/grantmaking", "@merit/contacts"),
  ]),
);
const organizationsRoot = "capabilities/organizations/business";
const organizationsFiles = Object.fromEntries(
  Object.entries(grantmakingFiles).map(([path, contents]) => [
    path.replace(grantmakingRoot, organizationsRoot),
    contents.replaceAll("@merit/grantmaking", "@merit/organizations"),
  ]),
);
const newRoot = "capabilities/new-capability/business";
const newFiles = Object.fromEntries(
  Object.entries(grantmakingFiles).map(([path, contents]) => [
    path.replace(grantmakingRoot, newRoot),
    contents.replaceAll("@merit/grantmaking", "@merit/new-capability"),
  ]),
);
const roleFixtures = [
  { name: "New capability", root: newRoot, files: newFiles },
  { name: "Organizations", root: organizationsRoot, files: organizationsFiles },
  { name: "Grantmaking", root: grantmakingRoot, files: grantmakingFiles },
  { name: "Contacts", root: contactsRoot, files: contactsFiles },
];
const collaborationFiles = {
  ...grantmakingFiles,
  ...contactsFiles,
  ...organizationsFiles,
  [`${contactsRoot}/package.json`]: JSON.stringify({
    name: "@merit/contacts",
    type: "module",
    exports: {
      "./domain": "./src/domain/value.ts",
      "./api": "./src/api/index.ts",
      "./server": "./src/server/index.ts",
      "./server/demo": "./src/server/demo.ts",
      "./server/grant-work": "./src/server/grant-work.ts",
      "./schema": "./src/server/persistence/schema.ts",
      "./scope": "./src/server/persistence/scope.ts",
    },
  }),
  [`${organizationsRoot}/package.json`]: JSON.stringify({
    name: "@merit/organizations",
    type: "module",
    exports: {
      "./api": "./src/api/index.ts",
      "./server": "./src/server/index.ts",
      "./server/demo": "./src/server/demo.ts",
      "./schema": "./src/server/persistence/membership-schema.ts",
      "./scope": "./src/server/persistence/scope.ts",
      "./locks": "./src/server/persistence/commands/locks.ts",
    },
  }),
  "capabilities/access/package.json": JSON.stringify({
    name: "@merit/access",
    type: "module",
    exports: { "./scope": "./src/persistence/scope.ts" },
  }),
  ...Object.fromEntries(
    [
      `${contactsRoot}/src/server/persistence/scope.ts`,
      `${contactsRoot}/src/server/grant-work.ts`,
      `${organizationsRoot}/src/server/persistence/membership-schema.ts`,
      `${organizationsRoot}/src/server/persistence/scope.ts`,
      `${organizationsRoot}/src/server/persistence/commands/locks.ts`,
      "capabilities/access/src/persistence/scope.ts",
    ].map((path) => [path, "export const value = 1; export type Value = number;"]),
  ),
};

const runLinter = (args: string[], cwd: string) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out running ${args.join(" ")}:\n${stderr}${stdout}`));
    }, 15_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      expect(signal).toBeNull();
      resolve({ status, stdout, stderr });
    });
  });

const check = async (files: Record<string, string>, message?: string, viaVp = false) => {
  const root = mkdtempSync(join(tmpdir(), "merit-boundaries-"));
  const contents: Record<string, string> = {
    ".gitignore": "node_modules/\n",
    "package.json": JSON.stringify({ private: true, type: "module" }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: { moduleResolution: "bundler", module: "esnext", target: "es2023" },
    }),
    ...baseFiles,
    ...files,
  };

  try {
    for (const [path, text] of Object.entries(contents)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    mkdirSync(join(root, "node_modules/@merit"), { recursive: true });
    for (const dependency of ["zod", "drizzle-orm"]) {
      symlinkSync(
        dirname(fileURLToPath(import.meta.resolve(dependency))),
        join(root, "node_modules", dependency),
        "dir",
      );
    }
    for (const [dependency, owner] of [
      ["@tanstack/react-query", "interfaces/admin"],
      ["@tanstack/react-router", "interfaces/product"],
      ["react-aria-components", "foundation/ui"],
    ]) {
      const require = createRequire(new URL(`../../../${owner}/package.json`, import.meta.url));
      const target = join(root, "node_modules", dependency!);
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(dirname(require.resolve(`${dependency}/package.json`)), target, "dir");
    }
    for (const [path, text] of Object.entries(contents)) {
      if (path.endsWith("/package.json")) {
        const { name } = z.object({ name: z.string() }).parse(JSON.parse(text));
        symlinkSync(join(root, dirname(path)), join(root, "node_modules", name), "dir");
      }
    }

    let args: string[];
    if (viaVp) {
      args = [vp, "lint", "--config", config, "--format", "json", "."];
    } else {
      const oxlintConfig = join(root, ".oxlintrc.merit.json");
      const baseLint = architectureConfig.lint;
      if (!baseLint) {
        throw new Error("Expected architectureConfig.lint to be defined.");
      }
      writeFileSync(
        oxlintConfig,
        JSON.stringify({
          ...baseLint,
          ignorePatterns: [...(baseLint.ignorePatterns ?? []), ".oxlintrc.merit.json"],
          settings: { ...baseLint.settings, "boundaries/root-path": root },
        }),
      );
      args = [oxlint, "--config", oxlintConfig, "--format", "json", "."];
    }

    const result = await runLinter(args, root);
    const report = resultSchema.parse(JSON.parse(result.stdout));
    expect(result.status, result.stderr + result.stdout).toBe(message ? 1 : 0);
    if (message) {
      expect(
        report.diagnostics
          .map((diagnostic) => `${diagnostic.message} ${diagnostic.help ?? ""}`)
          .join("\n"),
      ).toContain(message);
    } else {
      expect(report.diagnostics).toEqual([]);
    }
    return report;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe.concurrent("architecture rules", () => {
  test("applies the boundaries configuration through vp lint", async () => {
    await check(
      { [source]: 'export { server } from "@merit/contacts/server";' },
      "Browser code",
      true,
    );
  }, 15_000);

  test("public package exports authorize re-exported implementation without a second file list", async () => {
    await check({ [source]: 'export { value } from "@merit/contacts/domain";' });
  });

  test.each(
    ["capabilities/grantmaking/web/src", "interfaces/admin/src/features/organizations"].flatMap(
      (root) =>
        ["views", "controllers"].flatMap((role) =>
          (root.startsWith("interfaces/")
            ? ["data/source", "organization.functions"]
            : ["data/source"]
          ).map((dependency) => ({ root, role, dependency })),
        ),
    ),
  )("keeps $root/$role independent of $dependency", async ({ root, role, dependency }) => {
    await check(
      {
        [`${root}/${role}/probe.ts`]: `export type { Operation } from "../${dependency}";`,
        [`${root}/${dependency}.ts`]: "export type Operation = () => Promise<void>;",
      },
      "Views and controllers receive operations through contracts",
    );
  });

  test("keeps query-cache access out of views", async () => {
    await check(
      {
        [source]: 'export { useQueryClient } from "@tanstack/react-query";',
      },
      "Views present workflow state",
    );
  });

  test.each([
    ["controllers", "views", "Controllers cannot depend on presentation"],
    ["data", "views", "Data adapters cannot depend on views or controllers"],
    ["data", "controllers", "Data adapters cannot depend on views or controllers"],
  ])("rejects %s depending on %s through a local barrel", async (from, to, message) => {
    const root = "interfaces/admin/src/features/organizations";
    await check(
      {
        [`${root}/${from}/probe.ts`]: `export { value } from "../${to}";`,
        [`${root}/${to}/index.ts`]: 'export { value } from "./private";',
        [`${root}/${to}/private.ts`]: "export const value = 1;",
      },
      message,
    );
  });

  test("allows composition to bind data, controllers, and views through browser-safe contracts", async () => {
    const root = "interfaces/admin/src/features/organizations";
    await check({
      [`${root}/contracts.ts`]: "export type Operation = () => Promise<void>;",
      [`${root}/organization.functions.ts`]: "export const operation = async () => {};",
      [`${root}/data/source.ts`]:
        'export { operation } from "../organization.functions"; export type { Operation } from "../contracts";',
      [`${root}/controllers/workflow.ts`]:
        'import type { Operation } from "../contracts"; export const workflow = (operation: Operation) => operation;',
      [`${root}/views/view.ts`]: 'export { workflow } from "../controllers/workflow";',
      [`${root}/screens.ts`]:
        'export { operation } from "./data/source"; export { workflow } from "./views/view";',
    });
  });

  test.each([
    [
      "private package subpath",
      'export { value } from "@merit/contacts/src/domain/model";',
      "unknown",
    ],
    [
      "relative package bypass",
      'export { value } from "../../../../contacts/business/src/domain/model";',
      "public @merit exports",
    ],
    ["unresolved alias", 'export { value } from "#unmapped";', "unknown"],
    ["server value", 'export { server } from "@merit/contacts/server";', "Browser code"],
    ["server type", 'export type { Server } from "@merit/contacts/server";', "Browser code"],
    [
      "dynamic server import",
      'export const load = () => import("@merit/contacts/server");',
      "Browser code",
    ],
  ])("rejects %s", async (_name, code, message) => {
    await check({ [source]: code }, message);
  });

  test.each([
    'import { value } from "../../../../contacts/business/src/domain/model"; export { value };',
    'import type { Value } from "../../../../contacts/business/src/domain/model"; export type Probe = Value;',
    'export const load = () => import("../../../../contacts/business/src/domain/model");',
  ])("rejects cross-package implementation access: %s", async (code) => {
    await check({ [source]: code }, "public @merit exports");
  });

  test("a resolved alias cannot bypass package exports", async () => {
    await check(
      {
        [source]: 'export { value } from "#contacts";',
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "#contacts": ["capabilities/contacts/business/src/domain/model.ts"] },
          },
        }),
      },
      "public @merit exports",
    );
  });

  test("domain code cannot import its own persistence, including types", async () => {
    await check(
      {
        "capabilities/contacts/business/src/domain/model.ts":
          'export const value = 1; export type { Value } from "../server/persistence/private";',
        "capabilities/contacts/business/src/server/persistence/private.ts":
          "export type Value = number;",
      },
      "Business domain cannot",
    );
  });

  test("production code cannot import a colocated test", async () => {
    await check(
      {
        [source]: 'export { value } from "./probe.test";',
        "capabilities/grantmaking/web/src/views/probe.test.ts": "export const value = 1;",
      },
      "Production code",
    );
  });

  test("a colocated test can import private production code", async () => {
    await check({
      [source]: "export const value = 1;",
      "capabilities/grantmaking/web/src/views/probe.test.ts": 'export { value } from "./probe";',
    });
  });

  test("foundation cannot import a capability's public API", async () => {
    await check(
      { "foundation/ui/src/probe.ts": 'export { value } from "@merit/contacts/domain";' },
      "Foundation cannot",
    );
  });

  test.each([
    ["capabilities/contacts/business/tests/probe.ts", "Capabilities cannot"],
    ["capabilities/grantmaking/web/src/controllers/probe.ts", "Capabilities cannot"],
    ["interfaces/mcp/src/probe.ts", "Interfaces cannot"],
  ])(
    "keeps %s independent of application assembly even through public exports",
    async (path, message) => {
      await check(
        {
          [path]: 'export { value } from "@merit/app";',
          "app/package.json": JSON.stringify({
            name: "@merit/app",
            type: "module",
            exports: "./src/value.ts",
          }),
          "app/src/value.ts": "export const value = 1;",
        },
        message,
      );
    },
  );

  test("business code cannot import a public web entry", async () => {
    await check(
      {
        "capabilities/contacts/business/src/server/probe.ts":
          'export { value } from "@merit/grantmaking-web";',
        "capabilities/grantmaking/web/package.json": JSON.stringify({
          name: "@merit/grantmaking-web",
          type: "module",
          exports: "./src/value.ts",
        }),
        "capabilities/grantmaking/web/src/value.ts": "export const value = 1;",
      },
      "Business code cannot",
    );
  });

  test.each(["contracts.ts", "contracts/input.ts"])(
    "keeps %s independent of browser adapters",
    async (path) => {
      await check(
        {
          [`capabilities/grantmaking/web/src/${path}`]: `export { value } from "${path.includes("/") ? "../" : "./"}data/private";`,
          "capabilities/grantmaking/web/src/data/private.ts": "export const value = 1;",
        },
        "Business rules and contracts",
      );
    },
  );

  test("a domain barrel cannot re-export server implementation", async () => {
    await check(
      {
        [source]: 'export { server } from "@merit/contacts/domain";',
        "capabilities/contacts/business/src/domain/index.ts": 'export { server } from "../server";',
      },
      "Business domain cannot",
    );
  });

  test("a new business entry is server-only until classified as a contract or domain", async () => {
    await check(
      {
        [source]: 'export { server } from "@merit/contacts/helper";',
        "capabilities/contacts/business/package.json": JSON.stringify({
          ...contactPackage,
          exports: { "./helper": "./src/helper.ts" },
        }),
        "capabilities/contacts/business/src/helper.ts": 'export { server } from "./server";',
      },
      "Browser code",
    );
  });

  test("unclassified source cannot silently escape the check", async () => {
    await check({ "unexpected/source.ts": "export const surprise = 1;" }, "known element");
  });

  test("includes root JavaScript tooling configuration", async () => {
    await check({
      "stylelint.config.mjs": 'export default { rules: { "property-no-unknown": true } };',
    });
  });

  test.each([
    ["@merit/contacts/private", "@merit/contacts/private"],
    ["@merit/contacts/domain", "@merit/contacts/domain"],
    ["@merit/*", "@merit/contacts/private"],
    ["*", "@merit/contacts/private"],
  ])("rejects a workspace export overridden by the %s alias", async (alias, specifier) => {
    await check(
      {
        [source]: `export { value } from "${specifier}";`,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            paths: { [alias]: ["./capabilities/contacts/business/src/domain/model.ts"] },
          },
        }),
      },
      "unknown",
    );
  });

  test("checks inherited aliases in a package's own TypeScript configuration", async () => {
    await check(
      {
        [source]: 'export { value } from "@merit/contacts/domain";',
        "capabilities/grantmaking/web/tsconfig.json": '{"extends":"./aliases.json"}',
        "capabilities/grantmaking/web/aliases.json": JSON.stringify({
          compilerOptions: {
            paths: { "@merit/contacts/domain": ["../../contacts/business/src/domain/model.ts"] },
          },
        }),
      },
      "unknown",
    );
  });

  test("allows an alias to private code inside its own package", async () => {
    await check({
      [source]: 'export { value } from "#local";',
      "capabilities/grantmaking/web/src/private/value.ts": "export const value = 1;",
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          paths: { "#local": ["./capabilities/grantmaking/web/src/private/value.ts"] },
        },
      }),
    });
  });

  test.each([
    ["foundation/ui/src/probe.ts", "Foundation cannot"],
    ["capabilities/grantmaking/web/src/probe.ts", "Capabilities cannot"],
    ["capabilities/contacts/business/tests/probe.ts", "Capabilities cannot"],
  ])("keeps %s independent of interfaces", async (path, message) => {
    await check(
      {
        [path]: 'export { value } from "@merit/product";',
        "interfaces/product/package.json": JSON.stringify({
          name: "@merit/product",
          exports: "./src/index.ts",
        }),
        "interfaces/product/src/index.ts": "export const value = 1;",
      },
      message,
    );
  });

  test("email presentation can use pure business contracts", async () => {
    await check({
      "interfaces/emails/src/template.ts": 'export { value } from "@merit/contacts/domain";',
    });
  });

  const i18nFiles = {
    "foundation/i18n/package.json": JSON.stringify({
      name: "@merit/i18n",
      exports: {
        ".": "./src/index.tsx",
        "./core": "./src/core.ts",
        "./server": "./src/server.tsx",
      },
    }),
    "foundation/i18n/src/index.tsx": 'export { value } from "./core";',
    "foundation/i18n/src/core.ts": "export const value = 1;",
    "foundation/i18n/src/server.tsx": 'export { value } from "./core";',
  };

  test.each([
    ["@merit/i18n/core", undefined],
    ["@merit/i18n/server", undefined],
    ["@merit/i18n", "Email presentation"],
  ])("checks the email translation boundary for %s", async (specifier, message) => {
    await check(
      {
        ...i18nFiles,
        "interfaces/emails/src/template.ts": `export { value } from "${specifier}";`,
      },
      message,
    );
  });

  test("shared translation setup cannot pull in its browser entry", async () => {
    await check(
      {
        ...i18nFiles,
        "foundation/i18n/src/server.tsx": 'export { value } from "./index";',
      },
      "Business rules and contracts cannot depend on UI or infrastructure",
    );
  });

  test.each([
    ["business operations", "@merit/contacts/server"],
    ["browser components", "@merit/ui"],
  ])("keeps email presentation independent of %s", async (_name, specifier) => {
    await check(
      {
        "interfaces/emails/src/template.ts": `export * from "${specifier}";`,
        "foundation/ui/package.json": JSON.stringify({
          name: "@merit/ui",
          exports: "./src/index.ts",
        }),
        "foundation/ui/src/index.ts": "export const button = 1;",
      },
      "Email presentation",
    );
  });

  test.each([
    ["capabilities/contacts/business/src/server/probe.ts", "Production code"],
    ["capabilities/contacts/business/tests/probe.integration.ts", undefined],
  ])("restricts repository test harnesses to tests: %s", async (path, message) => {
    await check(
      {
        [path]: 'export { fixture } from "@merit/test-support";',
        "tooling/testing/package.json": JSON.stringify({
          name: "@merit/test-support",
          exports: "./index.ts",
        }),
        "tooling/testing/index.ts": "export const fixture = 1;",
      },
      message,
    );
  });

  test("production code cannot import routing configuration", async () => {
    await check(
      {
        "interfaces/product/src/index.ts": 'export { value } from "../routing";',
        "interfaces/product/routing.ts": "export const value = 1;",
      },
      "Production code",
    );
  });

  test("browser code cannot import a server module in its own package", async () => {
    await check(
      {
        "interfaces/product/src/features/example/view.ts":
          'export { value } from "./data/private.server";',
        "interfaces/product/src/features/example/data/private.server.ts": "export const value = 1;",
      },
      "Browser code",
    );
  });

  test("server functions can use injected API interfaces for browser callers", async () => {
    await check({
      ...contactsFiles,
      "interfaces/product/src/features/example/data/client.ts":
        'export { server } from "./server/example.functions";',
      "interfaces/product/src/features/example/data/server/example.functions.ts":
        'export type { Value } from "@merit/contacts/api"; export const server = 1;',
    });
  });

  test.each(["type", "value"])(
    "request context rejects server implementation imports: %s",
    async (kind) => {
      await check(
        {
          "interfaces/product/src/shared/request-context.ts":
            kind === "type"
              ? 'export type { Server } from "@merit/organizations/server";'
              : 'export { server } from "@merit/organizations/server";',
        },
        "Browser code",
      );
    },
  );

  test("request contexts cannot expose test-only service types", async () => {
    await check(
      {
        "interfaces/product/src/shared/request-context.ts":
          'export type { Server } from "@merit/organizations/server";',
        "capabilities/organizations/business/package.json": JSON.stringify({
          name: "@merit/organizations",
          type: "module",
          exports: { "./server": "./src/server/service.test.ts" },
        }),
        "capabilities/organizations/business/src/server/service.test.ts":
          "export type Server = number;",
      },
      "Production code",
    );
  });

  test.each([
    'fetch("/api/save")',
    'window.fetch("/api/save")',
    'globalThis.fetch("/api/save")',
    'localStorage.getItem("draft")',
    'sessionStorage.setItem("draft", "value")',
    'window.localStorage.getItem("draft")',
    'window.sessionStorage.getItem("draft")',
    'globalThis.localStorage.getItem("draft")',
    'globalThis.sessionStorage.getItem("draft")',
  ])("keeps direct I/O out of views and controllers: %s", async (call) => {
    const report = await check(
      {
        [source]: `export const bypass = () => ${call};`,
        "capabilities/grantmaking/web/src/controllers/probe.ts": `export const bypass = () => ${call};`,
        "interfaces/product/src/features/example/controllers/probe.ts": `export const bypass = () => ${call};`,
        "interfaces/product/src/features/example/views/probe.ts": `export const bypass = () => ${call};`,
      },
      "Unexpected use",
    );
    expect(report.diagnostics).toHaveLength(4);
  });

  test("data adapters and tests can access fetch and browser storage", async () => {
    await check({
      "capabilities/grantmaking/web/src/data/probe.ts": 'export const load = () => fetch("/api");',
      "interfaces/product/src/features/example/views/probe.test.ts":
        'export const read = () => window.localStorage.getItem("draft");',
    });
  });

  test("a private implementation move preserves a public entry used by composition tests", async () => {
    await check({
      "capabilities/new-capability/business/package.json": JSON.stringify({
        name: "@merit/new-capability",
        exports: { "./server": "./src/server/index.ts" },
      }),
      "capabilities/new-capability/business/src/server/index.ts":
        'export { server } from "./commands/moved";',
      "capabilities/new-capability/business/src/server/commands/moved.ts":
        "export const server = 1;",
      "app/tests/scenario.integration.ts": 'export { server } from "@merit/new-capability/server";',
    });
  });

  test("feature entry points can compose private interface data adapters", async () => {
    await check({
      "interfaces/product/src/features/example/probe.ts":
        'export { value } from "../another/data/moved";',
      "interfaces/product/src/features/another/data/moved.ts": "export const value = 1;",
    });
  });

  const forbiddenRoleEdges: [string, string, string][] = [
    ["domain/probe.ts", "../api/commands", "domain"],
    ["domain/probe.ts", "../server/commands/value", "domain"],
    ["domain/probe.ts", "../examples/value", "domain"],
    ["api/values.ts", "../server/persistence/encoding", "api"],
    ["api/values.ts", "../examples/value", "api"],
    ["server/commands/probe.ts", "../queries/value", "commands"],
    ["server/commands/probe.ts", "../persistence/queries/value", "commands"],
    ["server/commands/probe.ts", "../service", "commands"],
    ["server/commands/probe.ts", "../integrations", "commands"],
    ["server/commands/probe.ts", "../demo", "commands"],
    ["server/queries/probe.ts", "../commands/value", "queries"],
    ["server/queries/probe.ts", "../persistence/commands/value", "queries"],
    ["server/queries/probe.ts", "../service", "queries"],
    ["server/persistence/commands/probe.ts", "../../../api/commands", "command-persistence"],
    ["server/persistence/commands/probe.ts", "../../commands/value", "command-persistence"],
    ["server/persistence/commands/probe.ts", "../../service", "command-persistence"],
    ["server/persistence/commands/probe.ts", "../queries/value", "command-persistence"],
    ["server/persistence/queries/probe.ts", "../../../api/queries", "query-persistence"],
    ["server/persistence/queries/probe.ts", "../../queries/value", "query-persistence"],
    ["server/persistence/queries/probe.ts", "../../service", "query-persistence"],
    ["server/persistence/queries/probe.ts", "../commands/value", "query-persistence"],
    ["server/persistence/schema.ts", "./commands/value", "shared-persistence"],
    ["server/persistence/projections.ts", "./queries/value", "shared-persistence"],
    ["server/persistence/encoding.ts", "../../api/values", "shared-persistence"],
    ["server/integrations.ts", "./service", "integrations"],
    ["server/demo.ts", "./queries/value", "demo"],
    ["examples/probe.ts", "../server/demo", "examples"],
  ];

  test.each(
    forbiddenRoleEdges.map(([path, target, role]) => ({
      name: "New capability",
      root: newRoot,
      files: newFiles,
      path,
      target,
      role,
    })),
  )(
    "$name rejects $path importing $target through every import form",
    async ({ root, files, path, target, role }) => {
      const report = await check(
        {
          ...files,
          [`${root}/src/${path}`]: [
            `import type { Value } from "${target}"; export type Probe = Value;`,
            `export { value } from "${target}";`,
            `export const load = () => import("${target}");`,
          ].join("\n"),
        },
        `Business ${role} cannot`,
      );
      expect(
        report.diagnostics.filter(({ code }) => code === "boundaries(dependencies)"),
      ).toHaveLength(3);
    },
  );

  test("grantmaking commands cannot reach queries through an unclassified server helper", async () => {
    await check(
      {
        ...grantmakingFiles,
        [`${grantmakingRoot}/src/server/commands/probe.ts`]: 'export { value } from "../helper";',
        [`${grantmakingRoot}/src/server/helper.ts`]: 'export { value } from "./queries/value";',
      },
      "Business commands cannot",
    );
  });

  test("grantmaking permits its intended dependency directions and privileged integrations", async () => {
    await check({
      ...grantmakingFiles,
      [`${grantmakingRoot}/src/api/commands.ts`]:
        'export { value } from "./commands/value"; export type { Value } from "./values";',
      [`${grantmakingRoot}/src/api/queries.ts`]:
        'export { value } from "./queries/value"; export type { Value } from "../domain/value";',
      [`${grantmakingRoot}/src/api/index.ts`]:
        'export { value as command } from "./commands"; export { value as query } from "./queries"; export type { Value } from "./service";',
      [`${grantmakingRoot}/src/api/service.ts`]:
        'export type { Value } from "./commands"; export { value } from "./queries";',
      [`${grantmakingRoot}/src/server/commands/value.ts`]:
        'export { value } from "../../api/commands"; export type { Value } from "../persistence/commands/value";',
      [`${grantmakingRoot}/src/server/queries/value.ts`]:
        'export { value } from "../../api/queries"; export type { Value } from "../persistence/queries/value";',
      [`${grantmakingRoot}/src/server/persistence/commands/value.ts`]:
        'export { value } from "../locks"; export type { Value } from "../../../domain/value";',
      [`${grantmakingRoot}/src/server/persistence/queries/value.ts`]:
        'export { value } from "../projections"; export type { Value } from "../encoding";',
      [`${grantmakingRoot}/src/server/persistence/projections.ts`]:
        'export { value } from "./schema";',
      [`${grantmakingRoot}/src/server/persistence/encoding.ts`]:
        'export type { Value } from "../../domain/value";',
      [`${grantmakingRoot}/src/server/service.ts`]:
        'export type { Value } from "../api/service"; export { value as command } from "./commands/value"; export { value as query } from "./queries/value";',
      [`${grantmakingRoot}/src/server/index.ts`]: 'export * from "./service";',
      [`${grantmakingRoot}/src/server/integrations.ts`]:
        'export { value } from "./persistence/queries/value"; export type { Value } from "./persistence/commands/value";',
      [`${grantmakingRoot}/src/server/demo.ts`]:
        'export { value as example } from "../examples/value"; export { value as saved } from "./persistence/commands/value";',
      [`${grantmakingRoot}/src/examples/value.ts`]:
        'export { value } from "../api/queries/value"; export type { Value } from "../domain/value";',
      "interfaces/product/src/shared/request-context.ts":
        'export type { Value } from "@merit/grantmaking/api";',
      [source]: 'export { value } from "@merit/grantmaking/examples";',
      "app/src/server/services.server.ts":
        'export * from "@merit/grantmaking/server"; export * from "@merit/grantmaking/server/integrations";',
      "app/src/server/demo.server.ts": 'export * from "@merit/grantmaking/server/demo";',
      "app/src/server/demo-workspace.server.ts": 'export * from "@merit/grantmaking/server/demo";',
    });
  });

  test.each(["domain/probe.ts", "api/values.ts", "examples/probe.ts"])(
    "pure grantmaking %s rejects server libraries, builtins, and unapproved workspace dependencies",
    async (path) => {
      const report = await check(
        {
          ...grantmakingFiles,
          [`${grantmakingRoot}/src/${path}`]: [
            'export { sql } from "drizzle-orm";',
            'export const load = () => import("node:fs");',
            'export type { Server } from "@merit/contacts/server";',
          ].join("\n"),
        },
        "Pure business code may use only approved browser-safe dependencies",
      );
      expect(
        report.diagnostics.filter(({ code }) => code === "boundaries(dependencies)"),
      ).toHaveLength(3);
    },
  );

  test("pure grantmaking modules can use their approved browser-safe dependencies", async () => {
    await check({
      ...collaborationFiles,
      [`${grantmakingRoot}/src/domain/probe.ts`]:
        'export { z } from "zod"; export type { Value } from "@merit/organizations/api";',
      [`${grantmakingRoot}/src/api/values.ts`]:
        'export { z } from "zod"; export type { Value } from "../domain/value";',
      [`${grantmakingRoot}/src/examples/probe.ts`]: 'export { value } from "../domain/value";',
    });
  });

  test("checking grantmaking external dependencies preserves other packages' library ownership", async () => {
    await check({
      "capabilities/contacts/business/src/domain/probe.ts": 'export { z } from "zod";',
      "capabilities/contacts/business/src/server/persistence/probe.ts":
        'export { sql } from "drizzle-orm"; export const load = () => import("node:fs");',
    });
  });

  test.each(["server", "server/integrations", "server/demo"])(
    "grantmaking %s types cannot be imported into product request context",
    async (entry) => {
      await check(
        {
          ...grantmakingFiles,
          "interfaces/product/src/shared/request-context.ts": `export type { Value } from "@merit/grantmaking/${entry}";`,
        },
        "Browser code",
      );
    },
  );

  test.each(roleFixtures)(
    "$name API definitions can share types and assemble their interface",
    async ({ root, files }) => {
      await check({
        ...files,
        [`${root}/src/api/commands.ts`]: 'export type { Value } from "./queries/value";',
        [`${root}/src/api/queries.ts`]: 'export type { Value } from "./commands/value";',
        [`${root}/src/api/values.ts`]: 'export type { Value } from "./service";',
        [`${root}/src/server/commands/probe.ts`]: 'export type { Value } from "../../api/index";',
        [`${root}/src/server/queries/probe.ts`]:
          'export type { Value } from "../../api/commands/value";',
        [`${root}/src/examples/probe.ts`]: 'export type { Value } from "../api/commands/value";',
      });
    },
  );

  test.each(roleFixtures)(
    "$name tests can compose local layers regardless of placement",
    async ({ root, files }) => {
      await check({
        ...files,
        [`${root}/tests/fixtures.ts`]: 'export { value } from "../src/api/values";',
        [`${root}/tests/scenario.ts`]: 'export { value } from "../src/server/commands/value";',
        [`${root}/src/domain/value.test.ts`]:
          'export { value as api } from "../api/values"; export { value as fixture } from "../../tests/fixtures"; export { value as server } from "../../tests/scenario";',
        [`${root}/src/api/values.test.ts`]:
          'export { value } from "../server/persistence/encoding";',
        [`${root}/src/server/persistence/encoding.test.ts`]:
          'export { value } from "../../api/values";',
      });
    },
  );

  test("contacts service interfaces are browser-safe while server types need no context exception", async () => {
    await check({
      ...contactsFiles,
      "interfaces/product/src/shared/request-context.ts":
        'export type { Value } from "@merit/contacts/api";',
    });
    await check(
      {
        ...contactsFiles,
        "interfaces/product/src/shared/request-context.ts":
          'export type { Value } from "@merit/contacts/server";',
      },
      "Browser code",
    );
  });

  test("contacts commands, queries and assembly can use the host grant-work interface", async () => {
    await check({
      ...contactsFiles,
      [`${contactsRoot}/src/server/grant-work.ts`]: "export type GrantWork = { active: boolean };",
      [`${contactsRoot}/src/server/commands/value.ts`]:
        'export type { GrantWork } from "../grant-work"; export { value } from "../persistence/commands/value";',
      [`${contactsRoot}/src/server/queries/value.ts`]:
        'export type { GrantWork } from "../grant-work"; export { value } from "../persistence/queries/value";',
      [`${contactsRoot}/src/server/service.ts`]:
        'export type { GrantWork } from "./grant-work"; export { value } from "./commands/value";',
    });
  });

  test.each(["domain", "server/persistence"])(
    "a grantmaking %s test can compose another capability's public API",
    async (path) => {
      await check({
        ...grantmakingFiles,
        ...contactsFiles,
        [`${grantmakingRoot}/src/${path}/value.test.ts`]:
          'export type { Value } from "@merit/contacts/api";',
      });
    },
  );

  test("a contacts API test can use local aliases to compose server behavior", async () => {
    await check({
      ...contactsFiles,
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "#query": [`${contactsRoot}/src/server/queries/value.ts`] },
        },
      }),
      [`${contactsRoot}/src/api/queries.test.ts`]: 'export { value } from "#query";',
    });
  });

  test("browser request contexts use the organization API without server types", async () => {
    await check({
      ...organizationsFiles,
      "interfaces/product/src/shared/request-context.ts":
        'export type { Value } from "@merit/organizations/api";',
      "interfaces/admin/src/app/context.ts":
        'export type { Value } from "@merit/organizations/api";',
    });
  });

  test.each([
    ["server/execution.ts", "./commands/value"],
    ["server/dependencies.ts", "./queries/value"],
    ["server/result.ts", "./persistence/commands/value"],
  ])("organization support cannot bypass role boundaries: %s -> %s", async (file, dependency) => {
    await check(
      {
        ...organizationsFiles,
        [`${organizationsRoot}/src/${file}`]: `export type { Value } from "${dependency}";`,
      },
      "Business support cannot",
    );
  });

  test("organization handlers share execution support without importing assembly", async () => {
    await check({
      ...organizationsFiles,
      [`${organizationsRoot}/src/server/execution.ts`]: 'export { value } from "../api/values";',
      [`${organizationsRoot}/src/server/commands/value.ts`]:
        'export { value } from "../execution";',
      [`${organizationsRoot}/src/server/queries/value.ts`]: 'export { value } from "../execution";',
    });
  });

  const extractedCapabilityFiles = {
    ...collaborationFiles,
    ...Object.fromEntries(
      ["rounds", "applications", "reviews", "recommendations"].flatMap(
        (name): [string, string][] => {
          const root = `capabilities/${name}/business`;
          const exports = {
            "./domain": "./src/domain/model.ts",
            "./api": "./src/api/index.ts",
            "./server": "./src/server/index.ts",
            "./schema": "./src/server/persistence/schema.ts",
            "./scope": "./src/server/persistence/projections.ts",
            "./locks":
              name === "rounds" || name === "applications"
                ? "./src/server/persistence/commands/locks.ts"
                : "./src/server/persistence/locks.ts",
            ...(name === "applications"
              ? {
                  "./history": "./src/server/persistence/history-encoding.ts",
                  "./encoding": "./src/server/persistence/encoding.ts",
                }
              : {}),
            "./server/grant-work": "./src/server/grant-work.ts",
          };
          return [
            [
              `${root}/package.json`,
              JSON.stringify({ name: `@merit/${name}`, type: "module", exports }),
            ],
            ...Object.values(exports).map((path): [string, string] => [
              `${root}/${path.slice(2)}`,
              "export const value = 1; export type Value = number;",
            ]),
          ];
        },
      ),
    ),
  };

  const crossCapabilityMessage =
    "Capability server imports require an approved consumer and public entry";

  const auditFiles = {
    ...collaborationFiles,
    "capabilities/audit/business/package.json": JSON.stringify({
      name: "@merit/audit",
      type: "module",
      exports: {
        "./server/record": "./src/server/integrations.ts",
        "./server": "./src/server/index.ts",
        "./server/demo": "./src/server/demo.ts",
        "./server/read": "./src/server/read.ts",
      },
    }),
    "capabilities/audit/business/src/server/integrations.ts": "export const value = 1;",
    "capabilities/audit/business/src/server/read.ts": "export const value = 1;",
    "capabilities/audit/business/src/server/index.ts": "export const value = 1;",
    "capabilities/audit/business/src/server/demo.ts": "export const value = 1;",
  };

  test("audit cleanup is available to the operator", async () => {
    await check({
      ...auditFiles,
      "app/scripts/clean-demos.ts": 'export { value } from "@merit/audit/server/demo";',
    });
  });

  test.each(["grantmaking", "contacts", "organizations", "reviews"])(
    "%s queries read bounded history through audit's reading entry",
    async (name) => {
      await check({
        ...auditFiles,
        [`capabilities/${name}/business/src/server/queries/probe.ts`]:
          'export { value } from "@merit/audit/server/read";',
      });
    },
  );

  test.each(["applications", "rounds", "reviews", "recommendations", "contacts", "organizations"])(
    "%s commands call the shared audit writer directly",
    async (name) => {
      await check({
        ...auditFiles,
        [`capabilities/${name}/business/src/server/commands/probe.ts`]:
          'export { value } from "@merit/audit/server/record";',
      });
    },
  );

  test.each([
    [`${grantmakingRoot}/src/server/commands/probe.ts`, "@merit/audit/server/record"],
    [`${grantmakingRoot}/src/server/queries/probe.ts`, "@merit/audit/server/record"],
    [`${grantmakingRoot}/src/server/commands/probe.ts`, "@merit/audit/server"],
    [`${grantmakingRoot}/src/server/commands/probe.ts`, "@merit/audit/server/demo"],
    [`${grantmakingRoot}/src/server/commands/probe.ts`, "@merit/audit/server/read"],
    [`${grantmakingRoot}/src/server/persistence/queries/probe.ts`, "@merit/audit/server/read"],
    [`${contactsRoot}/src/server/commands/probe.ts`, "@merit/audit/server/read"],
    ["app/src/server/services.server.ts", "@merit/audit/server/read"],
    ["app/src/server/services.server.ts", "@merit/audit/server/record"],
    ["app/scripts/ordinary-task.ts", "@merit/audit/server/demo"],
    ["capabilities/audit/business/src/server/queries/probe.ts", "@merit/grantmaking/server"],
    [
      "capabilities/audit/business/src/server/persistence/queries/probe.ts",
      "@merit/organizations/schema",
    ],
  ])("audit boundary rejects %s importing %s", async (path, source) => {
    await check(
      { ...auditFiles, [path]: `export { value } from "${source}";` },
      crossCapabilityMessage,
    );
  });

  test.each([
    [`${grantmakingRoot}/src/server/commands/probe.ts`, "@merit/contacts/server"],
    [`${grantmakingRoot}/src/server/queries/probe.ts`, "@merit/contacts/server"],
    [`${grantmakingRoot}/src/server/queries/probe.ts`, "@merit/contacts/server/demo"],
    [`${grantmakingRoot}/src/server/queries/probe.ts`, "@merit/organizations/locks"],
    [`${grantmakingRoot}/src/server/persistence/queries/probe.ts`, "@merit/organizations/locks"],
    [`${grantmakingRoot}/src/server/persistence/projections.ts`, "@merit/organizations/locks"],
    [`${grantmakingRoot}/src/server/commands/probe.ts`, "@merit/organizations/schema"],
    [`${grantmakingRoot}/src/server/queries/probe.ts`, "@merit/contacts/scope"],
    [`${grantmakingRoot}/src/server/queries/probe.ts`, "@merit/access/scope"],
    [`${contactsRoot}/src/server/commands/probe.ts`, "@merit/grantmaking/server/integrations"],
    [`${contactsRoot}/src/server/queries/probe.ts`, "@merit/organizations/server/demo"],
    [`${contactsRoot}/src/server/persistence/projections.ts`, "@merit/grantmaking/server"],
    [`${organizationsRoot}/src/server/commands/probe.ts`, "@merit/contacts/scope"],
    [`${grantmakingRoot}/src/server/demo.ts`, "@merit/organizations/server/demo"],
    [`${grantmakingRoot}/src/server/integrations.ts`, "@merit/contacts/server/demo"],
    [`${grantmakingRoot}/src/server/persistence/queries/probe.test.ts`, "@merit/contacts/server"],
    ["capabilities/new-capability/business/src/server/probe.ts", "@merit/contacts/server"],
    ["capabilities/new-capability/business/src/server/probe.ts", "@merit/organizations/schema"],
    ["app/src/feature.server.ts", "@merit/contacts/server"],
    ["app/src/feature.ts", "@merit/contacts/server"],
    ["app/src/server.ts", "@merit/contacts/server"],
    ["app/src/server/mcp.server.ts", "@merit/contacts/server"],
    ["interfaces/mcp/src/feature.ts", "@merit/contacts/server"],
    ["app/src/server/services.server.ts", "@merit/organizations/server/demo"],
    ["app/src/server/demo.server.ts", "@merit/grantmaking/server/integrations"],
    ["app/scripts/ordinary-task.ts", "@merit/contacts/server/demo"],
    [
      "interfaces/product/src/features/example/data/server/example.functions.ts",
      "@merit/contacts/server",
    ],
  ])("cross-capability policy rejects %s importing %s in every form", async (path, source) => {
    const report = await check(
      {
        ...collaborationFiles,
        [path]: [
          `export { value } from "${source}";`,
          `export type { Value } from "${source}";`,
          `export const load = () => import("${source}");`,
        ].join("\n"),
      },
      crossCapabilityMessage,
    );
    expect(
      report.diagnostics.filter(({ code }) => code === "boundaries(dependencies)"),
    ).toHaveLength(3);
  });

  test("cross-capability policy permits declared lookups, locks, joins, integrations and demo composition", async () => {
    await check({
      ...extractedCapabilityFiles,
      "app/src/server/demo-workspace.server.ts":
        'export { value as service } from "@merit/grantmaking/server"; export { value as seed } from "@merit/grantmaking/server/demo"; export { value as lifecycle } from "@merit/organizations/server/demo";',
      "capabilities/applications/business/src/server/commands/probe.ts":
        'export { value as contact } from "@merit/contacts/scope"; export { value as lock } from "@merit/organizations/locks";',
      [`${contactsRoot}/src/server/commands/probe.ts`]:
        'export { value } from "@merit/organizations/locks";',
      [`${grantmakingRoot}/src/server/persistence/projections.ts`]:
        'export { value as contact } from "@merit/contacts/schema"; export { value as organization } from "@merit/organizations/schema"; export { value as scope } from "@merit/organizations/scope"; export { value as policy } from "@merit/access/scope";',
      [`${contactsRoot}/src/server/persistence/queries/probe.ts`]:
        'export { value as organization } from "@merit/organizations/schema"; export { value as scope } from "@merit/organizations/scope";',
      [`${organizationsRoot}/src/server/persistence/projections.ts`]:
        'export { value } from "@merit/access/scope";',
      [`${grantmakingRoot}/src/server/integrations.ts`]:
        'export type { Value } from "@merit/contacts/server/grant-work";',
      [`${grantmakingRoot}/src/server/demo.ts`]:
        'export { value } from "@merit/contacts/server/demo";',
      "app/src/server/services.server.ts":
        'export { value as contacts } from "@merit/contacts/server"; export { value as grants } from "@merit/grantmaking/server"; export { value as organizations } from "@merit/organizations/server"; export type { Value } from "@merit/grantmaking/server/integrations";',
      "app/src/server/demo.server.ts":
        'export { value as service } from "@merit/grantmaking/server"; export { value as seed } from "@merit/grantmaking/server/demo"; export { value as lifecycle } from "@merit/organizations/server/demo";',
      "app/scripts/clean-demos.ts":
        'export { value as contacts } from "@merit/contacts/server/demo"; export { value as grants } from "@merit/grantmaking/server/demo"; export { value as workspaces } from "@merit/organizations/server/demo";',
      [`${grantmakingRoot}/tests/scenario.integration.ts`]:
        'export { value } from "@merit/organizations/server";',
    });
  });

  test("cross-capability dependency interfaces permit types but not runtime imports", async () => {
    const report = await check(
      {
        ...collaborationFiles,
        [`${grantmakingRoot}/src/server/integrations.ts`]:
          'export type { Value } from "@merit/contacts/server/grant-work"; export { value } from "@merit/contacts/server/grant-work"; export const load = () => import("@merit/contacts/server/grant-work");',
      },
      crossCapabilityMessage,
    );
    expect(report.diagnostics).toHaveLength(2);
  });

  test.each(["./src/server/future.ts", "./src/server/index.ts"])(
    "cross-capability policy requires approval for new public entries targeting %s",
    async (target) => {
      await check(
        {
          ...collaborationFiles,
          [`${contactsRoot}/package.json`]: JSON.stringify({
            name: "@merit/contacts",
            type: "module",
            exports: { "./future": target },
          }),
          [`${contactsRoot}/src/server/future.ts`]: "export const value = 1;",
          "app/src/server/services.server.ts": 'export { value } from "@merit/contacts/future";',
        },
        crossCapabilityMessage,
      );
    },
  );

  test("cross-capability policy checks the resolved provider role as well as the public entry name", async () => {
    await check(
      {
        ...collaborationFiles,
        [`${organizationsRoot}/package.json`]: JSON.stringify({
          name: "@merit/organizations",
          type: "module",
          exports: { "./scope": "./src/server/persistence/commands/locks.ts" },
        }),
        [`${grantmakingRoot}/src/server/persistence/queries/probe.ts`]:
          'export { value } from "@merit/organizations/scope";',
      },
      crossCapabilityMessage,
    );
  });

  test("cross-capability policy denies new providers until their server entry has a consumer", async () => {
    await check(
      {
        ...collaborationFiles,
        "capabilities/new-capability/business/package.json": JSON.stringify({
          name: "@merit/new-capability",
          type: "module",
          exports: { "./server": "./src/server/index.ts" },
        }),
        "capabilities/new-capability/business/src/server/index.ts": "export const value = 1;",
        "app/src/server/services.server.ts":
          'export { value } from "@merit/new-capability/server";',
      },
      crossCapabilityMessage,
    );
  });

  test("cross-capability imports cannot hide an undeclared relationship behind an approved barrel", async () => {
    await check(
      {
        ...collaborationFiles,
        [`${organizationsRoot}/src/server/persistence/scope.ts`]:
          'export { value } from "@merit/contacts/server/demo";',
        [`${grantmakingRoot}/src/server/persistence/queries/probe.ts`]:
          'export { value } from "@merit/organizations/scope";',
      },
      crossCapabilityMessage,
    );
  });

  test("cross-capability scope exports cannot conceal their own locking implementation", async () => {
    await check(
      {
        ...collaborationFiles,
        [`${organizationsRoot}/src/server/persistence/scope.ts`]:
          'export { value } from "./commands/locks";',
        [`${grantmakingRoot}/src/server/persistence/queries/probe.ts`]:
          'export { value } from "@merit/organizations/scope";',
      },
      "Business shared-persistence cannot",
    );
  });

  test("cross-capability policy rejects local aliases to foreign privileged entries", async () => {
    await check(
      {
        ...collaborationFiles,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "#contacts-demo": [`${contactsRoot}/src/server/demo.ts`] },
          },
        }),
        [`${grantmakingRoot}/src/server/queries/probe.ts`]:
          'export { value } from "#contacts-demo";',
      },
      "public @merit exports",
    );
  });

  test.each([
    [
      "foundation/i18n/src/probe.ts",
      "react-aria-components/I18nProvider",
      "I18nProvider",
      "React Aria belongs",
    ],
    ["foundation/i18n/src/probe.ts", "react-aria-components", "I18nProvider", "React Aria belongs"],
    [
      "foundation/i18n/src/probe.ts",
      "react-aria-components/Button",
      "Button",
      "React Aria belongs",
    ],
    [
      "interfaces/product/src/probe.ts",
      "react-aria-components/I18nProvider",
      "I18nProvider",
      "React Aria belongs",
    ],
  ])("keeps locale-provider ownership at %s for %s", async (path, source, name, message) => {
    await check({ [path]: `export { ${name} } from "${source}";` }, message);
  });

  test("allows the browser translation entry to coordinate React Aria locale", async () => {
    await check({
      "foundation/i18n/src/index.tsx":
        'export { I18nProvider } from "react-aria-components/I18nProvider";',
    });
  });

  test.each([
    ["views", "useQuery", "Views present workflow state"],
    ["controllers", "useQueryClient", "Controllers receive data operations"],
    ["controllers", "useMutation", undefined],
  ])("checks infrastructure ownership in %s for %s", async (role, name, message) => {
    await check(
      {
        [`interfaces/product/src/features/example/${role}/probe.ts`]: `import { ${name} } from "@tanstack/react-query"; export { ${name} };`,
      },
      message,
    );
  });

  test.each(["useNavigate", "useRouter"])(
    "keeps %s navigation in controllers or composition",
    async (name) => {
      await check(
        { [source]: `export { ${name} } from "@tanstack/react-router";` },
        "Navigation after an action belongs in its controller",
      );
    },
  );

  test("new business packages inherit pure dependency restrictions without registration", async () => {
    await check(
      {
        ...newFiles,
        [`${newRoot}/src/api/probe.ts`]:
          'export type { Value } from "@merit/contacts/domain"; export const read = () => import("node:fs");',
      },
      "Pure business code may use only approved browser-safe dependencies",
    );
  });

  test("extracted capabilities compose downstream reads and injected lifecycle contracts", async () => {
    await check({
      ...extractedCapabilityFiles,
      "capabilities/reviews/business/src/server/persistence/projections.ts":
        'export { value as material } from "@merit/applications/scope"; export { value as criteria } from "@merit/rounds/scope";',
      "capabilities/recommendations/business/src/server/commands/probe.ts":
        'export { value } from "@merit/applications/locks";',
      "capabilities/grantmaking/business/src/server/persistence/commands/probe.ts":
        'export type { Value } from "@merit/applications/server/grant-work"; export { value as reviews } from "@merit/reviews/scope"; export { value as recommendation } from "@merit/recommendations/scope";',
      "capabilities/applications/business/src/server/grant-work.ts":
        'export type { Value } from "../domain/model";',
      "app/src/server/services.server.ts":
        'export { value as rounds } from "@merit/rounds/server"; export { value as applications } from "@merit/applications/server"; export { value as reviews } from "@merit/reviews/server"; export { value as recommendations } from "@merit/recommendations/server";',
    });
  });
  test.each([
    ["rounds", "@merit/applications/schema"],
    ["applications", "@merit/reviews/schema"],
    ["applications", "@merit/recommendations/scope"],
    ["reviews", "@merit/recommendations/scope"],
    ["recommendations", "@merit/reviews/scope"],
  ])("%s cannot import upstream implementation %s", async (name, source) => {
    await check(
      {
        ...extractedCapabilityFiles,
        [`capabilities/${name}/business/src/server/persistence/probe.ts`]: `export { value } from "${source}"; export type { Value } from "${source}";`,
      },
      crossCapabilityMessage,
    );
  });
  test("lifecycle contracts cannot import their persistence implementation", async () => {
    await check(
      {
        ...extractedCapabilityFiles,
        "capabilities/applications/business/src/server/grant-work.ts":
          'export type { Value } from "./persistence/schema";',
      },
      "Business grant-work cannot",
    );
  });

  test("recommendation record codecs share pure round validation without importing round persistence", async () => {
    await check({
      ...extractedCapabilityFiles,
      "capabilities/recommendations/business/src/domain/encoding.ts":
        'export { value } from "@merit/rounds/domain";',
    });
    await check(
      {
        ...extractedCapabilityFiles,
        "capabilities/recommendations/business/src/domain/encoding.ts":
          'export { value } from "@merit/rounds/schema";',
      },
      "Business rules and contracts cannot depend on UI or infrastructure",
    );
  });

  test("grantmaking readers and demo seeding use Applications' owned history codec", async () => {
    await check({
      ...extractedCapabilityFiles,
      "capabilities/grantmaking/business/src/server/queries/probe.ts":
        'export { value as history } from "@merit/applications/history"; export { value as encoding } from "@merit/applications/encoding";',
      "capabilities/grantmaking/business/src/server/demo.ts":
        'export { value } from "@merit/applications/history";',
    });
    await check(
      {
        ...extractedCapabilityFiles,
        "capabilities/grantmaking/business/src/server/commands/probe.ts":
          'export { value } from "@merit/applications/history";',
      },
      crossCapabilityMessage,
    );
  });
});
