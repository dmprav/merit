import type { AuditedTargetResult, ErroredTargetResult, FocusCheckResult } from "./results.ts";

/** A desktop route check that passed every audit with one focus stop. */
export const auditedRoute = (
  route: string,
  overrides: Partial<AuditedTargetResult> = {},
): AuditedTargetResult => ({
  kind: "route",
  target: route,
  name: route,
  url: `http://127.0.0.1:1${route}`,
  viewport: "desktop",
  status: "audited",
  passed: true,
  screenshot: null,
  viteErrorOverlayCount: 0,
  bodyVisible: true,
  dialogsVisible: true,
  enteringOrExitingCount: 0,
  scrollWidth: 100,
  innerWidth: 100,
  hasHorizontalOverflow: false,
  axeViolations: [],
  browserErrors: [],
  focus: { stopsChecked: 1, traversal: { complete: true }, failures: [] },
  ...overrides,
});

/** A desktop route check that failed before its audit. */
export const erroredRoute = (route: string, error: string): ErroredTargetResult => ({
  kind: "route",
  target: route,
  name: route,
  url: `http://127.0.0.1:1${route}`,
  viewport: "desktop",
  status: "errored",
  passed: false,
  screenshot: null,
  browserErrors: [],
  error,
});

export const focusFailure = (stopIndex: number): FocusCheckResult["failures"][number] => ({
  stopIndex,
  element: `button "Action ${stopIndex}"`,
  reasons: ["no visible focus indicator change compared to unfocused state"],
  boundingBox: { width: 80, height: 32 },
});
