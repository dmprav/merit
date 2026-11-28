import { describe, expect, test } from "vite-plus/test";

import {
  buildCapabilitySymmetry,
  collectStructuralTelemetry,
  collectSuppressionLedger,
  type TelemetryPorts,
} from "./telemetry.ts";

const SOURCES: Record<string, string> = {
  "capabilities/rounds/web/src/a.ts":
    "// oxlint-disable-next-line no-console\n// @ts-expect-error legacy\n// oxlint-disable no-alert",
  "foundation/ui/src/b.tsx": "// eslint-disable-line\n// fallow-ignore-next-line",
  "app/src/c.ts": "// oxlint-disable-line",
  "capabilities/rounds/web/src/a.test.ts": "// oxlint-disable",
  "tooling/agents/d.ts": "// oxlint-disable",
};

const readFile = (repoPath: string): string => {
  const content = SOURCES[repoPath];
  if (content === undefined) {
    throw new Error(`ENOENT: ${repoPath}`);
  }
  return content;
};

const trackedFiles = [...Object.keys(SOURCES), "interfaces/admin/src/missing.ts"];

/** Fake telemetry ports that record which fallow reports run. */
const createTelemetryPorts = (failing: readonly string[] = []) => {
  const reports: string[] = [];

  const report = (name: string, value: unknown) => () => {
    reports.push(name);
    if (failing.includes(name)) {
      throw new Error(`${name} timed out`);
    }
    return value;
  };

  const ports: TelemetryPorts = {
    fallow: {
      health: report("health", {}),
      dupes: report("dupes", {}),
      entryWeight: report("entryWeight", {
        entry_weight: {
          entries: [
            {
              path: "app/src/router.tsx",
              source: "tanstack-router",
              eager_modules: 12,
              eager_bytes: 20_480,
              deferred_modules: 3,
            },
          ],
        },
      }),
    },
    git: { isShallow: () => true },
    readFile,
  };
  return { ports, reports };
};

const collect = (
  ports: TelemetryPorts,
  {
    inScope = () => true,
    capabilitySymmetry = false,
    entryWeights = false,
  }: {
    inScope?: (filePath: string) => boolean;
    capabilitySymmetry?: boolean;
    entryWeights?: boolean;
  } = {},
) =>
  collectStructuralTelemetry(ports, {
    inScope,
    capabilitySymmetry,
    entryWeights,
    trackedFiles,
    trackedPathsByIssue: new Map(),
  });

describe("capability symmetry", () => {
  test("counts production files per capability layer", () => {
    expect(
      buildCapabilitySymmetry([
        "capabilities/rounds/business/src/domain/round.ts",
        "capabilities/rounds/business/src/domain/round.test.ts",
        "capabilities/rounds/business/src/server/service.ts",
        "capabilities/rounds/ai/src/tools.ts",
        "capabilities/reviews/web/src/views/list.tsx",
        "capabilities/reviews/README.md",
        "foundation/ui/src/button.tsx",
      ]),
    ).toEqual([
      { capability: "reviews", domain: 0, server: 0, web: 1, ai: 0 },
      { capability: "rounds", domain: 1, server: 1, web: 0, ai: 1 },
    ]);
  });

  test("lists a capability whose production files sit outside the counted layers", () => {
    expect(buildCapabilitySymmetry(["capabilities/audit/business/src/index.ts"])).toEqual([
      { capability: "audit", domain: 0, server: 0, web: 0, ai: 0 },
    ]);
  });

  test("lists only capabilities that own a scoped file, counting all of their layers", () => {
    const tracked = [
      "capabilities/rounds/business/src/domain/round.ts",
      "capabilities/rounds/web/src/views/round.tsx",
      "capabilities/reviews/business/src/domain/review.ts",
    ];
    expect(
      buildCapabilitySymmetry(tracked, ["capabilities/rounds/web/src/views/round.tsx"]),
    ).toEqual([{ capability: "rounds", domain: 1, server: 0, web: 1, ai: 0 }]);
    expect(buildCapabilitySymmetry(tracked, ["foundation/ui/src/button.tsx"])).toEqual([]);
  });
});

describe("suppression ledger", () => {
  test("counts suppressions by kind in production product sources and skips unreadable files", () => {
    expect(collectSuppressionLedger(readFile, trackedFiles, false)).toEqual({
      total: 6,
      byKind: {
        "oxlint-disable": 3,
        "eslint-disable": 1,
        "fallow-ignore": 1,
        "ts-expect-error": 1,
      },
    });
  });

  test("names the files with the most suppressions when asked", () => {
    expect(collectSuppressionLedger(readFile, trackedFiles, true).topFiles).toEqual([
      { path: "capabilities/rounds/web/src/a.ts", count: 3 },
      { path: "foundation/ui/src/b.tsx", count: 2 },
      { path: "app/src/c.ts", count: 1 },
    ]);
  });
});

describe("structural telemetry", () => {
  test("measures entry weights when asked", () => {
    const { ports } = createTelemetryPorts();
    expect(collect(ports, { entryWeights: true }).entryWeights).toEqual([
      {
        path: "app/src/router.tsx",
        source: "tanstack-router",
        eagerModules: 12,
        eagerKb: 20,
        deferredModules: 3,
        trackedBy: [],
      },
    ]);
  });

  test("skips the entry weight report when not asked", () => {
    const { ports, reports } = createTelemetryPorts();
    expect(collect(ports)).not.toHaveProperty("entryWeights");
    expect(reports).not.toContain("entryWeight");
  });

  test("always names the files with the most suppressions, limited to the audited scope", () => {
    const { ports } = createTelemetryPorts();
    expect(collect(ports).suppressions.topFiles).toHaveLength(3);
    expect(
      collect(ports, { inScope: (path) => path.startsWith("capabilities/") }).suppressions,
    ).toEqual({
      total: 3,
      byKind: {
        "oxlint-disable": 2,
        "eslint-disable": 0,
        "fallow-ignore": 0,
        "ts-expect-error": 1,
      },
      topFiles: [{ path: "capabilities/rounds/web/src/a.ts", count: 3 }],
    });
  });

  test("adds capability symmetry only when asked", () => {
    const { ports } = createTelemetryPorts();
    expect(collect(ports, { capabilitySymmetry: true }).capabilitySymmetry).toEqual([
      { capability: "rounds", domain: 0, server: 0, web: 1, ai: 0 },
    ]);
    expect(collect(ports)).not.toHaveProperty("capabilitySymmetry");
    expect(
      collect(ports, { capabilitySymmetry: true, inScope: (path) => path.startsWith("app/") })
        .capabilitySymmetry,
    ).toEqual([]);
  });

  test("records a failed fallow report and still returns the other signals", () => {
    const { ports } = createTelemetryPorts(["health"]);
    expect(collect(ports)).toMatchObject({
      shallowClone: true,
      topFiles: [],
      hotspots: [],
      thresholdOverrides: [],
      cloneGroups: [],
      suppressions: { total: 6 },
      fallowErrors: ["health: health timed out"],
    });
  });
});
