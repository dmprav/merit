import { globSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { parseSync, Visitor } from "vite-plus";
import { z } from "zod";

import { REPO_ROOT } from "../../paths.ts";

const packageName = z.object({ name: z.string() });
const nonProduction = [
  "**/node_modules",
  "capabilities/{*,*/*}/{dist,dist-ssr,coverage}",
  "capabilities/{*,*/*}/vite.config.ts",
  "**/{tests,testing,__tests__,__mocks__,__fixtures__}",
  "**/*.{test,spec,stories,story-fixtures}.{ts,tsx,js,jsx,mjs,cjs,mts,cts}",
];

const capabilityImports = (file: string) => {
  const source = readFileSync(file, "utf8");
  const { program, errors } = parseSync(file, source);
  if (errors.length) {
    throw new Error(`Cannot inspect ${file}: ${errors[0]?.message}`);
  }
  const imports = new Set<string>();

  // Cross-package imports must use public @merit exports (enforced by JS Boundaries).
  const record = (specifier: unknown) => {
    if (typeof specifier === "string" && specifier.startsWith("@merit/")) {
      imports.add(specifier.split("/").slice(0, 2).join("/"));
    }
  };

  new Visitor({
    ImportDeclaration: ({ source }) => record(source.value),
    ExportAllDeclaration: ({ source }) => record(source.value),
    ExportNamedDeclaration: ({ source }) => record(source?.value),
    TSImportType: ({ source }) => record(source.value),
    TSExternalModuleReference: ({ expression }) => record(expression.value),
    ImportExpression: ({ source }) => {
      if (source.type === "Literal") {
        record(source.value);
      }
      if (source.type === "TemplateLiteral" && !source.expressions.length) {
        record(source.quasis[0]?.value.cooked);
      }
    },
    CallExpression: ({ callee, arguments: [argument] }) => {
      if (
        callee.type === "Identifier" &&
        callee.name === "require" &&
        argument?.type === "Literal"
      ) {
        record(argument.value);
      }
    },
  }).visit(program);
  return imports;
};

const cycleDiagnostics = (graph: Map<string, Map<string, string>>) => {
  const diagnostics: string[] = [];
  const visited = new Set<string>();

  const visit = (name: string, path: string[], files: string[]) => {
    const start = path.indexOf(name);
    if (start >= 0) {
      const cycle = [...path.slice(start), name];
      diagnostics.push(
        `Capability cycle: ${cycle.join(" -> ")}\n  ${files.slice(start).join("\n  ")}`,
      );
      return;
    }
    if (visited.has(name)) {
      return;
    }
    visited.add(name);
    for (const [dependency, importer] of graph.get(name) ?? []) {
      visit(dependency, [...path, name], [...files, importer]);
    }
  };

  for (const name of graph.keys()) {
    visit(name, [], []);
  }
  return diagnostics;
};

export const checkCapabilityDependencies = (root: string) => {
  const owners = new Map<string, string>();
  const graph = new Map<string, Map<string, string>>();
  for (const path of globSync("capabilities/{*,*/*}/package.json", { cwd: root })) {
    const { name } = packageName.parse(JSON.parse(readFileSync(join(root, path), "utf8")));
    const [, owner = ""] = path.split(sep);
    owners.set(name, owner);
  }

  const diagnostics: string[] = [];
  const files = globSync("capabilities/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}", {
    cwd: root,
    exclude: nonProduction,
  }).sort();
  for (const file of files) {
    const [, owner = ""] = file.split(sep);
    const edges = graph.get(owner) ?? new Map<string, string>();
    graph.set(owner, edges);
    for (const dependency of capabilityImports(join(root, file))) {
      const target = owners.get(dependency);
      if (!target || target === owner) {
        continue;
      }
      if (dependency === "@merit/grantmaking") {
        diagnostics.push(`${file}: ${owner} cannot import the combined @merit/grantmaking views.`);
      }
      if (!edges.has(target)) {
        edges.set(target, file);
      }
    }
  }
  return [...diagnostics, ...cycleDiagnostics(graph)];
};

if (import.meta.main) {
  const diagnostics = checkCapabilityDependencies(REPO_ROOT);
  if (diagnostics.length) {
    console.error(diagnostics.join("\n"));
    process.exitCode = 1;
  }
}
