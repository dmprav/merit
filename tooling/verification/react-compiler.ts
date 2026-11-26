import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { transform } from "oxc-transform-react";

import { REPO_ROOT } from "../paths.ts";
import { reactCompilerOptions } from "../react-compiler.ts";

export interface ReactCompilerCheckOptions {
  /** Directory the checked roots are resolved from. Defaults to this checkout. */
  repoRoot?: string;
}

export interface ReactCompilerCheckResult {
  ok: boolean;
  diagnostics: string[];
  summary: string;
}

const roots = ["app/src", "interfaces", "capabilities", "foundation"];
const skippedDirs = new Set(["node_modules", "dist", ".git"]);

const isCheckedFile = (name: string) =>
  /\.(tsx|ts)$/.test(name) &&
  name !== "routeTree.gen.ts" &&
  !/\.(test|spec|stories|story-fixtures|d)\./.test(name);

// A hand-written walk rather than fs.globSync: glob skips dot-prefixed files and
// directories, which this check has always included.
const collectFiles = (repoRoot: string, dir: string, out: string[]) => {
  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) {
        collectFiles(repoRoot, join(dir, entry.name), out);
      }
      continue;
    }
    if (isCheckedFile(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
};

const discoverFiles = (repoRoot: string) => {
  const files: string[] = [];
  for (const root of roots) {
    if (existsSync(join(repoRoot, root))) {
      collectFiles(repoRoot, root, files);
    }
  }
  return files;
};

export const checkReactCompiler = async ({
  repoRoot = REPO_ROOT,
}: ReactCompilerCheckOptions = {}): Promise<ReactCompilerCheckResult> => {
  const files = discoverFiles(repoRoot);
  if (files.length === 0) {
    return {
      ok: false,
      diagnostics: [],
      summary: `fail: React Compiler found no files to check under ${roots.join(", ")} in ${repoRoot}.`,
    };
  }

  let compiled = 0;
  const diagnostics: string[] = [];

  for (const file of files) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    const result = await transform(file, source, {
      jsx: { runtime: "automatic", development: false },
      reactCompiler: reactCompilerOptions,
    });
    if (result.code?.includes("react/compiler-runtime")) {
      compiled++;
    }
    for (const error of result.errors ?? []) {
      diagnostics.push(
        error.codeframe
          ? `${file}: ${error.message}\n${error.codeframe}`
          : `${file}: ${error.message}`,
      );
    }
  }

  if (diagnostics.length > 0) {
    return {
      ok: false,
      diagnostics,
      summary: `fail: React Compiler reported ${diagnostics.length} diagnostic(s).`,
    };
  }
  return {
    ok: true,
    diagnostics,
    summary: `pass: React Compiler checked ${files.length} files (${compiled} compiled).`,
  };
};

type CheckOutput = { log: (line: string) => void; error: (line: string) => void };

/**
 * Prints a check result the way the CLI reports it, diagnostics and failures on stderr, and returns
 * the exit code: 1 when the check failed, 0 otherwise.
 */
export const reportReactCompilerResult = (
  { ok, diagnostics, summary }: ReactCompilerCheckResult,
  output: CheckOutput,
): number => {
  for (const diagnostic of diagnostics) {
    output.error(diagnostic);
  }
  if (ok) {
    output.log(summary);
    return 0;
  }
  output.error(summary);
  return 1;
};

if (import.meta.main) {
  process.exitCode = reportReactCompilerResult(await checkReactCompiler(), console);
}
