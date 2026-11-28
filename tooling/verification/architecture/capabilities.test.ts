import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expect, test } from "vite-plus/test";

import { checkCapabilityDependencies } from "./capabilities.ts";

const check = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "merit-capabilities-"));
  try {
    for (const [path, contents] of Object.entries({
      "capabilities/rounds/business/package.json": '{"name":"@merit/rounds"}',
      "capabilities/access/package.json": '{"name":"@merit/access"}',
      "capabilities/reviews/business/package.json": '{"name":"@merit/reviews"}',
      "capabilities/reviews/web/package.json": '{"name":"@merit/reviews-web"}',
      "capabilities/grantmaking/business/package.json": '{"name":"@merit/grantmaking"}',
      "capabilities/grantmaking/ai/package.json": '{"name":"@merit/grantmaking-ai"}',
      ...files,
    })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), contents);
    }
    return checkCapabilityDependencies(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("finds a capability cycle across packages with a type-only return edge", () => {
  const web = "capabilities/reviews/web/src/view.tsx";
  const access = "capabilities/access/src/database/grants.ts";
  const round = "capabilities/rounds/business/src/round.ts";
  expect(
    check({
      [web]: 'export type { Grant } from "@merit/access/grants";',
      [access]: 'export type { Round as Grant } from "@merit/rounds/api";',
      [round]: 'import type { Review } from "@merit/reviews/domain"; export type Round = Review;',
      "capabilities/reviews/business/src/domain.ts": "export type Review = string;",
    }),
  ).toEqual([
    `Capability cycle: access -> rounds -> reviews -> access\n  ${access}\n  ${round}\n  ${web}`,
  ]);
});

test("rejects a one-way import of grantmaking even without a cycle", () => {
  const file = "capabilities/reviews/web/src/view.tsx";
  expect(check({ [file]: 'export type View = import("@merit/grantmaking/api").View;' })).toEqual([
    expect.stringContaining(file),
  ]);
});

test("permits composition within grantmaking, app assembly, interfaces and test fixtures", () => {
  const composition = 'import type { View } from "@merit/grantmaking/api";';
  expect(
    check({
      "capabilities/grantmaking/ai/src/tool.ts": composition,
      "interfaces/product/src/load.ts": composition,
      "app/src/services.ts": composition,
      "capabilities/grantmaking/business/src/index.ts": 'export * from "@merit/reviews/api";',
      "capabilities/reviews/web/node_modules/external/index.js": "not valid $#@!",
      "capabilities/reviews/web/dist/assets/main.js": composition,
      "capabilities/reviews/web/src/testing/examples.ts": composition,
      "capabilities/reviews/web/src/probe.story-fixtures.tsx": composition,
      "capabilities/reviews/web/src/probe.stories.tsx": composition,
      "capabilities/reviews/web/src/probe.test.tsx": composition,
    }),
  ).toEqual([]);
});
