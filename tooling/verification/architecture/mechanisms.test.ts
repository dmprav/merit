import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vite-plus/test";

import {
  classifyChangedPaths,
  formatMechanismReport,
  MAX_SUMMARY_LENGTH,
  MECHANISMS,
  type Mechanism,
  validateMechanismMap,
} from "./mechanisms";

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
  owners: ["foundation/sample/"],
  contractPaths: ["foundation/sample/src/"],
  triggerImports: ["@merit/sample"],
  docs: ["foundation/sample/README.md#overview"],
  decisions: ["docs/decisions/0001-sample.md"],
  vetoes: ["Never reimplement sample locally."],
  escapes: ["Verify sample recovery behavior."],
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

it("rejects missing paths, missing heading anchors, superseded decisions, and oversized summaries", () => {
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
            owners: ["foundation/missing/"],
            docs: ["foundation/sample/README.md#missing-anchor"],
          }),
          sampleMechanism({ id: "sample-mechanism" }),
        ],
        dir,
      );

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("duplicate mechanism id: sample-mechanism"),
          expect.stringContaining(`max ${MAX_SUMMARY_LENGTH}`),
          expect.stringContaining("path does not exist on disk: foundation/missing/"),
          expect.stringContaining("missing heading anchor #missing-anchor"),
          expect.stringContaining("is superseded"),
        ]),
      );
    },
  );
});

it("classifies contract edits as extends and consumer imports as composes", () => {
  const mechanisms: Mechanism[] = [
    sampleMechanism(),
    sampleMechanism({
      id: "grant-hooks",
      owners: ["capabilities/organizations/business/src/server/persistence/commands/locks.ts"],
      contractPaths: ["capabilities/*/business/src/server/grant-work.ts"],
      triggerImports: ["@merit/organizations/locks"],
    }),
  ];

  const contractEdit = classifyChangedPaths({
    paths: [
      "foundation/sample/src/index.ts",
      "capabilities/rounds/business/src/server/grant-work.ts",
    ],
    mechanisms,
  });
  expect(contractEdit.risk).toBe("extends");
  expect(contractEdit.matched.map((m) => [m.mechanism.id, m.impact])).toEqual([
    ["sample-mechanism", "extends"],
    ["grant-hooks", "extends"],
  ]);

  const consumerEdit = classifyChangedPaths({
    paths: ["capabilities/rounds/business/src/server/commands/prepare.ts"],
    mechanisms,
    readSource: () => 'import { roundMoney } from "@merit/sample";\nexport const x = 1;\n',
  });
  expect(consumerEdit.risk).toBe("composes");
  expect(consumerEdit.matched[0]?.mechanism.id).toBe("sample-mechanism");
  expect(consumerEdit.matched[0]?.impact).toBe("composes");
  expect(consumerEdit.matched[0]?.matchedImports).toEqual([
    "capabilities/rounds/business/src/server/commands/prepare.ts -> @merit/sample",
  ]);

  const report = formatMechanismReport(consumerEdit);
  expect(report).toContain("mechanisms: risk=composes");
  expect(report).toContain("veto: Never reimplement sample locally.");
  expect(report).toContain("escape: Verify sample recovery behavior.");
});

it("reports risk=none when no cross-cutting mechanism is matched", () => {
  const result = classifyChangedPaths({
    paths: ["README.md"],
    mechanisms: [sampleMechanism()],
  });
  expect(result.risk).toBe("none");
  expect(formatMechanismReport(result)).toContain("mechanisms: risk=none");
});
