import { SCOUT_LENSES, type ScoutLens } from "../proposal.ts";
import { ARCHITECTURE_AXES, type RotationAxis, SIMPLIFICATION_LAYERS } from "./axes.ts";
import {
  listDocAreas,
  listMcpDbSlices,
  listPackageSlices,
  listSecuritySlices,
} from "./repo-paths.ts";
import type { ScoutState } from "./state.ts";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const AUTO_LENS_PRIORITY: readonly ScoutLens[] = [
  "architecture",
  "simplification",
  "security",
  "mcp-db",
  "tests",
  "docs",
  "verification-flakes",
];

export const LENS_TARGET_INTERVAL_DAYS: Record<ScoutLens, number> = {
  architecture: 2,
  simplification: 2,
  security: 3,
  "mcp-db": 3,
  tests: 3,
  docs: 4,
  "verification-flakes": 5,
};

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

/** Picks the most overdue lens relative to its target cadence, or reports the next due lens when all are fresh. */
export const selectAutoLens = ({
  state,
  nowMs,
}: {
  state: ScoutState;
  nowMs: number;
}): AutoLensSelection => {
  let mostOverdue: {
    lens: ScoutLens;
    overdueRatio: number;
    targetIntervalDays: number;
    lastRunAt: string | null;
  } | null = null;
  let soonestUpcoming: { lens: ScoutLens; remainingMs: number } | null = null;

  for (const lens of AUTO_LENS_PRIORITY) {
    const targetIntervalDays = LENS_TARGET_INTERVAL_DAYS[lens];
    const targetMs = targetIntervalDays * MS_PER_DAY;
    const cursor = state[lens];
    const lastRunMs = cursor ? Date.parse(cursor.lastRunAt) : Number.NaN;

    if (!cursor || Number.isNaN(lastRunMs)) {
      return {
        due: true,
        lens,
        targetIntervalDays,
        lastRunAt: null,
      };
    }

    const ageMs = Math.max(0, nowMs - lastRunMs);
    const overdueRatio = ageMs / targetMs;
    if (overdueRatio >= 1 && (!mostOverdue || overdueRatio > mostOverdue.overdueRatio)) {
      mostOverdue = {
        lens,
        overdueRatio,
        targetIntervalDays,
        lastRunAt: cursor.lastRunAt,
      };
    }

    const remainingMs = Math.max(0, lastRunMs + targetMs - nowMs);
    if (!soonestUpcoming || remainingMs < soonestUpcoming.remainingMs) {
      soonestUpcoming = { lens, remainingMs };
    }
  }

  if (mostOverdue) {
    return {
      due: true,
      lens: mostOverdue.lens,
      targetIntervalDays: mostOverdue.targetIntervalDays,
      lastRunAt: mostOverdue.lastRunAt,
    };
  }

  const nextLens = soonestUpcoming?.lens ?? AUTO_LENS_PRIORITY[0] ?? SCOUT_LENSES[0];
  const nextDueInHours = Math.ceil((soonestUpcoming?.remainingMs ?? 0) / (60 * 60 * 1000));
  return {
    due: false,
    nextLens,
    nextDueInHours,
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

/** Selects the next deterministic rotation target for a lens using its persisted cursor. */
export const resolveRotationTarget = (
  lens: ScoutLens,
  trackedFiles: readonly string[],
  lastTarget: string | undefined,
): { target: string | null; axis: RotationAxis | null } => {
  if (lens === "verification-flakes") {
    return { target: null, axis: null };
  }
  if (lens === "architecture") {
    const target = pickNextRotationItem(
      ARCHITECTURE_AXES.map((axis) => axis.id),
      lastTarget,
    );
    const axis = ARCHITECTURE_AXES.find((entry) => entry.id === target) ?? null;
    return { target, axis };
  }
  if (lens === "simplification") {
    const target = pickNextRotationItem(
      SIMPLIFICATION_LAYERS.map((layer) => layer.id),
      lastTarget,
    );
    const axis = SIMPLIFICATION_LAYERS.find((entry) => entry.id === target) ?? null;
    return { target, axis };
  }
  if (lens === "docs") {
    return { target: pickNextRotationItem(listDocAreas(trackedFiles), lastTarget), axis: null };
  }
  if (lens === "security") {
    return {
      target: pickNextRotationItem(listSecuritySlices(trackedFiles), lastTarget),
      axis: null,
    };
  }
  if (lens === "mcp-db") {
    return { target: pickNextRotationItem(listMcpDbSlices(trackedFiles), lastTarget), axis: null };
  }
  return { target: pickNextRotationItem(listPackageSlices(trackedFiles), lastTarget), axis: null };
};
