import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = join(repoRoot, "tooling/verification/react-compiler.ts");

const runCheck = (cwd: string) =>
  spawnSync("pnpm", ["exec", "vpx", script], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, MERIT_TASK_CACHE: "off" },
  });

const withFixture = (files: Record<string, string>, run: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "merit-react-compiler-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const target = join(dir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

it("passes when components compile without diagnostics", () => {
  withFixture(
    {
      "app/src/clean.tsx": `export const Clean = ({ name }: { name: string }) => <p>{name}</p>;\n`,
    },
    (dir) => {
      const result = runCheck(dir);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("pass: React Compiler checked 1 files (1 compiled).");
    },
  );
});

it("fails with diagnostics when a component triggers a compiler bailout", () => {
  withFixture(
    {
      "app/src/bailout.tsx": `export const Bailout = ({ data }: { data: { useValue: () => string } }) => {
  const value = data.useValue();
  return <p>{value}</p>;
};\n`,
    },
    (dir) => {
      const result = runCheck(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("app/src/bailout.tsx");
      expect(result.stderr).toContain("Hooks must be the same function on every render");
      expect(result.stderr).toContain("fail: React Compiler reported 1 diagnostic(s).");
    },
  );
});
