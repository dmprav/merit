import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vite-plus/test";

import { buildDeclarations } from "./bundle";

const outputs: string[] = [];

afterEach(() => {
  for (const directory of outputs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const outFile = () => {
  const directory = mkdtempSync(path.join(tmpdir(), "merit-ds-test-"));
  outputs.push(directory);
  return path.join(directory, "index.d.ts");
};

const outDirOf = (config: string): string => {
  const parsed: unknown = JSON.parse(readFileSync(config, "utf8"));
  const outDir = (parsed as { compilerOptions?: { outDir?: unknown } }).compilerOptions?.outDir;
  if (typeof outDir !== "string") {
    throw new Error("The declaration config names no outDir.");
  }
  return outDir;
};

const compilerFailure = (output: string) =>
  Object.assign(new Error("Command failed: vp exec tsc"), { stdout: Buffer.from(output) });

test("keeps declarations TypeScript wrote despite reporting diagnostics", async () => {
  const target = outFile();
  await buildDeclarations(target, {
    compile: (config) => {
      const declarations = outDirOf(config);
      mkdirSync(path.join(declarations, "foundation/ui/src"), { recursive: true });
      writeFileSync(
        path.join(declarations, "foundation/ui/src/button.d.ts"),
        "export declare const Button: () => null;\n",
      );
      throw compilerFailure("error TS2322: Type 'string' is not assignable to type 'number'.");
    },
  });

  expect(readFileSync(target, "utf8")).toContain("export declare const Button");
});

test("reports why TypeScript emitted nothing and removes its scratch directory", async () => {
  let scratch = "";
  const build = buildDeclarations(outFile(), {
    compile: (config) => {
      scratch = path.dirname(config);
      throw compilerFailure("error TS5083: Cannot read file 'foundation/ui/tsconfig.json'.");
    },
  });

  await expect(build).rejects.toThrow(
    "TypeScript emitted no declarations: error TS5083: Cannot read file 'foundation/ui/tsconfig.json'.",
  );
  expect(existsSync(scratch)).toBe(false);
});
