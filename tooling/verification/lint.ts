import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

// Match the declaration itself, including exported arrow functions and types.
const separatedDeclaration = {
  selector: [
    "VariableDeclaration[declarations.0.init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]",
    "FunctionDeclaration",
    "TSTypeAliasDeclaration",
    "TSInterfaceDeclaration",
    "ClassDeclaration",
    "ExportNamedDeclaration[declaration.declarations.0.init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]",
    "ExportNamedDeclaration:has(> :matches(FunctionDeclaration, TSTypeAliasDeclaration, TSInterfaceDeclaration, ClassDeclaration))",
    "ExportDefaultDeclaration",
  ].join(", "),
};

export const lint = defineConfig({
  lint: {
    ignorePatterns: ["**/routeTree.gen.ts"],
    categories: { correctness: "error" },
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      {
        name: "@stylistic",
        specifier: fileURLToPath(import.meta.resolve("@stylistic/eslint-plugin")),
      },
    ],
    rules: {
      "func-style": ["error", "expression", { overrides: { namedExports: "expression" } }],
      "prefer-arrow-callback": "error",
      "max-lines-per-function": [
        "error",
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      curly: ["error", "all"],
      "prefer-const": "error",
      "no-var": "error",
      "no-script-url": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "typescript/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // JSX callbacks may own async pending/error state; React does not await them.
      "typescript/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "typescript/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "import", next: "*" },
        { blankLine: "any", prev: "import", next: "import" },
        { blankLine: "always", prev: "*", next: separatedDeclaration },
        { blankLine: "always", prev: separatedDeclaration, next: "*" },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["**/*.{jsx,tsx}"],
        rules: {
          "max-lines-per-function": [
            "error",
            { max: 100, skipBlankLines: true, skipComments: true, IIFEs: true },
          ],
        },
      },
      {
        files: [
          "**/*.gen.ts",
          "**/*.d.ts",
          "**/*.{test,spec,stories,story-fixtures}.{ts,tsx}",
          "**/tests/**",
          "**/fixtures/**",
          "**/__fixtures__/**",
          "**/__mocks__/**",
          "tooling/**",
        ],
        rules: { "max-lines-per-function": "off" },
      },
      {
        files: [
          "{interfaces,foundation}/**/*.{ts,tsx}",
          "capabilities/*/web/**/*.{ts,tsx}",
          "app/src/**/*.{ts,tsx}",
        ],
        plugins: ["unicorn", "typescript", "oxc", "react", "jsx-a11y"],
        rules: {
          "react/rules-of-hooks": "error",
          "react/exhaustive-deps": "error",
          "react/jsx-key": "error",
          "react/jsx-no-duplicate-props": "error",
          "react/no-direct-mutation-state": "error",
          "react/no-danger": "error",
          "react/jsx-no-script-url": ["error", [{ name: "Link", props: ["href", "to"] }]],
          "react/iframe-missing-sandbox": "error",
          "jsx-a11y/alt-text": "error",
          "jsx-a11y/anchor-has-content": "error",
          "jsx-a11y/aria-props": "error",
          "jsx-a11y/aria-proptypes": "error",
          "jsx-a11y/aria-unsupported-elements": "error",
          "jsx-a11y/heading-has-content": "error",
          "jsx-a11y/html-has-lang": "error",
          "jsx-a11y/iframe-has-title": "error",
          "jsx-a11y/role-has-required-aria-props": "error",
          "jsx-a11y/role-supports-aria-props": "error",
          "jsx-a11y/click-events-have-key-events": "error",
          "jsx-a11y/no-static-element-interactions": "error",
        },
      },
      {
        files: ["**/*.test.{ts,tsx}", "**/tests/**/*.integration.ts"],
        plugins: ["unicorn", "typescript", "oxc", "vitest"],
        rules: {
          // Helpers and custom fixtures are valid assertion owners; mocks may infer their types.
          "vitest/no-standalone-expect": "off",
          "vitest/require-mock-type-parameters": "off",
          "vitest/require-to-throw-message": "off",
          // The native rule misidentifies implicitly returned expect.poll chains.
          "vitest/require-awaited-expect-poll": "off",
          "vitest/no-focused-tests": "error",
          "vitest/valid-expect": ["error", { maxArgs: 2 }],
          "vitest/valid-describe-callback": "error",
          "vitest/no-identical-title": "error",
          // Parameterized scenarios and optional UI states legitimately have conditional assertions.
          "vitest/no-conditional-expect": "off",
        },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },
}).lint;
