import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

import { classifyChangedPaths, formatMechanismReport, validateMechanismMap } from "./mechanisms";
import { MAX_SUMMARY_LENGTH, MECHANISMS, type Mechanism } from "./mechanisms.config";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const withTempRepo = (files: Record<string, string>, run: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "merit-mechanisms-"));
  try {
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = join(dir, relPath);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const sampleMechanism = (overrides: Partial<Mechanism> = {}): Mechanism => ({
  id: "sample-mechanism",
  summary: "Short single-line summary of the shared mechanism.",
  contracts: ["foundation/sample/src/**"],
  adapters: ["interfaces/*/src/**/controllers/**"],
  docs: ["foundation/sample/README.md#overview"],
  decisions: ["docs/decisions/0001-sample.md"],
  ...overrides,
});

it("validates the repository mechanism map against files, anchors, and active decisions", () => {
  expect(validateMechanismMap(MECHANISMS, repoRoot)).toEqual([]);
});

it("passes the CLI --check command on the repository", () => {
  const result = spawnSync("vpx", ["tooling/verification/architecture/mechanisms.ts", "--check"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 20_000,
  });

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("mechanisms ok");
});

it("rejects empty wildcard patterns, missing anchors, superseded decisions, and oversized summaries", () => {
  withTempRepo(
    {
      "foundation/sample/src/index.ts": "export const value = 1;\n",
      "foundation/sample/README.md": "# Sample\n\n## Overview\n\nDetails.\n",
      "docs/decisions/0001-sample.md": "# Sample\n\nSuperseded by 0002.\n",
    },
    (dir) => {
      const errors = validateMechanismMap(
        [
          sampleMechanism({
            summary: "x".repeat(MAX_SUMMARY_LENGTH + 1),
            contracts: ["foundation/*/src/missing.ts"],
            adapters: ["interfaces/*/src/**/controllers/**"],
            docs: ["foundation/sample/README.md#missing-anchor"],
          }),
          sampleMechanism({ id: "sample-mechanism", adapters: [] }),
        ],
        dir,
      );

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("duplicate mechanism id: sample-mechanism"),
          expect.stringContaining(`max ${MAX_SUMMARY_LENGTH}`),
          expect.stringContaining("pattern matches no files on disk: foundation/*/src/missing.ts"),
          expect.stringContaining(
            "pattern matches no files on disk: interfaces/*/src/**/controllers/**",
          ),
          expect.stringContaining("missing heading anchor #missing-anchor"),
          expect.stringContaining("is superseded"),
        ]),
      );
    },
  );
});

it("classifies contracts as extends, adapters (including zero-dir globstar) as composes, and unrelated paths as none", () => {
  const mechanisms: Mechanism[] = [sampleMechanism()];

  const contractEdit = classifyChangedPaths({
    paths: ["foundation/sample/src/index.ts"],
    mechanisms,
  });
  expect(contractEdit.risk).toBe("extends");
  expect(contractEdit.matched[0]?.impact).toBe("extends");

  const directControllerEdit = classifyChangedPaths({
    paths: [
      "interfaces/product/src/controllers/example.ts",
      "interfaces/admin/src/features/orgs/controllers/example.ts",
    ],
    mechanisms,
  });
  expect(directControllerEdit.risk).toBe("composes");
  expect(directControllerEdit.matched[0]?.matchedPaths).toEqual([
    "interfaces/admin/src/features/orgs/controllers/example.ts",
    "interfaces/product/src/controllers/example.ts",
  ]);
  expect(formatMechanismReport(directControllerEdit)).toContain("mechanisms: risk=composes");

  const unrelatedEdit = classifyChangedPaths({
    paths: ["README.md"],
    mechanisms,
  });
  expect(unrelatedEdit.risk).toBe("none");
  expect(formatMechanismReport(unrelatedEdit)).toContain("mechanisms: risk=none");
});
