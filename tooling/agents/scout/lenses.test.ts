import { describe, expect, test } from "vite-plus/test";

import { SCOUT_LENSES, type ScoutLens } from "../proposal.ts";
import { ARCHITECTURE_AXES, SIMPLIFICATION_LAYERS } from "./axes.ts";
import {
  AUTO_LENS_PRIORITY,
  LENS_POLICIES,
  pickNextRotationItem,
  resolveRotationTarget,
  selectAutoLens,
} from "./lenses.ts";

const tracked = [
  "docs/guides/testing.md",
  "app/src/server/middleware.ts",
  "capabilities/reviews/business/src/server/service.ts",
  "capabilities/rounds/ai/src/tools.ts",
  "foundation/auth/src/index.ts",
  "foundation/dates/src/index.ts",
  "foundation/db/src/schema.ts",
  "interfaces/mcp/src/server.ts",
];

/** Resolves `count` consecutive rotation targets for `lens`, starting with no cursor. */
const rotate = (lens: ScoutLens, count: number): Array<string | null> => {
  const targets: Array<string | null> = [];
  let lastTarget: string | undefined;
  for (let index = 0; index < count; index += 1) {
    const { target } = resolveRotationTarget(lens, tracked, lastTarget);
    targets.push(target);
    lastTarget = target ?? undefined;
  }
  return targets;
};

describe("scout rotation", () => {
  test("starts at the first item without a cursor", () => {
    expect(pickNextRotationItem([], undefined)).toBeNull();
    expect(pickNextRotationItem(["axis-a", "axis-b", "axis-c"], undefined)).toBe("axis-a");
  });

  test("advances round-robin and wraps after the last item", () => {
    expect(pickNextRotationItem(["axis-a", "axis-b", "axis-c"], "axis-a")).toBe("axis-b");
    expect(pickNextRotationItem(["axis-a", "axis-b", "axis-c"], "axis-c")).toBe("axis-a");
  });

  test("restarts when the last target no longer exists", () => {
    expect(pickNextRotationItem(["axis-a", "axis-b", "axis-c"], "removed-axis")).toBe("axis-a");
  });

  test("visits every architecture axis in order and returns each axis with its target", () => {
    const ids = ARCHITECTURE_AXES.map((axis) => axis.id);
    expect(rotate("architecture", ids.length + 1)).toEqual([...ids, ids[0]]);
    const next = resolveRotationTarget("architecture", tracked, ids[0]);
    expect(next.axis?.id).toBe(next.target);
  });

  test("visits every simplification layer in order", () => {
    const ids = SIMPLIFICATION_LAYERS.map((layer) => layer.id);
    expect(rotate("simplification", ids.length)).toEqual(ids);
    expect(resolveRotationTarget("simplification", tracked, undefined).axis?.id).toBe(ids[0]);
  });

  test("rotates domain-scoped lenses over their own slices", () => {
    expect(rotate("security", 6)).toEqual([
      "app",
      "capabilities/reviews",
      "capabilities/rounds",
      "foundation/auth",
      "foundation/db",
      "interfaces/mcp",
    ]);
    expect(new Set(rotate("mcp-db", 6))).toEqual(
      new Set(["capabilities/reviews", "capabilities/rounds", "foundation/db", "interfaces/mcp"]),
    );
    expect(resolveRotationTarget("docs", tracked, undefined)).toEqual({
      target: "docs/guides",
      axis: null,
    });
    expect(resolveRotationTarget("tests", tracked, undefined).target).toBe("app");
  });

  test("gives verification-flakes no rotation target", () => {
    expect(resolveRotationTarget("verification-flakes", tracked, undefined)).toEqual({
      target: null,
      axis: null,
    });
  });
});

describe("automatic lens selection", () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = Date.UTC(2026, 10, 23, 8, 0, 0);

  const ago = (days: number) => ({ lastRunAt: new Date(nowMs - days * dayMs).toISOString() });

  test("ranks every lens once, from the highest-impact engineering lens", () => {
    expect(AUTO_LENS_PRIORITY).toEqual([
      "architecture",
      "simplification",
      "security",
      "mcp-db",
      "tests",
      "docs",
      "verification-flakes",
    ]);
    const priorities = SCOUT_LENSES.map((lens) => LENS_POLICIES[lens].priority);
    expect(new Set(priorities).size).toBe(SCOUT_LENSES.length);
  });

  test("bootstraps never-run lenses in priority order", () => {
    expect(selectAutoLens({ state: {}, nowMs })).toEqual({
      due: true,
      lens: "architecture",
      targetIntervalDays: LENS_POLICIES.architecture.intervalDays,
      lastRunAt: null,
    });
    expect(selectAutoLens({ state: { architecture: ago(0.5) }, nowMs })).toEqual({
      due: true,
      lens: "simplification",
      targetIntervalDays: LENS_POLICIES.simplification.intervalDays,
      lastRunAt: null,
    });
  });

  test("picks the lens with the highest overdue ratio once every lens has run", () => {
    // security: 4.5d / 3d = 1.50; architecture: 2.8d / 2d = 1.40; docs: 5d / 4d = 1.25.
    expect(
      selectAutoLens({
        state: {
          architecture: ago(2.8),
          simplification: ago(1),
          security: ago(4.5),
          "mcp-db": ago(2),
          tests: ago(2),
          docs: ago(5),
          "verification-flakes": ago(2),
        },
        nowMs,
      }),
    ).toMatchObject({ due: true, lens: "security", targetIntervalDays: 3 });
  });

  test("reports the soonest upcoming lens when every lens is fresh", () => {
    // architecture (2d target) has 0.5d (12h) remaining vs security (3d target) having 1d (24h) remaining.
    expect(
      selectAutoLens({
        state: {
          architecture: ago(1.5),
          simplification: ago(1),
          security: ago(2),
          "mcp-db": ago(1),
          tests: ago(1),
          docs: ago(1),
          "verification-flakes": ago(1),
        },
        nowMs,
      }),
    ).toEqual({ due: false, nextLens: "architecture", nextDueInHours: 12 });
  });

  test("ranks a future run timestamp by its full remaining interval", () => {
    // A future timestamp on architecture (due in 72h) ranks behind simplification (due in 48h).
    expect(
      selectAutoLens({
        state: {
          architecture: ago(-1),
          simplification: ago(0),
          security: ago(0),
          "mcp-db": ago(0),
          tests: ago(0),
          docs: ago(0),
          "verification-flakes": ago(0),
        },
        nowMs,
      }),
    ).toEqual({ due: false, nextLens: "simplification", nextDueInHours: 48 });
  });
});

describe("lens policies", () => {
  test("collect structural telemetry only for the architecture and simplification lenses", () => {
    expect(SCOUT_LENSES.filter((lens) => LENS_POLICIES[lens].telemetry)).toEqual([
      "architecture",
      "simplification",
    ]);
    expect(LENS_POLICIES.architecture.telemetry).toEqual({ capabilitySymmetry: true });
  });

  test("read verification records only for the verification-flakes lens", () => {
    expect(SCOUT_LENSES.filter((lens) => LENS_POLICIES[lens].readsVerifications)).toEqual([
      "verification-flakes",
    ]);
  });

  test("ask for extra telemetry only on the axes that inspect it", () => {
    expect(
      ARCHITECTURE_AXES.filter((axis) => axis.telemetry).map(({ id, telemetry }) => ({
        id,
        telemetry,
      })),
    ).toEqual([
      { id: "interface-transport-and-routing", telemetry: { entryWeights: true } },
      { id: "enforcement-ladder-and-verification-gaps", telemetry: { suppressionTopFiles: true } },
    ]);
  });
});
