import type { UserConfig } from "vite-plus";

const reactAriaImports = {
  regex: "^(react-aria(-components)?($|/)|@react-aria/)",
  message: "React Aria belongs in foundation/ui. Use @merit/ui components instead.",
};
const reactAriaLocaleImports = {
  group: [
    "react-aria",
    "react-aria/**",
    "react-aria-components",
    "react-aria-components/**",
    "@react-aria/**",
    "!react-aria-components/I18nProvider",
  ],
  message: "Only the React Aria locale provider belongs here; controls belong in foundation/ui.",
};
const formImports = {
  regex: "^@tanstack/(react-form|form-core)($|/)",
  message: "TanStack Form belongs in foundation/forms. Use @merit/forms instead.",
};
const tableImports = {
  regex: "^@tanstack/(react-table|table-core)($|/)",
  message: "TanStack Table belongs in foundation/tables. Use @merit/tables instead.",
};
const clerkImports = {
  regex: "^@clerk/",
  message:
    "Use Merit identity interfaces. Clerk belongs in the auth package and web auth adapters.",
};
const workerImports = {
  regex: "^cloudflare:",
  message: "Cloudflare bindings belong in host wiring. Pass configuration to the owning module.",
};
const processImports = {
  regex: "^(node:)?process$",
  message: "Read server environment in host wiring and pass configuration explicitly.",
};
const translationImports = {
  regex: "^i18next($|/)",
  allowTypeImports: true,
  message:
    "Translation instances belong in foundation/i18n. Use react-i18next hooks or @merit/i18n.",
};
const translationSetupImports = {
  regex: "^react-i18next($|/)",
  importNames: ["I18nextProvider", "initReactI18next", "getI18n", "setI18n"],
  allowTypeImports: true,
  message: "Translation setup belongs in foundation/i18n. Use @merit/i18n providers.",
};
const dateImports = {
  regex: "^@internationalized/date($|/)",
  message: "Date operations belong in @merit/dates. Use its public API.",
};
const telemetryImports = {
  regex: "^@opentelemetry/",
  message: "OpenTelemetry setup belongs in foundation/telemetry. Use @merit/telemetry instead.",
};
const restrictedImports = [
  dateImports,
  telemetryImports,
  reactAriaImports,
  formImports,
  tableImports,
  clerkImports,
  workerImports,
  processImports,
  translationImports,
  translationSetupImports,
];

const allowImports = (...allowed: (typeof restrictedImports)[number][]) =>
  restrictedImports.filter((pattern) => !allowed.includes(pattern));

const webImports = "^(drizzle-orm|pg)(/|$)|^@modelcontextprotocol/";

const importRules = (
  patterns: (
    | (typeof restrictedImports)[number]
    | typeof reactAriaLocaleImports
  )[] = restrictedImports,
): Record<string, ["error", { patterns: typeof patterns }]> => ({
  "no-restricted-imports": ["error", { patterns }],
});

const forbidImports = (
  regex: string,
  patterns: Parameters<typeof importRules>[0] = restrictedImports,
) =>
  importRules([
    ...patterns,
    {
      regex,
      message:
        "This library belongs outside this source area. See docs/foundations/architecture.md.",
    },
  ]);

const frameworks =
  "@tanstack/|@clerk/|@cloudflare/|@modelcontextprotocol/|react($|/|-)|i18next($|/)|cloudflare:";
const serverLibraries = "drizzle-orm(/|$)|pg$|node:";

export const imports = {
  rules: importRules(allowImports(processImports)),
  overrides: [
    {
      files: ["**/foundation/telemetry/**"],
      rules: importRules(allowImports(telemetryImports, processImports)),
    },
    {
      files: ["**/foundation/ui/**"],
      rules: importRules(allowImports(reactAriaImports, processImports)),
    },
    {
      files: ["**/foundation/forms/**"],
      rules: importRules(allowImports(formImports, processImports)),
    },
    {
      files: ["**/foundation/tables/**"],
      rules: importRules(allowImports(tableImports, processImports)),
    },
    {
      files: ["**/foundation/auth/**"],
      rules: importRules(allowImports(clerkImports, processImports)),
    },
    {
      files: ["**/foundation/i18n/**"],
      rules: importRules(allowImports(translationImports, translationSetupImports, processImports)),
    },
    {
      files: ["**/app/src/**"],
      rules: importRules(allowImports(workerImports, processImports)),
    },
    {
      files: [
        "**/interfaces/*/src/**",
        "**/capabilities/*/business/src/**",
        "**/capabilities/access/src/**",
        "**/foundation/*/src/**",
        "**/capabilities/*/web/src/**",
      ],
      rules: {
        "no-restricted-properties": [
          "error",
          {
            object: "process",
            property: "env",
            message: "Read server environment in host wiring and pass configuration explicitly.",
          },
        ],
        ...importRules(),
      },
    },
    {
      files: ["**/foundation/forms/src/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...allowImports(formImports),
              {
                group: [
                  "@tanstack/**",
                  "!@tanstack/react-form",
                  "!@tanstack/react-form/**",
                  "!@tanstack/form-core",
                  "!@tanstack/form-core/**",
                ],
                message: "Routing and application setup belong outside shared forms.",
              },
              {
                regex: `^(@clerk/|@cloudflare/|@modelcontextprotocol/|cloudflare:|${serverLibraries})`,
                message: "Server infrastructure belongs outside shared forms.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["**/foundation/tables/src/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...allowImports(tableImports),
              {
                group: [
                  "@tanstack/**",
                  "!@tanstack/react-table",
                  "!@tanstack/react-table/**",
                  "!@tanstack/table-core",
                  "!@tanstack/table-core/**",
                ],
                message: "Routing and application setup belong outside shared tables.",
              },
              {
                regex: `^(@clerk/|@cloudflare/|@modelcontextprotocol/|cloudflare:|${serverLibraries})`,
                message: "Server infrastructure belongs outside shared tables.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "**/capabilities/*/business/src/domain/**",
        "**/capabilities/*/business/src/api/**",
        "**/capabilities/*/business/src/server/{commands,queries}/**",
        "**/capabilities/access/src/domain/**",
      ],
      rules: forbidImports(`^(${frameworks}|${serverLibraries})`),
    },
    {
      files: ["**/foundation/query/src/**"],
      rules: forbidImports(
        `^(@clerk/|@cloudflare/|@modelcontextprotocol/|@tanstack/(react-router|react-start)|cloudflare:|${serverLibraries})`,
      ),
    },
    {
      files: ["**/foundation/auth/src/**"],
      rules: forbidImports(
        "^(@tanstack/|@cloudflare/|@modelcontextprotocol/|react($|/|-)|i18next($|/)|cloudflare:|drizzle-orm(/|$)|pg$)",
        allowImports(clerkImports),
      ),
    },
    {
      files: [
        "**/capabilities/*/business/src/server/persistence/**",
        "**/capabilities/access/src/persistence/**",
        "**/foundation/db/src/**",
        "**/foundation/auth/src/persistence/**",
      ],
      rules: forbidImports(`^(${frameworks})`),
    },
    {
      files: ["**/foundation/telemetry/src/**"],
      rules: forbidImports(`^(${frameworks}|${serverLibraries})`, allowImports(telemetryImports)),
    },
    {
      files: ["**/foundation/ui/src/**"],
      rules: forbidImports(
        `^(@tanstack/|@clerk/|@cloudflare/|@modelcontextprotocol/|cloudflare:|${serverLibraries})`,
        allowImports(reactAriaImports),
      ),
    },
    {
      files: ["**/foundation/i18n/src/**"],
      rules: forbidImports(
        `^(@tanstack/|@clerk/|@cloudflare/|@modelcontextprotocol/|cloudflare:|${serverLibraries})`,
        allowImports(translationImports, translationSetupImports),
      ),
    },
    {
      files: ["**/foundation/i18n/src/index.tsx"],
      rules: forbidImports(
        `^(@tanstack/|@clerk/|@cloudflare/|@modelcontextprotocol/|cloudflare:|${serverLibraries})`,
        [
          ...allowImports(reactAriaImports, translationImports, translationSetupImports),
          reactAriaLocaleImports,
        ],
      ),
    },
    {
      files: ["**/interfaces/mcp/src/**"],
      rules: forbidImports(
        "^(drizzle-orm(/|$)|pg$|@tanstack/|react($|/|-)|i18next($|/)|cloudflare:)",
      ),
    },
    {
      files: ["**/interfaces/site/src/**"],
      rules: forbidImports(
        "^(@clerk/|@tanstack/react-start|@cloudflare/|@modelcontextprotocol/|cloudflare:|drizzle-orm(/|$)|pg$|node:)",
      ),
    },
    {
      files: [
        "**/interfaces/product/src/**",
        "**/interfaces/admin/src/**",
        "**/capabilities/*/web/src/**",
      ],
      rules: forbidImports(webImports),
    },
    {
      files: [
        "**/interfaces/product/src/features/*/views/**",
        "**/capabilities/*/web/src/views/**",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...restrictedImports,
              {
                regex: "^@tanstack/(query-core|react-start)($|/)",
                message: "Views use workflow controllers; data access belongs in data/.",
              },
              {
                regex: "^@tanstack/react-router$",
                importNames: ["useNavigate", "useRouter"],
                message:
                  "Navigation after an action belongs in its controller or composition entry.",
              },
              { regex: webImports, message: "Server infrastructure belongs outside web views." },
            ],
          },
        ],
      },
    },
    {
      files: [
        "**/interfaces/product/src/features/*/controllers/**",
        "**/capabilities/*/web/src/controllers/**",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...restrictedImports,
              {
                regex: "^(@merit/ui/|@tanstack/react-start($|/))",
                message:
                  "Controllers own workflow state; rendering belongs in views/ and transport in data/.",
              },
              {
                regex: "^@tanstack/react-query$",
                importNames: [
                  "QueryClient",
                  "useQueryClient",
                  "useQuery",
                  "useSuspenseQuery",
                  "queryOptions",
                ],
                message:
                  "Controllers receive data operations; query definitions and cache access belong in data/.",
              },
              {
                regex: webImports,
                message: "Server infrastructure belongs outside web controllers.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "**/interfaces/product/src/features/*/contracts.ts",
        "**/interfaces/product/src/features/*/contracts/**",
        "**/capabilities/*/web/src/contracts/**",
        "**/capabilities/*/web/src/contracts.ts",
      ],
      rules: forbidImports(`^(${frameworks}|${serverLibraries})`),
    },
    {
      files: [
        "**/interfaces/product/src/features/**/*.test.{ts,tsx}",
        "**/interfaces/product/src/features/**/*.stories.tsx",
        "**/interfaces/product/src/features/**/testing/**",
        "**/capabilities/*/web/src/**/*.test.{ts,tsx}",
        "**/capabilities/*/web/src/**/*.stories.tsx",
        "**/capabilities/*/web/src/**/testing/**",
      ],
      rules: forbidImports(webImports),
    },
    {
      files: [
        "**/app/src/server/middleware.ts",
        "**/app/src/shell/account-provider.tsx",
        "**/interfaces/admin/src/app/account.tsx",
        "**/interfaces/product/src/routes/app/sign-in.tsx",
        "**/interfaces/product/src/app/workspace-account.tsx",
      ],
      rules: forbidImports(webImports, allowImports(clerkImports)),
    },
    {
      files: ["**/foundation/auth/src/session.ts"],
      rules: importRules(allowImports(clerkImports)),
    },
    {
      files: ["**/foundation/money/**"],
      rules: forbidImports(`^(${frameworks}|${serverLibraries})`, restrictedImports),
    },
    {
      files: ["**/foundation/dates/**"],
      rules: forbidImports(`^(${frameworks}|${serverLibraries})`, allowImports(dateImports)),
    },
  ],
} satisfies NonNullable<UserConfig["lint"]>;
