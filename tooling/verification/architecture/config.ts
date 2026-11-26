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

const business = (name: string, role: string) => ({
  element: { path: `capabilities/${name}/business` },
  ...category(`business-${role}`),
});

const anyBusiness = (role: string, excludedCapability?: string) => ({
  element: {
    type: "business",
    ...(excludedCapability ? { path: `!capabilities/${excludedCapability}/business` } : {}),
  },
  ...category(`business-${role}`),
});

const pureBusiness = {
  element: { path: "capabilities/*/business" },
  ...category("pure", ["test"]),
};
const serverImplementation = category("server", ["pure"]);
const infrastructure = category("{server,browser}", ["pure"]);

// Upstream and sibling capabilities stay independent of downstream capabilities.
const upstreamDisallowedTargets: Record<string, string> = {
  organizations: "{contacts,rounds,applications,reviews,recommendations,decisions,grantmaking}",
  contacts: "{rounds,applications,reviews,recommendations,decisions,grantmaking}",
  rounds: "{applications,reviews,recommendations,decisions,grantmaking}",
  applications: "{reviews,recommendations,decisions,grantmaking}",
  reviews: "{recommendations,decisions,grantmaking}",
  recommendations: "{reviews,decisions,grantmaking}",
  decisions: "{reviews,recommendations,grantmaking}",
};

// Match the consumer, public specifier, and resolved provider role. Later policies can still deny an import.
const serverImports: DependenciesPolicy[] = [
  // Audit is a trusted storage integration; write-owning capabilities record events and authorize reads.
  permitServer(
    anyBusiness("{commands,command-persistence}", "grantmaking"),
    "@merit/audit/server/record",
    business("audit", "integrations"),
  ),
  permitServer(anyBusiness("queries"), "@merit/audit/server/read", business("audit", "reading")),
  // Composition and persistence read across capabilities through owned schema, scope, and projections.
  permitServer(
    anyBusiness("{command,query,shared}-persistence"),
    "@merit/*/{schema,scope}",
    anyBusiness("shared-persistence"),
  ),
  permitServer(
    business("grantmaking", "demo"),
    "@merit/*/{schema,scope}",
    anyBusiness("shared-persistence"),
  ),
  permitServer(anyBusiness("shared-persistence"), "@merit/access/scope", {
    file: { path: "capabilities/access/src/persistence/scope.ts" },
  }),
  permitServer(
    anyBusiness("{commands,queries}"),
    "@merit/organizations/transactions",
    business("organizations", "shared-persistence"),
  ),
  permitServer(
    anyBusiness("command-persistence"),
    "@merit/organizations/locks",
    business("organizations", "command-persistence"),
  ),
  permitServer(anyBusiness("commands"), "@merit/*/locks", anyBusiness("command-persistence")),
  permitServer(
    anyBusiness("{commands,queries,command-persistence,integrations}"),
    "@merit/*/server/grant-work",
    anyBusiness("grant-work"),
    "type",
  ),
  permitServer(
    business("{applications,reviews}", "commands"),
    "@merit/contacts/scope",
    business("contacts", "shared-persistence"),
  ),
  permitServer(
    business("grantmaking", "queries"),
    "@merit/rounds/readers",
    business("rounds", "query-persistence"),
  ),
  permitServer(
    business("grantmaking", "shared-persistence"),
    "@merit/reviews/{readers,participation-schema}",
    business("reviews", "shared-persistence"),
  ),
  permitServer(
    business("grantmaking", "{queries,demo}"),
    "@merit/applications/history",
    business("applications", "shared-persistence"),
  ),
  permitServer(
    business("grantmaking", "{command-persistence,demo}"),
    "@merit/*/server/demo",
    anyBusiness("demo", "organizations"),
  ),
  // Application assembly wires service implementations, lifecycle integrations, and demo seeding.
  permitServer(
    { file: { path: "app/src/server/services.server.ts" } },
    "@merit/*/server",
    anyBusiness("assembly"),
  ),
  permitServer(
    { file: { path: "app/src/server/assistant/host.server.ts" } },
    "@merit/reviews/server",
    business("reviews", "assembly"),
  ),
  permitServer(
    { file: { path: "app/src/server/assistant/{host,access}.server.ts" } },
    "@merit/organizations/server/assistant",
    { file: { path: "capabilities/organizations/business/src/server/assistant.ts" } },
  ),
  // Lifecycle work comes from the capability that owns the records; composition supplies none.
  permitServer(
    { file: { path: "app/src/server/services.server.ts" } },
    "@merit/*/server/integrations",
    anyBusiness("integrations", "grantmaking"),
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
    "@merit/*/server/demo",
    anyBusiness("demo"),
  ),
];

// Policies are ordered: later matching permissions or restrictions win.
const policies = [
  forbid(
    pureBusiness,
    { module: { origin: "local" }, element: { path: "!{{ from.element.path }}" } },
    "Pure business code may use only approved browser-safe dependencies.",
  ),
  {
    from: pureBusiness,
    allow: {
      to: [
        { element: { type: "foundation" }, ...category("pure") },
        { element: { type: "business" }, ...category("pure", ["business-examples"]) },
      ],
    },
  },
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
    {
      element: { path: "capabilities/audit/business" },
      file: { categories: { noneOf: ["composition-test"] } },
    },
    { element: { type: "business", path: "!capabilities/audit/business" } },
    "Capability server imports require an approved consumer and public entry.",
  ),
  ...Object.entries(upstreamDisallowedTargets).map(([from, disallowed]) =>
    forbid(
      {
        element: { path: `capabilities/${from}/business` },
        file: { categories: { noneOf: ["composition-test"] } },
      },
      { element: { path: `capabilities/${disallowed}/business` } },
      "Capability server imports require an approved consumer and public entry.",
    ),
  ),
  forbid(
    { element: { type: "foundation" } },
    { element: { type: ["ai", "business", "web", "interface", "app"] } },
    "Foundation cannot depend on capabilities or application code.",
  ),
  forbid(
    { element: { type: ["ai", "business", "web"] } },
    { element: { type: ["interface", "app"] } },
    "Capabilities cannot depend on interfaces or application assembly.",
  ),
  forbid(
    { element: { type: "business" } },
    { element: { type: "ai" } },
    "Business capabilities cannot depend on AI tools.",
  ),
  forbid(
    { element: { type: "ai" } },
    { element: { type: "web" } },
    "AI tools use business contracts and receive operations from their caller.",
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
    {
      element: { path: "capabilities/organizations/business" },
      ...category("business-support", ["test"]),
    },
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
    ignorePatterns: ["**/routeTree.gen.ts", "**/dist/**", "**/coverage/**"],
    settings: {
      "boundaries/root-path": process.cwd(),
      "boundaries/include": ["**/*.{ts,tsx,js,mjs}"],
      "boundaries/elements": [
        { type: "business", pattern: "capabilities/*/business", partialMatch: false },
        { type: "business", pattern: "capabilities/access", partialMatch: false },
        { type: "ai", pattern: "capabilities/*/ai", partialMatch: false },
        { type: "web", pattern: "capabilities/*/web", partialMatch: false },
        { type: "foundation", pattern: "foundation/*", partialMatch: false },
        { type: "interface", pattern: "interfaces/*", partialMatch: false },
        { type: "app", pattern: "app", partialMatch: false },
        { type: "tooling", pattern: "tooling", partialMatch: false },
      ],
      "boundaries/flag-as-external": {
        // Broken aliases must fail instead of becoming unchecked external dependencies.
        unresolvableAlias: false,
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
            "foundation/auth/src/{index,local-personas}.ts",
            "foundation/db/src/identifiers.ts",
            "foundation/telemetry/src/{errors,route-label}.ts",
            // Shared translation setup is safe for emails; the browser entry adds UI integration.
            "foundation/i18n/src/{core.ts,en.ts,server.tsx}",
          ],
          server: [
            "app/src/server/**",
            "capabilities/*/ai/src/**",
            "foundation/ai/src/**",
            "capabilities/*/business/src/**",
            "capabilities/access/src/**",
            "foundation/db/src/**",
            "foundation/auth/src/**",
            "foundation/telemetry/src/**",
            "**/*.server.ts",
          ],
          browser: [
            "app/src/shell/**",
            "app/src/router.tsx",
            "app/src/development/**/*.tsx",
            "capabilities/*/web/src/**",
            "interfaces/{product,admin,site}/src/**",
            "foundation/{analytics,ui,forms,drafts,tables,query,i18n}/src/**",
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
