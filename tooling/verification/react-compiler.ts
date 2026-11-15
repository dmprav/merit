import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { reactCompilerOptions } from "../react-compiler.ts";

type CompilerError = {
  message: string;
  codeframe?: string | null;
};

type TransformResult = {
  code?: string;
  errors?: CompilerError[];
};

type TransformFn = (
  filename: string,
  code: string,
  options: {
    jsx: { runtime: "automatic"; development: false };
    reactCompiler: typeof reactCompilerOptions;
  },
) => Promise<TransformResult>;

const require = createRequire(new URL("../../app/package.json", import.meta.url));
const { transform } = require("oxc-transform-react") as { transform: TransformFn };

const roots = ["app/src", "interfaces", "capabilities", "foundation"];
const skippedDirs = new Set(["node_modules", "dist", ".git", ".cloudflare"]);

const isCheckedFile = (name: string) =>
  /\.(tsx|ts)$/.test(name) &&
  name !== "routeTree.gen.ts" &&
  !/\.(test|spec|stories|story-fixtures|d)\./.test(name);

const collectFiles = (dir: string, out: string[]) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) {
        collectFiles(join(dir, entry.name), out);
      }
      continue;
    }
    if (isCheckedFile(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
};

const run = async () => {
  const files: string[] = [];
  for (const root of roots) {
    collectFiles(root, files);
  }

  let compiled = 0;
  let diagnostics = 0;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const result = await transform(file, source, {
      jsx: { runtime: "automatic", development: false },
      reactCompiler: reactCompilerOptions,
    });
    if (result.code?.includes("react/compiler-runtime")) {
      compiled++;
    }
    if (result.errors?.length) {
      diagnostics += result.errors.length;
      for (const error of result.errors) {
        console.error(`${file}: ${error.message}`);
        if (error.codeframe) {
          console.error(error.codeframe);
        }
      }
    }
  }

  if (diagnostics > 0) {
    console.error(`fail: React Compiler reported ${diagnostics} diagnostic(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`pass: React Compiler checked ${files.length} files (${compiled} compiled).`);
};

await run();
