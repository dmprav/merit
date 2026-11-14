import { fileURLToPath } from "node:url";

import type { DependenciesPolicy, DependencyKind } from "eslint-plugin-boundaries";
import { defineConfig } from "vite-plus";

import { imports } from "./imports";

const category = (pattern: string, noneOf: string[] = []) => ({
  file: { categories: { anyOf: [pattern], noneOf } },
});

const forbid = (
  from: DependenciesPolicy["from"],
  to: DependenciesPolicy["to"],
  message: string,
  dependency?: DependenciesPolicy["dependency"],
): DependenciesPolicy => ({ from, disallow: { to }, message, dependency });

const permitServer = (
  from: DependenciesPolicy["from"],
  source: string,
  to: DependenciesPolicy["to"],
  kind?: DependencyKind,
): DependenciesPolicy => ({ from, dependency: { source, kind }, allow: { to } });

// Common roles are scoped to the importing package; only exceptional source roles name a capability.
const businessRoles: Record<string, [pattern: string, allowed: string]> = {
  domain: ["domain/**", "domain"],
  "grant-work": ["server/grant-work.ts", "domain"],
  api: ["api/**", "{domain,api}"],
  commands: [
    "server/commands/**",
    "{domain,api,commands,command-persistence,shared-persistence,support,grant-work}",
  ],
  queries: [
    "server/queries/**",
    "{domain,api,queries,query-persistence,shared-persistence,support,grant-work}",
  ],
  "command-persistence": [
    "server/persistence/commands/**",
    "{domain,command-persistence,shared-persistence,grant-work}",
  ],
  "query-persistence": [
    "server/persistence/queries/**",
    "{domain,query-persistence,shared-persistence}",
  ],
  "shared-persistence": ["server/persistence/*.ts", "{domain,shared-persistence}"],
  assembly: ["server/{index,service}.ts", "{api,commands,queries,assembly,support,grant-work}"],
  integrations: [
    "server/integrations.ts",
    "{domain,command-persistence,query-persistence,shared-persistence}",
  ],
  reading: ["server/read.ts", "{domain,queries,query-persistence,shared-persistence}"],
  demo: ["server/demo.ts", "{domain,examples,command-persistence,shared-persistence}"],
  examples: ["examples/**", "{domain,api,examples}"],
};

const pureImports = {
  audit: "@merit/auth",
  organizations: "@merit/{auth,access,audit/api}",
  grantmaking:
    "@merit/{money,dates,auth,audit/api,contacts/domain,organizations/api,{rounds,applications,reviews,recommendations}/{domain,api}}",
  contacts: "@merit/{auth,organizations/api,audit/api}",
  rounds: "@merit/{auth,money,dates,organizations/api}",
  applications: "@merit/{auth,money,dates,contacts/domain,organizations/api}",
  reviews:
    "@merit/{auth,money,dates,audit/api,contacts/domain,organizations/api,applications/{domain,api},rounds/domain}",
  recommendations: "@merit/{auth,money,dates,organizations/api,{applications,rounds}/domain}",
};

const business = (name: string, role: string) => ({
  element: { path: `capabilities/${name}/business` },
  ...category(`business-${role}`),
});

const pureBusiness = {
  element: { path: "capabilities/*/business" },
  ...category("pure", ["test"]),
};
const serverImplementation = category("server", ["pure"]);
const infrastructure = category("{server,browser}", ["pure"]);

// Match the consumer, public specifier, and resolved provider. Later policies can still deny an import.
const serverImports = [
  // Audit is a trusted storage integration; owning capabilities authorize every history read.
  permitServer(
    business(
      "{organizations,contacts,applications,rounds,reviews,recommendations}",
      "{commands,command-persistence}",
    ),
    "@merit/audit/server/record",
    business("audit", "integrations"),
  ),
  permitServer(
    business(
      "{organizations,contacts,applications,rounds,reviews,recommendations,grantmaking}",
      "{query,shared}-persistence",
    ),
    "@merit/audit/schema",
    business("audit", "shared-persistence"),
  ),
  // Composition reads each capability through its owned records and projections.
  permitServer(
    business("grantmaking", "{{command,query,shared}-persistence,demo}"),
    "@merit/{rounds,applications,reviews,recommendations}/{schema,scope,encoding}",
    business("{rounds,applications,reviews,recommendations}", "shared-persistence"),
  ),
  permitServer(
    business("grantmaking", "queries"),
    "@merit/rounds/readers",
    business("rounds", "query-persistence"),
  ),
  permitServer(
    business("grantmaking", "{query,shared}-persistence"),
    "@merit/reviews/{readers,participation-schema}",
    business("reviews", "shared-persistence"),
  ),
  permitServer(
    business("grantmaking", "{command-persistence,demo}"),
    "@merit/{rounds,applications,reviews,recommendations}/server/demo",
    business("{rounds,applications,reviews,recommendations}", "demo"),
  ),
  permitServer(
    business("grantmaking", "command-persistence"),
    "@merit/applications/server/grant-work",
    business("applications", "grant-work"),
    "type",
  ),
  permitServer(
    business("grantmaking", "{queries,demo}"),
    "@merit/applications/{history,encoding}",
    business("applications", "shared-persistence"),
  ),
  // Downstream workflows use application identity/material and round configuration.
  permitServer(
    business("{applications,reviews,recommendations}", "{command,query,shared}-persistence"),
    "@merit/rounds/{schema,scope,encoding}",
    business("rounds", "shared-persistence"),
  ),
  permitServer(
    business("{reviews,recommendations}", "{command,query,shared}-persistence"),
    "@merit/applications/{schema,scope,encoding}",
    business("applications", "shared-persistence"),
  ),
  permitServer(
    business("{reviews,recommendations}", "commands"),
    "@merit/applications/locks",
    business("applications", "command-persistence"),
  ),
  permitServer(
    business("applications", "commands"),
    "@merit/rounds/locks",
    business("rounds", "command-persistence"),
  ),
  permitServer(
    { file: { path: "app/src/server/services.server.ts" } },
    "@merit/applications/server/integrations",
    business("applications", "integrations"),
  ),
  permitServer(
    business("{grantmaking,contacts,organizations,reviews}", "queries"),
    "@merit/audit/server/read",
    business("audit", "reading"),
  ),
  permitServer(
    business("{applications,reviews}", "commands"),
    "@merit/contacts/scope",
    business("contacts", "shared-persistence"),
  ),
  permitServer(
    business("{grantmaking,rounds,applications,reviews,recommendations,contacts}", "commands"),
    "@merit/organizations/locks",
    business("organizations", "command-persistence"),
  ),
  permitServer(
    business(
      "{grantmaking,applications,reviews,recommendations}",
      "{command,query,shared}-persistence",
    ),
    "@merit/contacts/schema",
    business("contacts", "shared-persistence"),
  ),
  permitServer(
    business(
      "{grantmaking,rounds,applications,reviews,recommendations,contacts}",
      "{command,query,shared}-persistence",
    ),
    "@merit/organizations/{schema,scope}",
    business("organizations", "shared-persistence"),
  ),
  permitServer(
    business("grantmaking", "integrations"),
    "@merit/contacts/server/grant-work",
    business("contacts", "grant-work"),
    "type",
  ),
  permitServer(
    business("grantmaking", "demo"),
    "@merit/contacts/server/demo",
    business("contacts", "demo"),
  ),
  permitServer(
    business(
      "{grantmaking,rounds,applications,reviews,recommendations,organizations}",
      "shared-persistence",
    ),
    "@merit/access/scope",
    {
      file: { path: "capabilities/access/src/persistence/scope.ts" },
    },
  ),
  permitServer(
    { file: { path: "app/src/server/services.server.ts" } },
    "@merit/{contacts,grantmaking,organizations,rounds,applications,reviews,recommendations}/server",
    business(
      "{contacts,grantmaking,organizations,rounds,applications,reviews,recommendations}",
      "assembly",
    ),
  ),
  permitServer(
    { file: { path: "app/src/server/services.server.ts" } },
    "@merit/grantmaking/server/integrations",
    business("grantmaking", "integrations"),
  ),
  permitServer(
    {
      file: { path: ["app/src/server/demo.server.ts", "app/src/server/demo-workspace.server.ts"] },
    },
    "@merit/grantmaking/server",
    business("grantmaking", "assembly"),
  ),
  permitServer(
    {
      file: {
        path: [
          "app/src/server/demo.server.ts",
          "app/src/server/demo-workspace.server.ts",
          "app/scripts/clean-demos.ts",
        ],
      },
    },
    "@merit/{contacts,grantmaking,organizations,audit}/server/demo",
    business("{contacts,grantmaking,organizations,audit}", "demo"),
  ),
];

// Policies are ordered: later matching permissions or restrictions win.
const policies = [
  forbid(
    pureBusiness,
    { module: { origin: "local" }, element: { path: "!{{ from.element.path }}" } },
    "Pure business code may use only approved browser-safe dependencies.",
  ),
  ...Object.entries(pureImports).map(([name, source]): DependenciesPolicy => ({
    from: { ...pureBusiness, element: { path: `capabilities/${name}/business` } },
    dependency: { source },
    allow: { to: category("pure") },
  })),
  forbid(
    pureBusiness,
    { module: { origin: ["external", "core"] } },
    "Pure business code may use only approved browser-safe dependencies.",
    { source: "!zod{,/**}" },
  ),
  forbid(
    undefined,
    {
      element: { type: "business", path: "!{{ from.element.path }}" },
      ...serverImplementation,
    },
    "Capability server imports require an approved consumer and public entry.",
  ),
  {
    from: category("composition-test"),
    allow: { to: { element: { type: "business" }, ...serverImplementation } },
  },
  ...serverImports,
  forbid(
    { element: { type: "foundation" } },
    { element: { type: ["business", "web", "interface", "app"] } },
    "Foundation cannot depend on capabilities or application code.",
  ),
  forbid(
    { element: { type: ["business", "web"] } },
    { element: { type: ["interface", "app"] } },
    "Capabilities cannot depend on interfaces or application assembly.",
  ),
  forbid(
    { element: { type: "business" } },
    { element: { type: "web" } },
    "Business code cannot depend on web code.",
  ),
  forbid(
    { element: { type: "interface" } },
    { element: { type: "app" } },
    "Interfaces cannot depend on application assembly.",
  ),
  forbid(
    category("pure", ["test"]),
    infrastructure,
    "Business rules and contracts cannot depend on UI or infrastructure.",
  ),
  forbid(
    { element: { path: "interfaces/emails" } },
    infrastructure,
    "Email presentation cannot depend on business operations or browser UI.",
  ),
  forbid(
    category("browser", ["test", "transport"]),
    serverImplementation,
    "Browser code cannot import server implementation.",
  ),
  forbid(
    category("web-view", ["test"]),
    { module: { origin: "external" } },
    "Views present workflow state; transport and query caches belong to data adapters.",
    { source: "@tanstack/react-query{,/**}" },
  ),
  forbid(
    category("{web-view,web-controller}", ["test"]),
    category("{web-data,transport}"),
    "Views and controllers receive operations through contracts, not concrete data adapters.",
  ),
  forbid(
    category("web-controller", ["test"]),
    category("web-view"),
    "Controllers cannot depend on presentation.",
  ),
  forbid(
    category("web-data", ["test"]),
    category("{web-view,web-controller}"),
    "Data adapters cannot depend on views or controllers.",
  ),
  ...Object.entries(businessRoles).map(([role, [, allowed]]) =>
    forbid(
      category(`business-${role}`, ["test"]),
      {
        element: { path: "{{ from.element.path }}" },
        file: { categories: { noneOf: [`business-${allowed}`] } },
      },
      `Business ${role} cannot depend on this source role.`,
    ),
  ),
  forbid(
    { ...business("organizations", "support"), ...category("business-support", ["test"]) },
    {
      element: { path: "{{ from.element.path }}" },
      file: { categories: { noneOf: ["business-{domain,api,support}"] } },
    },
    "Business support cannot depend on this source role.",
  ),
  forbid(
    {
      file: { categories: { noneOf: ["test", "tooling"] } },
      element: { type: "!tooling" },
    },
    [category("{test,tooling}"), { element: { type: "tooling" } }],
    "Production code cannot depend on tests or tooling.",
  ),
  forbid(
    { element: { type: "!tooling" }, file: { categories: { noneOf: ["tooling"] } } },
    { module: { origin: "local" }, element: { path: "!{{ from.element.path }}" } },
    "Cross-package imports must use public @merit exports.",
    { source: "!@merit/**" },
  ),
  {
    from: category("test"),
    allow: { to: { element: { type: "tooling" } } },
    message: "Tests may use repository test harnesses.",
  },
];

// Package exports own public APIs; these policies protect dependency direction and runtime roles.
export default defineConfig({
  lint: {
    categories: { correctness: "off" },
    jsPlugins: [
      {
        name: "boundaries",
        specifier: fileURLToPath(import.meta.resolve("eslint-plugin-boundaries")),
      },
    ],
    ignorePatterns: [
      "**/routeTree.gen.ts",
      "**/worker-configuration.d.ts",
      "**/dist/**",
      "**/coverage/**",
    ],
    settings: {
      "boundaries/root-path": process.cwd(),
      "boundaries/include": ["**/*.{ts,tsx,js,mjs}"],
      "boundaries/elements": [
        { type: "business", pattern: "capabilities/*/business", partialMatch: false },
        { type: "business", pattern: "capabilities/access", partialMatch: false },
        { type: "web", pattern: "capabilities/*/web", partialMatch: false },
        { type: "foundation", pattern: "foundation/*", partialMatch: false },
        { type: "interface", pattern: "interfaces/*", partialMatch: false },
        { type: "app", pattern: "app", partialMatch: false },
        { type: "tooling", pattern: "tooling", partialMatch: false },
      ],
      "boundaries/flag-as-external": {
        // Broken aliases must fail instead of becoming unchecked external dependencies.
        unresolvableAlias: false,
        customSourcePatterns: ["cloudflare:*"],
      },
      "boundaries/files": [
        ...Object.entries({
          tooling: [
            "**/*.config.{ts,mjs}",
            "**/{scripts,database}/**",
            "app/routes.ts",
            "interfaces/*/routing.ts",
            "**/*.d.ts",
          ],
          test: ["**/*.{test,stories}.{ts,tsx}", "**/{tests,testing,__mocks__}/**"],
          "composition-test": ["**/{tests,testing}/**"],
          pure: [
            "capabilities/**/src/{domain,contracts}/**",
            "capabilities/*/business/src/{api,examples}/**",
            "**/src/**/contracts{.ts,/**}",
            "foundation/{money,dates}/src/**",
            "foundation/auth/src/index.ts",
            // Shared translation setup is safe for emails; the browser entry adds UI integration.
            "foundation/i18n/src/{core.ts,en.ts,server.tsx}",
          ],
          server: [
            "app/src/server/**",
            "capabilities/*/business/src/**",
            "capabilities/access/src/**",
            "foundation/db/src/**",
            "foundation/auth/src/**",
            "**/*.server.ts",
          ],
          browser: [
            "app/src/shell/**",
            "app/src/router.tsx",
            "app/src/development/**/*.tsx",
            "capabilities/*/web/src/**",
            "interfaces/{product,admin,site}/src/**",
            "foundation/{ui,forms,drafts,tables,query,i18n}/src/**",
          ],
          "web-view": ["capabilities/*/web/src/views/**", "interfaces/*/src/**/views/**"],
          "web-controller": [
            "capabilities/*/web/src/controllers/**",
            "interfaces/*/src/**/controllers/**",
          ],
          "web-data": ["capabilities/*/web/src/data/**", "interfaces/*/src/**/data/**"],
          transport: [
            "interfaces/*/src/**/data/server/**",
            "interfaces/*/src/**/*.{functions,server}.ts",
          ],
        }).map(([category, pattern]) => ({ category, pattern })),
        ...Object.entries(businessRoles).map(([role, [path]]) => ({
          category: `business-${role}`,
          pattern: `capabilities/*/business/src/${path}`,
        })),
        {
          category: "business-support",
          pattern:
            "capabilities/organizations/business/src/server/{dependencies,execution,result,invitation-token}.ts",
        },
      ],
      "import/resolver": {
        [fileURLToPath(import.meta.resolve("./resolver.mjs"))]: {},
      },
    },
    overrides: [
      ...imports.overrides,
      {
        files: [
          "**/interfaces/*/src/**/{views,controllers}/**",
          "**/capabilities/*/web/src/{views,controllers}/**",
        ],
        rules: {
          "no-restricted-globals": [
            "error",
            {
              globals: ["fetch", "localStorage", "sessionStorage"],
              checkGlobalObject: true,
            },
          ],
        },
      },
      {
        files: ["**/*.{test,stories}.{ts,tsx}", "**/{tests,testing,__mocks__}/**"],
        rules: { "no-restricted-globals": "off" },
      },
    ],
    rules: {
      ...imports.rules,
      "boundaries/no-unknown-files": "error",
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          // File-role rules also apply within a package.
          checkInternals: true,
          checkAllOrigins: true,
          policies,
        },
      ],
    },
  },
});
