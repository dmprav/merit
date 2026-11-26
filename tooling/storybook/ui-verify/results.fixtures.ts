import type { FocusCheckResult, TargetCheckResult } from "./results.ts";

/** A desktop route check that passed every audit with one focus stop. */
export const auditedRoute = (
  route: string,
  overrides: Partial<TargetCheckResult> = {},
): TargetCheckResult => ({
  kind: "route",
  target: route,
  name: route,
  url: `http://127.0.0.1:1${route}`,
  viewport: "desktop",
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
  focus: { stopsChecked: 1, reachedCap: false, failures: [] },
  ...overrides,
});

/** A desktop route check that failed before its audit, so its audit fields are placeholders. */
export const erroredRoute = (route: string, error: string): TargetCheckResult => ({
  kind: "route",
  target: route,
  name: route,
  url: `http://127.0.0.1:1${route}`,
  viewport: "desktop",
  passed: false,
  screenshot: null,
  viteErrorOverlayCount: 0,
  bodyVisible: false,
  dialogsVisible: false,
  enteringOrExitingCount: 0,
  scrollWidth: 0,
  innerWidth: 0,
  hasHorizontalOverflow: false,
  axeViolations: [],
  browserErrors: [],
  focus: { stopsChecked: 0, reachedCap: false, failures: [] },
  error,
});

export const focusFailure = (stopIndex: number): FocusCheckResult["failures"][number] => ({
  stopIndex,
  element: `button "Action ${stopIndex}"`,
  reasons: ["no visible focus indicator change compared to unfocused state"],
  boundingBox: { width: 80, height: 32 },
});
