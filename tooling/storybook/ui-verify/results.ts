import { z } from "zod";

import type { AppMode } from "./targets.ts";

const browserErrorSchema = z.object({
  type: z.enum(["pageerror", "console"]),
  message: z.string(),
  url: z.string(),
});

const axeViolationSchema = z.object({
  id: z.string(),
  impact: z.string().nullable(),
  help: z.string(),
  helpUrl: z.string(),
  nodes: z.array(
    z.object({
      target: z.array(z.string()),
      html: z.string(),
      failureSummary: z.string().optional(),
    }),
  ),
});

const focusStopFailureSchema = z.object({
  stopIndex: z.number().int().nonnegative(),
  element: z.string(),
  reasons: z.array(z.string()).min(1),
  boundingBox: z.object({
    width: z.number(),
    height: z.number(),
  }),
});

/**
 * Whether Tab traversal reached every stop. It stops short at the stop cap, when focus enters a
 * cross-origin frame whose controls cannot be inspected, or when the page replaces its document.
 */
const focusTraversalSchema = z.discriminatedUnion("complete", [
  z.object({ complete: z.literal(true) }),
  z.object({
    complete: z.literal(false),
    reason: z.enum(["cap", "opaqueFrame", "trackerLost", "siblingFocus"]),
  }),
]);

const focusCheckResultSchema = z.object({
  stopsChecked: z.number().int().nonnegative(),
  traversal: focusTraversalSchema,
  failures: z.array(focusStopFailureSchema),
});

const targetIdentity = {
  kind: z.enum(["story", "route"]),
  target: z.string(),
  name: z.string(),
  url: z.string(),
  /** The URL the check requested; `url` differs from it when the target redirected. */
  requestedUrl: z.string().optional(),
  viewport: z.enum(["desktop", "mobile"]),
};

const auditedTargetSchema = z.object({
  ...targetIdentity,
  status: z.literal("audited"),
  passed: z.boolean(),
  screenshot: z.string().nullable(),
  viteErrorOverlayCount: z.number().int().nonnegative(),
  bodyVisible: z.boolean(),
  dialogsVisible: z.boolean(),
  enteringOrExitingCount: z.number().int().nonnegative(),
  scrollWidth: z.number().int().nonnegative(),
  innerWidth: z.number().int().nonnegative(),
  hasHorizontalOverflow: z.boolean(),
  axeViolations: z.array(axeViolationSchema),
  browserErrors: z.array(browserErrorSchema),
  focus: focusCheckResultSchema,
});

/** A target that failed before its checks ran, so it has no audit or focus results. */
const erroredTargetSchema = z.object({
  ...targetIdentity,
  status: z.literal("errored"),
  passed: z.literal(false),
  /** A screenshot the target captured before it failed. */
  screenshot: z.string().nullable(),
  browserErrors: z.array(browserErrorSchema),
  error: z.string(),
});

const targetCheckResultSchema = z.discriminatedUnion("status", [
  auditedTargetSchema,
  erroredTargetSchema,
]);

const RESULTS_SCHEMA_VERSION = 2;

export const uiVerifyResultsSchema = z.object({
  version: z.literal(RESULTS_SCHEMA_VERSION),
  generatedAt: z.string().min(10),
  mode: z.enum(["storybook", "app", "mixed", "container"]),
  appMode: z.enum(["demo", "workspace"]).optional(),
  updated: z.boolean(),
  outDir: z.string().min(1),
  passed: z.boolean(),
  error: z.string().optional(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    axeViolations: z.number().int().nonnegative(),
    overflowFailures: z.number().int().nonnegative(),
    browserErrors: z.number().int().nonnegative(),
    focusFailures: z.number().int().nonnegative(),
  }),
  containerExitCode: z.number().int().optional(),
  targets: z.array(targetCheckResultSchema),
});

export type FocusStopFailure = z.infer<typeof focusStopFailureSchema>;

export type FocusTraversal = z.infer<typeof focusTraversalSchema>;

export type FocusCheckResult = z.infer<typeof focusCheckResultSchema>;

export type AuditedTargetResult = z.infer<typeof auditedTargetSchema>;

export type ErroredTargetResult = z.infer<typeof erroredTargetSchema>;

export type TargetCheckResult = z.infer<typeof targetCheckResultSchema>;

export type UiVerifyResults = z.infer<typeof uiVerifyResultsSchema>;

export type RunMode = UiVerifyResults["mode"];

const INCOMPLETE_TRAVERSAL_LABELS = {
  cap: (stopsChecked: number) => `Incomplete: >${stopsChecked} stops`,
  opaqueFrame: () =>
    "Incomplete: focus entered a cross-origin frame whose controls cannot be inspected",
  trackerLost: () => "Incomplete: the page navigated to a new document during focus traversal",
  siblingFocus: () =>
    "Incomplete: focus did not move to a sibling item, so the focused item could not be compared with an unfocused one",
} as const;

/** Why Tab traversal stopped short, or undefined when it reached every stop. */
export const describeIncompleteTraversal = (focus: FocusCheckResult): string | undefined =>
  focus.traversal.complete
    ? undefined
    : INCOMPLETE_TRAVERSAL_LABELS[focus.traversal.reason](focus.stopsChecked);

/**
 * The focus check's outcome: `OK` with the stops checked, or `FAIL` with the failed stops out of
 * those checked and why traversal stopped short.
 */
export const describeFocus = (
  focus: FocusCheckResult,
): { verdict: "OK" | "FAIL"; label: string } => {
  const incomplete = describeIncompleteTraversal(focus);
  const failedStops = focus.failures.length;
  if (failedStops === 0 && incomplete === undefined) {
    return { verdict: "OK", label: String(focus.stopsChecked) };
  }
  const counts = failedStops > 0 ? `${failedStops}/${focus.stopsChecked}` : undefined;
  return { verdict: "FAIL", label: [counts, incomplete].filter(Boolean).join("; ") };
};

/** Failed stops, plus one for a traversal that stopped short. */
const focusFailureCount = (focus: FocusCheckResult): number =>
  focus.failures.length + (focus.traversal.complete ? 0 : 1);

const summarizeTargets = (targets: readonly TargetCheckResult[]): UiVerifyResults["summary"] => {
  const audited = targets.filter((item) => item.status === "audited");
  const passed = targets.filter((item) => item.passed).length;
  return {
    total: targets.length,
    passed,
    failed: targets.length - passed,
    axeViolations: audited.reduce((sum, item) => sum + item.axeViolations.length, 0),
    overflowFailures: audited.filter((item) => item.hasHorizontalOverflow).length,
    browserErrors: targets.reduce((sum, item) => sum + item.browserErrors.length, 0),
    focusFailures: audited.reduce((sum, item) => sum + focusFailureCount(item.focus), 0),
  };
};

const runPassed = (
  mode: RunMode,
  summary: UiVerifyResults["summary"],
  containerExitCode: number | undefined,
): boolean =>
  mode === "container" ? containerExitCode === 0 : summary.failed === 0 && summary.total > 0;

export const summarizeResults = ({
  mode,
  appMode,
  updated,
  outDir,
  targets,
  containerExitCode,
  error,
  generatedAt = new Date().toISOString(),
}: {
  mode: RunMode;
  appMode?: AppMode;
  updated: boolean;
  outDir: string;
  targets: TargetCheckResult[];
  containerExitCode?: number;
  error?: string;
  generatedAt?: string;
}): UiVerifyResults => {
  const summary = summarizeTargets(targets);
  return uiVerifyResultsSchema.parse({
    version: RESULTS_SCHEMA_VERSION,
    generatedAt,
    mode,
    appMode,
    updated,
    outDir,
    passed: !error && runPassed(mode, summary, containerExitCode),
    ...(error ? { error } : {}),
    summary,
    containerExitCode,
    targets,
  });
};
