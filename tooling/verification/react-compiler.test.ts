import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expect, it } from "vite-plus/test";

import { REPO_ROOT } from "../paths.ts";
import { runProcess } from "../testing/process";
import { checkReactCompiler, reportReactCompilerResult } from "./react-compiler.ts";

const script = join(REPO_ROOT, "tooling/verification/react-compiler.ts");

const withFixture = async (
  files: Record<string, string>,
  run: (dir: string) => Promise<void> | void,
) => {
  const dir = mkdtempSync(join(tmpdir(), "merit-react-compiler-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const target = join(dir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

it("passes when components compile without diagnostics", async () => {
  await withFixture(
    {
      "app/src/clean.tsx": `export const Clean = ({ name }: { name: string }) => <p>{name}</p>;\n`,
      "app/src/clean.test.tsx": `export const Ignored = () => null;\n`,
    },
    async (dir) => {
      const result = await checkReactCompiler({ repoRoot: dir });

      expect(result.diagnostics).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.summary).toBe("pass: React Compiler checked 1 files (1 compiled).");
    },
  );
});

it("fails with diagnostics when a component triggers a compiler bailout", async () => {
  await withFixture(
    {
      "app/src/bailout.tsx": `export const Bailout = ({ data }: { data: { useValue: () => string } }) => {
  const value = data.useValue();
  return <p>{value}</p>;
};\n`,
    },
    async (dir) => {
      const result = await checkReactCompiler({ repoRoot: dir });

      expect(result.ok).toBe(false);
      expect(result.diagnostics.join("\n")).toContain("app/src/bailout.tsx");
      expect(result.diagnostics.join("\n")).toContain(
        "Hooks must be the same function on every render",
      );
      expect(result.summary).toBe("fail: React Compiler reported 1 diagnostic(s).");

      // The CLI reports this result on stderr and exits nonzero, so the check gate fails.
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exitCode = reportReactCompilerResult(result, {
        log: (line) => stdout.push(line),
        error: (line) => stderr.push(line),
      });

      expect(exitCode).toBe(1);
      expect(stdout).toEqual([]);
      expect(stderr.join("\n")).toContain("app/src/bailout.tsx");
      expect(stderr.join("\n")).toContain("Hooks must be the same function on every render");
      expect(stderr.at(-1)).toBe("fail: React Compiler reported 1 diagnostic(s).");
    },
  );
});

it("fails when it finds no files to check", async () => {
  await withFixture({ "README.md": "# Not a Merit checkout\n" }, async (dir) => {
    const result = await checkReactCompiler({ repoRoot: dir });

    expect(result.ok).toBe(false);
    expect(result.summary).toBe(
      `fail: React Compiler found no files to check under app/src, interfaces, capabilities, foundation in ${dir}.`,
    );
  });
});

// Compiles every component in the checkout in a child process, which outlasts the default timeout.
// Node runs the script itself, with no package-manager wrapper in between, so the child's timeout
// (below the test's) kills the compiler process and the fixture is still removed.
it("checks the repository from any working directory", async () => {
  await withFixture({}, async (dir) => {
    const result = await runProcess(process.execPath, [script], {
      cwd: dir,
      timeoutMs: 25_000,
      env: { ...process.env, MERIT_TASK_CACHE: "off" },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/pass: React Compiler checked [1-9]\d* files/);
  });
}, 30_000);
