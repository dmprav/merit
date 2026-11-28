import { describe, expect, test } from "vite-plus/test";

import { MECHANISMS } from "../../verification/architecture/mechanisms.config.ts";
import {
  areaForPath,
  CONCERNS_BY_KIND,
  describeRunTarget,
  hasRunIdForm,
  isChurnExcludedPath,
  isPathInTarget,
  listAreas,
  measuresEntryWeights,
  resolveRunTarget,
} from "./runs.ts";

describe("areas", () => {
  test.each([
    ["capabilities/grantmaking/business/src/a.ts", "capabilities/grantmaking"],
    ["foundation/ui/src/button.tsx", "foundation/ui"],
    ["interfaces/product/src/routes/x.tsx", "interfaces/product"],
    ["tooling/agents/scout.ts", "tooling/agents"],
    ["tooling/cli.ts", "tooling"],
    ["app/src/router.tsx", "app"],
    ["docs/guides/testing.md", "docs"],
    [".agents/tasks/scout.md", ".agents"],
    [".github/workflows/ci.yml", ".github"],
    ["README.md", "README.md"],
    ["./docs\\guides\\a.md", "docs"],
  ])("maps %s to %s", (filePath, area) => {
    expect(areaForPath(filePath)).toBe(area);
  });

  test.each([
    "verifications/240.md",
    "pnpm-lock.yaml",
    "app/pnpm-lock.yaml",
    "Cargo.lock",
    "app/tests/__snapshots__/a.snap",
    "docs/assets/diagram.png",
    "docs/assets/photo.JPG",
    "interfaces/site/public/logo.svg",
    "foundation/db/database/migrations/meta/0001_snapshot.json",
    "foundation/db/database/migrations/meta/_journal.json",
  ])("excludes %s from churn", (filePath) => {
    expect(isChurnExcludedPath(filePath)).toBe(true);
  });

  test.each([
    "foundation/db/database/migrations/0001_init.sql",
    "docs/guides/lock.md",
    "tooling/agents/scout.ts",
    "package.json",
  ])("counts %s toward churn", (filePath) => {
    expect(isChurnExcludedPath(filePath)).toBe(false);
  });

  test("lists the areas of tracked files that count toward churn, once each", () => {
    expect(
      listAreas([
        "docs/a.md",
        "docs/b.md",
        "tooling/agents/x.ts",
        "verifications/1.md",
        "pnpm-lock.yaml",
        "capabilities/grantmaking/business/src/y.ts",
      ]).sort(),
    ).toEqual(["capabilities/grantmaking", "docs", "tooling/agents"]);
  });
});

describe("run ids", () => {
  test("resolves each id form to its target", () => {
    expect(resolveRunTarget("change-batch")).toEqual({ kind: "change-batch" });
    expect(resolveRunTarget("records")).toEqual({ kind: "records" });
    expect(resolveRunTarget("area:tooling/agents")).toEqual({
      kind: "area",
      area: "tooling/agents",
    });
    const mechanism = MECHANISMS[0];
    expect(resolveRunTarget(`mechanism:${mechanism?.id}`)).toEqual({
      kind: "mechanism",
      mechanism,
    });
  });

  test("describes each target by its area, mechanism id, or subject", () => {
    expect(describeRunTarget({ kind: "area", area: "app" })).toBe("app");
    expect(describeRunTarget({ kind: "records" })).toBe("verification records");
    expect(describeRunTarget({ kind: "change-batch" })).toBe("merged commits on origin/main");
    expect(describeRunTarget(resolveRunTarget("mechanism:audit-trail"))).toBe("audit-trail");
  });

  test.each(["docs", "verification-flakes", "area:", "mechanism:", "auto", ""])(
    "rejects %j with the valid id forms",
    (id) => {
      expect(() => resolveRunTarget(id)).toThrow(
        /"change-batch", "area:<area>", "mechanism:<mechanism id>", or "records"/,
      );
    },
  );

  test("rejects an unknown mechanism with the known mechanism ids", () => {
    expect(() => resolveRunTarget("mechanism:nope")).toThrow(
      /Unknown run id "mechanism:nope"\..*Mechanism ids: authorization-policy, audit-trail/,
    );
  });

  test("recognizes the shape of a run id without checking its target", () => {
    expect(["change-batch", "records", "area:x", "mechanism:y"].every(hasRunIdForm)).toBe(true);
    expect(["lens", "area:", "docs", "verification-flakes"].some(hasRunIdForm)).toBe(false);
  });
});

describe("run targets", () => {
  test("an area owns the paths that map to it", () => {
    const target = resolveRunTarget("area:tooling/agents");
    expect(isPathInTarget(target, "tooling/agents/scout.ts")).toBe(true);
    expect(isPathInTarget(target, "tooling/verification/x.ts")).toBe(false);
    expect(isPathInTarget(target, "docs/a.md")).toBe(false);
  });

  test("a mechanism owns its contract and adapter paths", () => {
    const target = resolveRunTarget("mechanism:audit-trail");
    expect(isPathInTarget(target, "capabilities/audit/business/src/events.ts")).toBe(true);
    expect(isPathInTarget(target, "docs/a.md")).toBe(false);
  });

  test("a change batch and records have no path filter", () => {
    expect(isPathInTarget({ kind: "change-batch" }, "anything/at/all.ts")).toBe(true);
    expect(isPathInTarget({ kind: "records" }, "anything/at/all.ts")).toBe(true);
  });

  test("measures bundle entry weights only for app and interfaces areas", () => {
    expect(measuresEntryWeights({ kind: "area", area: "app" })).toBe(true);
    expect(measuresEntryWeights({ kind: "area", area: "interfaces/product" })).toBe(true);
    expect(measuresEntryWeights({ kind: "area", area: "foundation/ui" })).toBe(false);
    expect(measuresEntryWeights(resolveRunTarget("mechanism:audit-trail"))).toBe(false);
  });
});

describe("concerns", () => {
  test("orders each run kind's concerns by weight", () => {
    expect(CONCERNS_BY_KIND).toEqual({
      "change-batch": [
        "bugs-security",
        "tests",
        "docs",
        "architecture",
        "simplification",
        "mcp-db",
      ],
      mechanism: ["architecture", "simplification", "bugs-security", "tests", "mcp-db", "docs"],
      area: ["bugs-security", "architecture", "tests", "simplification", "mcp-db", "docs"],
      records: ["verification"],
    });
  });
});
