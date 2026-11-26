import { describe, expect, test } from "vite-plus/test";

import { ARCHITECTURE_AXES, type RotationAxis } from "./axes.ts";
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

const axisWith = (flag: "entryWeights" | "suppressionTopFiles"): RotationAxis => {
  const axis = ARCHITECTURE_AXES.find((entry) => entry.telemetry?.[flag]);
  if (!axis) {
    throw new Error(`No axis asks for ${flag}.`);
  }
  return axis;
};

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

const collect = (ports: TelemetryPorts, axis: RotationAxis | null, capabilitySymmetry = false) =>
  collectStructuralTelemetry(ports, {
    capabilitySymmetry,
    axis,
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
  test("measures entry weights for an axis that asks for them", () => {
    const { ports } = createTelemetryPorts();
    expect(collect(ports, axisWith("entryWeights")).entryWeights).toEqual([
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

  test("skips the entry weight report for an axis that does not ask for it", () => {
    const { ports, reports } = createTelemetryPorts();
    expect(collect(ports, null)).not.toHaveProperty("entryWeights");
    expect(reports).not.toContain("entryWeight");
  });

  test("names suppression top files only for an axis that asks for them", () => {
    const { ports } = createTelemetryPorts();
    expect(collect(ports, axisWith("suppressionTopFiles")).suppressions.topFiles).toHaveLength(3);
    expect(collect(ports, axisWith("entryWeights")).suppressions).not.toHaveProperty("topFiles");
  });

  test("adds capability symmetry only when the lens asks for it", () => {
    const { ports } = createTelemetryPorts();
    expect(collect(ports, null, true).capabilitySymmetry).toEqual([
      { capability: "rounds", domain: 0, server: 0, web: 1, ai: 0 },
    ]);
    expect(collect(ports, null, false)).not.toHaveProperty("capabilitySymmetry");
  });

  test("records a failed fallow report and still returns the other signals", () => {
    const { ports } = createTelemetryPorts(["health"]);
    expect(collect(ports, null)).toMatchObject({
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
