import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { build, type Plugin, type PluginOption } from "vite-plus";

import { reactCompilerOptions } from "../../react-compiler";

const root = path.resolve(import.meta.dirname, "../../..");
const uiPackage = path.join(root, "foundation/ui");

/** React stays outside the library bundle so previews and consumers share one copy. */
const globals = new Map<string, string>([
  ["react", "React"],
  ["react-dom", "ReactDOM"],
  ["react-dom/client", "ReactDOM"],
  ["react/jsx-runtime", "ReactJSXRuntime"],
]);

const namespace = "Merit";

const uiEntries = async () => {
  const manifest: unknown = JSON.parse(
    await readFile(path.join(uiPackage, "package.json"), "utf8"),
  );
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("exports" in manifest) ||
    typeof manifest.exports !== "object" ||
    manifest.exports === null
  ) {
    throw new Error("Unexpected foundation/ui package.json exports shape.");
  }
  return Object.entries(manifest.exports)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].endsWith(".tsx"),
    )
    .map(([subpath, file]) => ({ specifier: `@merit/ui${subpath.slice(1)}`, file }));
};

const entrySource = async () =>
  [
    ...(await uiEntries()).map(({ specifier }) => `export * from "${specifier}";`),
    `export * from "@merit/forms";`,
    `export * from "@merit/tables";`,
    // Form previews and consumers describe fields with the same schema library @merit/forms uses.
    `export { z } from "zod";`,
    `import { createElement } from "react";`,
    `import { MessagesProvider } from "@merit/i18n";`,
    // createMessages always includes the shared "common" catalog the foundation packages use.
    `const messages = {};`,
    `export const Provider = ({ children }) => createElement(MessagesProvider, { messages }, children);`,
  ].join("\n");

/** Entries live under the package's node_modules so their imports resolve like the package's own. */
const entryDirectory = path.join(root, "tooling/storybook/node_modules/.cache/design-system");

const buildIife = async ({
  id,
  source,
  name,
  outDir,
  fileName,
  plugins = [],
}: {
  id: string;
  source: () => Promise<string>;
  name: string;
  outDir: string;
  fileName: string;
  plugins?: PluginOption[];
}) => {
  await mkdir(entryDirectory, { recursive: true });
  const entry = path.join(entryDirectory, `${id}.tsx`);
  await writeFile(entry, await source());
  await build({
    configFile: false,
    root: path.join(root, "tooling/storybook"),
    logLevel: "warn",
    mode: "production",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins,
    build: {
      outDir,
      emptyOutDir: false,
      minify: true,
      cssCodeSplit: false,
      lib: { entry, name, formats: ["iife"], fileName: () => fileName, cssFileName: "bundle" },
    },
  });
};

/**
 * Resolves React modules to the globals the lib scripts define, for ES imports and CommonJS
 * requires alike, so every script shares one React.
 */
const reactFromGlobals = (modules: string[]): Plugin => ({
  name: "design-system-react-globals",
  enforce: "pre",
  resolveId: (source) => (modules.includes(source) ? `\0global:${source}` : undefined),
  load: (id) => {
    const source = id.startsWith("\0global:") ? id.slice("\0global:".length) : undefined;
    const target = source === undefined ? undefined : globals.get(source);
    return target === undefined ? undefined : `module.exports = window.${target};`;
  },
});

/** Builds React, ReactDOM and the jsx runtime as classic scripts that set window globals. */
const buildReact = async (outDir: string) => {
  await buildIife({
    id: "react-globals",
    source: async () =>
      `import * as React from "react"; import * as Runtime from "react/jsx-runtime"; window.React = React; window.ReactJSXRuntime = Runtime;`,
    name: "ReactGlobals",
    outDir,
    fileName: "lib/react.production.min.js",
  });
  await buildIife({
    id: "react-dom-globals",
    source: async () =>
      `import * as DOM from "react-dom"; import * as Client from "react-dom/client"; window.ReactDOM = { ...DOM, ...Client };`,
    name: "ReactDOMGlobals",
    outDir,
    fileName: "lib/react-dom.production.min.js",
    plugins: [reactFromGlobals(["react"])],
  });
};

/** Builds every export of @merit/ui, @merit/forms and @merit/tables into window.Merit. */
export const buildLibrary = async (outDir: string, components: string[]) => {
  await buildReact(outDir);
  await buildIife({
    id: "merit-design-system",
    source: entrySource,
    name: namespace,
    outDir,
    fileName: "bundle.js",
    plugins: [reactFromGlobals(Object.keys(globals)), react({ compiler: reactCompilerOptions })],
  });
  const bundlePath = path.join(outDir, "bundle.js");
  const bundle = await readFile(bundlePath, "utf8");
  if (/<\/script|<!--/i.test(bundle)) {
    throw new Error("bundle.js contains </script or <!--, which would end an inline script.");
  }
  const header = { format: 4, namespace, components: components.map((name) => ({ name })) };
  await writeFile(bundlePath, `/* @ds-bundle: ${JSON.stringify(header)} */\n${bundle}`);
};

const exportedFiles = async () => [
  ...(await uiEntries()).map(({ file }) => path.join(uiPackage, file)),
  path.join(root, "foundation/forms/src/index.ts"),
  path.join(root, "foundation/tables/src/index.ts"),
];

const declarationFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".d.ts"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
};

/** Emits declarations for the exported modules and joins them into one documentation file. */
export const buildDeclarations = async (outFile: string, scratch: string) => {
  const config = path.join(scratch, "tsconfig.json");
  const declarations = path.join(scratch, "declarations");
  await writeFile(
    config,
    JSON.stringify({
      extends: path.join(uiPackage, "tsconfig.json"),
      compilerOptions: {
        declaration: true,
        emitDeclarationOnly: true,
        noEmit: false,
        noEmitOnError: false,
        outDir: declarations,
        rootDir: root,
        skipLibCheck: true,
        types: ["react", "react-dom", "vite/client"],
        typeRoots: [
          path.join(uiPackage, "node_modules/@types"),
          path.join(uiPackage, "node_modules"),
        ],
      },
      include: [],
      files: await exportedFiles(),
    }),
  );
  try {
    // Declaration emit succeeds despite type errors outside the exported surface; the library's own typecheck owns those.
    execFileSync(path.join(root, "node_modules/.bin/vp"), ["exec", "tsc", "-p", config], {
      cwd: uiPackage,
      stdio: "pipe",
    });
  } catch {
    // tsc exits non-zero on diagnostics but still writes declarations; an empty result fails below.
  }
  const files = await declarationFiles(declarations);
  if (files.length === 0) {
    throw new Error("TypeScript emitted no declarations.");
  }
  const sections = await Promise.all(
    files.map(async (file) => {
      const text = (await readFile(file, "utf8"))
        .replaceAll(/^import [\s\S]*?;\n/gm, "")
        .replaceAll(/^export \{\};\n?/gm, "")
        .replaceAll(/^export (?:type )?\{[^}]*\} from [^;]+;\n/gm, "");
      return `\n// ── ${path.relative(declarations, file).replace(/\.d\.ts$/, ".tsx")}\n${text}`;
    }),
  );
  await writeFile(
    outFile,
    `// Merit — declarations generated from @merit/ui, @merit/forms and @merit/tables. Documentation only; every export lives on window.${namespace}.\n// Wrap rendered trees in <${namespace}.Provider> for shared messages and en-GB formatting.\nexport declare const Provider: (props: { children: import("react").ReactNode }) => import("react").JSX.Element;\n${sections.join("")}`,
  );
  await rm(scratch, { recursive: true, force: true });
};
