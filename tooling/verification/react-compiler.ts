import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { transform } from "oxc-transform-react";

import { reactCompilerOptions } from "../react-compiler.ts";

const roots = ["app/src", "interfaces", "capabilities", "foundation"];
const skippedDirs = new Set(["node_modules", "dist", ".git"]);

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
    if (existsSync(root)) {
      collectFiles(root, files);
    }
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
