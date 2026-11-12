import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import stylelint from "stylelint";
import { loadConfigFromFile } from "vite-plus";
import { expect, it } from "vite-plus/test";
import { z } from "zod";

const root = fileURLToPath(new URL("../../", import.meta.url));
const lintResult = z.object({ diagnostics: z.array(z.object({ code: z.string() })) });

const run = (args: string[], input?: string) => {
  const result = spawnSync("vp", args, { cwd: root, input, encoding: "utf8", timeout: 30_000 });

  if (result.error) {
    throw result.error;
  }

  return result;
};

const withSource = (
  name: string,
  source: string,
  check: (path: string) => void,
  area = "interfaces/product/src",
) => {
  const directory = mkdtempSync(join(root, area, "checks-fixture-"));
  const path = join(directory, name);

  try {
    writeFileSync(path, source);
    check(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

it("separates exported and local arrow functions and types without separating related constants", () => {
  withSource(
    "spacing.ts",
    `import type { ReactNode } from "react";
export type Content = ReactNode;
export interface Named { name: string; }
export const first = () => 1;
export const second = () => 2;
const third = () => 3;
const fourth = () => 4;
const low = 1;
const high = 2;
export { third, fourth, low, high };
`,
    (path) => {
      const fixed = run(["lint", "--fix", "--format", "json", path]);

      expect(fixed.status, fixed.stdout + fixed.stderr).toBe(0);
      expect(run(["fmt", path]).status).toBe(0);

      const formatted = readFileSync(path, "utf8");

      expect(formatted).toContain('from "react";\n\nexport type');
      expect(formatted).toContain("ReactNode;\n\nexport interface");
      expect(formatted).toContain("() => 1;\n\nexport const second");
      expect(formatted).toContain("() => 3;\n\nconst fourth");
      expect(formatted).toContain("const low = 1;\nconst high = 2;");

      const checked = run(["lint", "--format", "json", path]);

      expect(checked.status, checked.stdout + checked.stderr).toBe(0);
    },
  );
}, 30_000);

const countedFunction = (lines: number) =>
  `export const count = () => {\nlet value = 0;\n${"value += 1;\n".repeat(lines - 4)}\n// Keep explanatory comments and spacing.\n\nreturn value;\n};\n`;

it.each([
  ["length.ts", 80],
  ["length.js", 80],
  ["length.tsx", 100],
  ["length.jsx", 100],
] as const)(
  "enforces the code-line limit in %s at %i",
  (name, limit) => {
    withSource(name, countedFunction(limit), (path) => {
      const accepted = run(["lint", "--format", "json", path]);
      expect(accepted.status, accepted.stdout + accepted.stderr).toBe(0);

      writeFileSync(path, countedFunction(limit + 1));
      const rejected = run(["lint", "--format", "json", path]);
      expect(rejected.status).toBe(1);
      expect(
        lintResult.parse(JSON.parse(rejected.stdout)).diagnostics.map(({ code }) => code),
      ).toContain("eslint(max-lines-per-function)");

      writeFileSync(
        path,
        countedFunction(limit + 1)
          .replace("export const count = () => {", "export const count = (() => {")
          .replace("};\n", "})();\n"),
      );
      const invoked = run(["lint", "--format", "json", path]);
      expect(
        lintResult.parse(JSON.parse(invoked.stdout)).diagnostics.map(({ code }) => code),
      ).toContain("eslint(max-lines-per-function)");
    });
  },
  30_000,
);

it.each([
  ["length.test.ts", "interfaces/product/src"],
  ["length.stories.tsx", "interfaces/product/src"],
  ["length.story-fixtures.tsx", "interfaces/product/src"],
  ["length.ts", "app/tests"],
  ["length.ts", "tooling/verification"],
])(
  "excludes function length for %s in %s",
  (name, area) => {
    withSource(
      name,
      countedFunction(101),
      (path) => {
        const result = run(["lint", "--format", "json", path]);
        expect(
          lintResult.parse(JSON.parse(result.stdout)).diagnostics.map(({ code }) => code),
        ).not.toContain("eslint(max-lines-per-function)");
      },
      area,
    );
  },
  30_000,
);

it("rejects script URLs, raw HTML, and unsafe iframe sandboxing", () => {
  withSource(
    "security.tsx",
    `const Link = ({ to }: { to: string }) => <a href={to}>Link</a>;
export const scriptUrl = "javascript:alert(1)";
export const unsafe = <>
  <a href="javascript:alert(1)">Native link</a>
  <Link to="javascript:alert(1)" />
  <div dangerouslySetInnerHTML={{ __html: "<p>raw</p>" }} />
  <iframe title="Missing sandbox" />
  <iframe title="Unsafe sandbox" sandbox="allow-scripts allow-same-origin" />
</>;
`,
    (path) => {
      const result = run(["lint", "--format", "json", path]);
      const codes = lintResult.parse(JSON.parse(result.stdout)).diagnostics.map(({ code }) => code);

      expect(result.status).toBe(1);
      expect(codes).toEqual(
        expect.arrayContaining([
          "eslint(no-script-url)",
          "react(jsx-no-script-url)",
          "react(no-danger)",
          "react(iframe-missing-sandbox)",
        ]),
      );
      expect(codes.filter((code) => code === "react(jsx-no-script-url)")).toHaveLength(2);
      expect(codes.filter((code) => code === "react(iframe-missing-sandbox)")).toHaveLength(2);

      writeFileSync(
        path,
        `export const safe = <>
  <a href="https://example.test">Link</a>
  <p>{"<untrusted content>"}</p>
  <iframe title="Sandboxed content" sandbox="" />
</>;\n`,
      );
      const clean = run(["lint", "--format", "json", path]);
      expect(clean.status, clean.stdout + clean.stderr).toBe(0);
    },
  );
}, 30_000);

it("accepts assertion messages and returned polling helpers while rejecting focused tests", () => {
  withSource(
    "assertions.test.ts",
    `import { expect, it } from "vite-plus/test";
export const poll = () => expect.poll(() => 1).toBe(1);
it("runs a helper", async () => { await poll(); expect(1, "a useful message").toBe(1); });
it.only("must not hide other tests", () => { expect(1).toBe(1); });
`,
    (path) => {
      const result = run(["lint", "--format", "json", path]);
      const codes = lintResult.parse(JSON.parse(result.stdout)).diagnostics.map(({ code }) => code);

      expect(codes).toContain("vitest(no-focused-tests)");
      expect(codes).not.toContain("vitest(valid-expect)");
      expect(codes).not.toContain("vitest(require-awaited-expect-poll)");

      const tests = run(["test", "--run", path]);

      expect(tests.status).not.toBe(0);
      expect(tests.stdout + tests.stderr).toMatch(/Unexpected \.only modifier/i);
    },
  );
}, 30_000);

it.each([
  ["access", "capabilities/access", ["src/domain"]],
  ["audit", "capabilities/audit/business", ["src/domain"]],
  ["grantmaking", "capabilities/grantmaking/business", ["src/domain", "src/api", "src/examples"]],
  ["rounds", "capabilities/rounds/business", ["src/domain", "src/api"]],
  ["applications", "capabilities/applications/business", ["src/domain", "src/api"]],
  ["recommendations", "capabilities/recommendations/business", ["src/domain", "src/api"]],
  ["reviews", "capabilities/reviews/business", ["src/domain", "src/api"]],
  ["organizations", "capabilities/organizations/business", ["src/domain", "src/api"]],
  ["contacts", "capabilities/contacts/business", ["src/domain", "src/api"]],
  ["money", "foundation/money", ["src"]],
  ["dates", "foundation/dates", ["src"]],
] as const)(
  "%s rejects unimported executable source in every measured area",
  async (name, packageDirectory, sourceAreas) => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      join(root, packageDirectory, "vite.config.ts"),
    );
    // Batched probes must not mask a lowered threshold with more uncovered code.
    expect(loaded?.config.test?.coverage?.thresholds).toEqual({
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
    });

    const directories: string[] = [];
    const reports = mkdtempSync(join(tmpdir(), "merit-coverage-probe-"));

    try {
      const sources = sourceAreas.map((sourceArea) => {
        const directory = mkdtempSync(join(root, packageDirectory, sourceArea, "coverage-probe-"));
        directories.push(directory);
        const source = join(directory, "unimported.ts");
        writeFileSync(
          source,
          "export const sign = (value: number) => { if (value < 0) { return -1; } return 1; };\n",
        );
        return source;
      });

      const result = run([
        "run",
        "--no-cache",
        `@merit/${name}#test`,
        `--coverage.reportsDirectory=${reports}`,
      ]);
      const output = result.stdout + result.stderr;

      expect(result.status, output).not.toBe(0);
      expect(output).toMatch(/Coverage for .+ does not meet .+ threshold/);

      const metric = z.object({ total: z.number().positive(), covered: z.literal(0) });
      const uncovered = z.object({
        lines: metric,
        branches: metric,
        functions: metric,
        statements: metric,
      });
      const report: unknown = JSON.parse(
        readFileSync(join(reports, "coverage-summary.json"), "utf8"),
      );

      for (const source of sources) {
        expect(
          z.object({ [source]: uncovered }).safeParse(report).success,
          `${source}\n${output}`,
        ).toBe(true);
      }
    } finally {
      for (const directory of directories) {
        rmSync(directory, { recursive: true, force: true });
      }
      rmSync(reports, { recursive: true, force: true });
    }
  },
  30_000,
);

it("adds CSS rule and media spacing and catches invalid CSS without rejecting CSS Modules", async () => {
  const configFile = join(root, "stylelint.config.mjs");
  const code =
    ".one { color: red; }\n.two { color: blue; }\n@media (width > 600px) {\n  :global(.control) { color: green; }\n}\n";
  const fixed = await stylelint.lint({
    code,
    codeFilename: "probe.module.css",
    configFile,
    fix: true,
  });

  expect(fixed.errored).toBe(false);
  expect(fixed.code).toContain("}\n\n.two");
  expect(fixed.code).toContain("}\n\n@media");

  const formatted = run(["fmt", "--stdin-filepath", "spacing.css"], fixed.code);

  expect(formatted.status).toBe(0);

  const checked = await stylelint.lint({
    code: formatted.stdout,
    codeFilename: "probe.module.css",
    configFile,
  });

  expect(checked.errored).toBe(false);

  const invalid = await stylelint.lint({
    code: ".one { colr: #ggg; }",
    codeFilename: "probe.css",
    configFile,
  });

  expect(invalid.results.flatMap(({ warnings }) => warnings.map(({ rule }) => rule))).toEqual(
    expect.arrayContaining(["property-no-unknown", "color-no-invalid-hex"]),
  );
});

it.each([
  "applications",
  "contacts",
  "grantmaking",
  "organizations",
  "recommendations",
  "reviews",
  "rounds",
])(
  "%s keeps both test projects and package-local UI setup with the shared preset",
  async (capability) => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      join(root, `capabilities/${capability}/web/vite.config.ts`),
    );
    expect(loaded?.config).toMatchObject({
      run: { tasks: { test: "vp test", typecheck: "tsc --noEmit -p tsconfig.json" } },
      test: {
        allowOnly: false,
        projects: [
          { test: { name: "unit", include: ["tests/**/*.test.ts", "src/**/*.test.ts"] } },
          {
            test: {
              name: "ui",
              include: ["src/**/*.test.tsx"],
              environment: "jsdom",
              environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
              setupFiles: ["./tests/setup-ui.ts"],
              env: { VITE_CLERK_PUBLISHABLE_KEY: "" },
            },
          },
        ],
      },
    });
  },
);
