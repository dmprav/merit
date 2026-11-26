import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

import { checkReactCompiler } from "./react-compiler.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = join(repoRoot, "tooling/verification/react-compiler.ts");

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
    },
  );
});

it("checks only the files it is given", async () => {
  await withFixture(
    {
      "app/src/clean.tsx": `export const Clean = () => <p>clean</p>;\n`,
      "interfaces/web/src/other.tsx": `export const Other = () => <p>other</p>;\n`,
    },
    async (dir) => {
      const result = await checkReactCompiler({ repoRoot: dir, files: ["app/src/clean.tsx"] });

      expect(result.summary).toBe("pass: React Compiler checked 1 files (1 compiled).");
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

it("checks the repository from any working directory", async () => {
  await withFixture({}, (dir) => {
    const result = spawnSync("pnpm", ["exec", "vpx", script], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, MERIT_TASK_CACHE: "off" },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/pass: React Compiler checked [1-9]\d* files/);
  });
});
