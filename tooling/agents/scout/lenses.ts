import { SCOUT_LENSES, type ScoutLens } from "../proposal.ts";
import { ARCHITECTURE_AXES, type RotationAxis, SIMPLIFICATION_LAYERS } from "./axes.ts";
import {
  listDocAreas,
  listMcpDbSlices,
  listPackageSlices,
  listSecuritySlices,
} from "./repo-paths.ts";
import type { ScoutState } from "./state.ts";

const MS_PER_HOUR = 60 * 60 * 1000;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** How a lens picks what to inspect next from its persisted rotation cursor. */
export type LensRotation =
  | { kind: "axes"; axes: readonly RotationAxis[] }
  | { kind: "slices"; list: (trackedFiles: readonly string[]) => string[] }
  | { kind: "none" };

/** Every rule that differs between lenses, so a new lens must declare each one. */
export type LensPolicy = {
  /** Days after a run before `--lens auto` treats the lens as due again. */
  intervalDays: number;
  /** Rank for bootstrapping never-run lenses and breaking overdue ties; 1 runs first. */
  priority: number;
  rotation: LensRotation;
  /** Collects structural fallow telemetry, optionally with per-capability layer counts. */
  telemetry: { capabilitySymmetry: boolean } | null;
  /** Lists verification records merged after the cursor's pull request. */
  readsVerifications: boolean;
};

export const LENS_POLICIES: Record<ScoutLens, LensPolicy> = {
  architecture: {
    intervalDays: 2,
    priority: 1,
    rotation: { kind: "axes", axes: ARCHITECTURE_AXES },
    telemetry: { capabilitySymmetry: true },
    readsVerifications: false,
  },
  simplification: {
    intervalDays: 2,
    priority: 2,
    rotation: { kind: "axes", axes: SIMPLIFICATION_LAYERS },
    telemetry: { capabilitySymmetry: false },
    readsVerifications: false,
  },
  security: {
    intervalDays: 3,
    priority: 3,
    rotation: { kind: "slices", list: listSecuritySlices },
    telemetry: null,
    readsVerifications: false,
  },
  "mcp-db": {
    intervalDays: 3,
    priority: 4,
    rotation: { kind: "slices", list: listMcpDbSlices },
    telemetry: null,
    readsVerifications: false,
  },
  tests: {
    intervalDays: 3,
    priority: 5,
    rotation: { kind: "slices", list: listPackageSlices },
    telemetry: null,
    readsVerifications: false,
  },
  docs: {
    intervalDays: 4,
    priority: 6,
    rotation: { kind: "slices", list: listDocAreas },
    telemetry: null,
    readsVerifications: false,
  },
  "verification-flakes": {
    intervalDays: 5,
    priority: 7,
    rotation: { kind: "none" },
    telemetry: null,
    readsVerifications: true,
  },
};

/** Lenses from the highest-impact engineering lens to the lowest. */
export const AUTO_LENS_PRIORITY: readonly ScoutLens[] = [...SCOUT_LENSES].sort(
  (a, b) => LENS_POLICIES[a].priority - LENS_POLICIES[b].priority,
);

export type AutoLensSelection =
  | {
      due: true;
      lens: ScoutLens;
      targetIntervalDays: number;
      lastRunAt: string | null;
    }
  | {
      due: false;
      nextLens: ScoutLens;
      nextDueInHours: number;
    };

type LensSchedule = {
  lens: ScoutLens;
  targetIntervalDays: number;
  lastRunAt: string;
  /** Time since the last run as a multiple of the target interval; due at 1 or more. */
  overdueRatio: number;
  remainingMs: number;
};

const scheduleLens = (lens: ScoutLens, lastRunAt: string, nowMs: number): LensSchedule => {
  const targetIntervalDays = LENS_POLICIES[lens].intervalDays;
  const targetMs = targetIntervalDays * MS_PER_DAY;
  const lastRunMs = Date.parse(lastRunAt);
  return {
    lens,
    targetIntervalDays,
    lastRunAt,
    overdueRatio: Math.max(0, nowMs - lastRunMs) / targetMs,
    remainingMs: Math.max(0, lastRunMs + targetMs - nowMs),
  };
};

/** Returns the earliest item no later item beats, so ties keep priority order. */
const firstBest = <T>(items: readonly T[], beats: (item: T, best: T) => boolean): T | undefined =>
  items.reduce<T | undefined>(
    (best, item) => (best === undefined || beats(item, best) ? item : best),
    undefined,
  );

/** Picks the most overdue lens relative to its target cadence, or reports the next due lens when all are fresh. */
export const selectAutoLens = ({
  state,
  nowMs,
}: {
  state: ScoutState;
  nowMs: number;
}): AutoLensSelection => {
  const neverRun = AUTO_LENS_PRIORITY.find((lens) => {
    const lastRunAt = state[lens]?.lastRunAt;
    return lastRunAt === undefined || Number.isNaN(Date.parse(lastRunAt));
  });
  if (neverRun) {
    const targetIntervalDays = LENS_POLICIES[neverRun].intervalDays;
    return { due: true, lens: neverRun, targetIntervalDays, lastRunAt: null };
  }

  const schedules = AUTO_LENS_PRIORITY.flatMap((lens) => {
    const cursor = state[lens];
    return cursor ? [scheduleLens(lens, cursor.lastRunAt, nowMs)] : [];
  });
  const mostOverdue = firstBest(
    schedules.filter((schedule) => schedule.overdueRatio >= 1),
    (item, best) => item.overdueRatio > best.overdueRatio,
  );
  if (mostOverdue) {
    const { lens, targetIntervalDays, lastRunAt } = mostOverdue;
    return { due: true, lens, targetIntervalDays, lastRunAt };
  }

  const soonest = firstBest(schedules, (item, best) => item.remainingMs < best.remainingMs);
  return {
    due: false,
    nextLens: soonest?.lens ?? AUTO_LENS_PRIORITY[0] ?? SCOUT_LENSES[0],
    nextDueInHours: Math.ceil((soonest?.remainingMs ?? 0) / MS_PER_HOUR),
  };
};

/** Advances strictly round-robin from the last persisted target so cadence never aliases or skips items. */
export const pickNextRotationItem = (
  items: readonly string[],
  lastTarget: string | undefined,
): string | null => {
  const unique = [...new Set(items)];
  if (unique.length === 0) {
    return null;
  }
  if (!lastTarget) {
    return unique[0] ?? null;
  }
  const index = unique.indexOf(lastTarget);
  if (index === -1) {
    return unique[0] ?? null;
  }
  return unique[(index + 1) % unique.length] ?? null;
};

export type RotationTarget = { target: string | null; axis: RotationAxis | null };

/** Selects the next deterministic rotation target for a lens using its persisted cursor. */
export const resolveRotationTarget = (
  lens: ScoutLens,
  trackedFiles: readonly string[],
  lastTarget: string | undefined,
): RotationTarget => {
  const { rotation } = LENS_POLICIES[lens];
  switch (rotation.kind) {
    case "none":
      return { target: null, axis: null };
    case "axes": {
      const target = pickNextRotationItem(
        rotation.axes.map((axis) => axis.id),
        lastTarget,
      );
      return { target, axis: rotation.axes.find((axis) => axis.id === target) ?? null };
    }
    case "slices":
      return { target: pickNextRotationItem(rotation.list(trackedFiles), lastTarget), axis: null };
  }
};
