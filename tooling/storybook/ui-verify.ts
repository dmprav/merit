import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { z } from "zod";

import {
  auditPage,
  collectBrowserErrors,
  settleAnimations,
  type BrowserError,
  type PageAuditResult,
} from "@merit/test-support/browser";
import { desktopViewport, mobileOptions } from "@merit/test-support/browser/config";
import { loadEnvLocalFiles } from "@merit/test-support/env";
import { createTestDatabase } from "@merit/test-support/test-database";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_OUT_DIR = ".tmp/ui-verify";
const MAX_TAB_STOPS = 40;
const SERVER_READY_TIMEOUT_MS = 120_000;
const STORYBOOK_READY_TIMEOUT_MS = 60_000;
const PROCESS_EXIT_GRACE_MS = 5_000;

export type AppMode = "demo" | "workspace";

export type ViewportOption = "desktop" | "mobile" | "both";

export type ViewportName = "desktop" | "mobile";

export type UiVerifyCliOptions = {
  stories: string[];
  routes: string[];
  mode?: AppMode;
  viewport: ViewportOption;
  update: boolean;
  container: boolean;
  outDir: string;
  json: boolean;
  help: boolean;
};

export type StoryTarget = {
  kind: "story";
  id: string;
  name: string;
  globals?: string;
  fullPage: boolean;
};

export type RouteTarget = {
  kind: "route";
  route: string;
  name: string;
  fullPage: boolean;
};

export type VerifyTarget = StoryTarget | RouteTarget;

export type StorybookIndexEntry = {
  id: string;
  title?: string;
  name?: string;
  type?: string;
};

export type ElementStyleSnapshot = {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  outlineOffset: string;
  boxShadow: string;
  borderTopColor: string;
  borderRightColor: string;
  borderBottomColor: string;
  borderLeftColor: string;
  borderTopWidth: string;
  borderRightWidth: string;
  borderBottomWidth: string;
  borderLeftWidth: string;
  backgroundColor: string;
  backgroundImage: string;
  textDecorationLine: string;
  textDecorationThickness: string;
  content?: string;
  opacity?: string;
};

export type FocusVisualSnapshot = {
  self: ElementStyleSnapshot;
  before?: ElementStyleSnapshot;
  after?: ElementStyleSnapshot;
  ancestors: ElementStyleSnapshot[];
  descendants: ElementStyleSnapshot[];
};

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

const focusCheckResultSchema = z.object({
  stopsChecked: z.number().int().nonnegative(),
  reachedCap: z.boolean(),
  incompleteReason: z.string().optional(),
  failures: z.array(focusStopFailureSchema),
});

const targetCheckResultSchema = z.object({
  kind: z.enum(["story", "route"]),
  target: z.string(),
  name: z.string(),
  url: z.string(),
  viewport: z.enum(["desktop", "mobile"]),
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
  error: z.string().optional(),
});

export const uiVerifyResultsSchema = z.object({
  version: z.literal(1),
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

export type FocusCheckResult = z.infer<typeof focusCheckResultSchema>;

export type TargetCheckResult = z.infer<typeof targetCheckResultSchema>;

export type UiVerifyResults = z.infer<typeof uiVerifyResultsSchema>;

/** Curated default sweep matching `tooling/storybook/tests/browser/visual.spec.ts`. */
export const DEFAULT_STORYBOOK_TARGETS: readonly StoryTarget[] = [
  {
    kind: "story",
    id: "design-language--focus-comparison",
    name: "focus-product",
    globals: "theme:product",
    fullPage: true,
  },
  {
    kind: "story",
    id: "design-language--focus-comparison",
    name: "focus-site",
    globals: "theme:site",
    fullPage: true,
  },
  {
    kind: "story",
    id: "components-button--overview",
    name: "components-button--overview",
    fullPage: true,
  },
  {
    kind: "story",
    id: "patterns-form-dialog--with-context",
    name: "patterns-form-dialog--with-context",
    fullPage: false,
  },
  {
    kind: "story",
    id: "patterns-confirmation-dialog--failure",
    name: "patterns-confirmation-dialog--failure",
    fullPage: true,
  },
  {
    kind: "story",
    id: "components-text-field--states",
    name: "components-text-field--states",
    fullPage: true,
  },
  {
    kind: "story",
    id: "components-data-table--default",
    name: "components-data-table--default",
    fullPage: true,
  },
  {
    kind: "story",
    id: "features-applications-recommendation--resume-editing",
    name: "features-applications-recommendation--resume-editing",
    fullPage: true,
  },
  {
    kind: "story",
    id: "patterns-application-shell--workspace-switcher",
    name: "patterns-application-shell--workspace-switcher",
    fullPage: true,
  },
  {
    kind: "story",
    id: "patterns-application-shell--workspace-switcher-long-name",
    name: "patterns-application-shell--workspace-switcher-long-name",
    fullPage: true,
  },
];

const VIEWPORT_ONLY_STORY_IDS = new Set(["patterns-form-dialog--with-context"]);

const USAGE = `Usage: vp run ui:verify [options]

Options:
  --story <pattern>            Filter Storybook story IDs (substring or glob; repeatable or comma-separated)
  --route <path>               Verify live app route(s) (e.g. /demo, /app/alder/rounds; repeatable or comma-separated)
  --mode demo|workspace        App server mode for --route (auto-inferred when omitted)
  --viewport desktop|mobile|both
                               Viewports to check (default: both)
  --update                     Refresh output artifacts (use --container --update to update Linux visual baselines)
  --container                  Delegate pixel-exact Linux visual baseline check/update to Docker Playwright
  --out <dir>                  Output directory for report.md, results.json, screenshots/ (default: .tmp/ui-verify)
  --json                       Print structured JSON summary to stdout
  -h, --help                   Show this help message`;

const splitCommaValues = (raw: string): string[] =>
  raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const readFlagValue = (
  args: readonly string[],
  index: number,
  flag: string,
): { value: string; nextIndex: number } => {
  const token = args[index] ?? "";
  const eqIndex = token.indexOf("=");
  if (eqIndex !== -1) {
    const value = token.slice(eqIndex + 1).trim();
    if (!value) {
      throw new Error(`${flag} requires a value.`);
    }
    return { value, nextIndex: index };
  }
  const next = args[index + 1];
  if (!next || next.startsWith("-")) {
    throw new Error(`${flag} requires a value.`);
  }
  return { value: next, nextIndex: index + 1 };
};

export const normalizeRoutePattern = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) {
    throw new Error(`Invalid route "${raw}". Routes must start with "/".`);
  }
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    throw new Error(`Invalid route "${raw}". Protocol-relative routes are not allowed.`);
  }
  if (
    Array.from(trimmed).some((ch) => {
      const code = ch.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new Error(`Invalid route "${raw}". Routes must not contain control characters.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed, "http://127.0.0.1");
  } catch {
    throw new Error(`Invalid route "${raw}". Could not parse as a URL path.`);
  }
  if (parsed.origin !== "http://127.0.0.1") {
    throw new Error(`Invalid route "${raw}". Routes must stay on the local origin.`);
  }
  return trimmed;
};

export const parseCliArgs = (rawArgs: readonly string[]): UiVerifyCliOptions => {
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : [...rawArgs];
  const stories: string[] = [];
  const routes: string[] = [];
  let mode: AppMode | undefined;
  let viewport: ViewportOption = "both";
  let update = false;
  let container = false;
  let outDir = DEFAULT_OUT_DIR;
  let json = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--story" || arg.startsWith("--story=")) {
      const { value, nextIndex } = readFlagValue(args, index, "--story");
      const parsedPatterns = splitCommaValues(value);
      if (parsedPatterns.length === 0) {
        throw new Error(`Invalid --story "${value}". Expected at least one non-empty pattern.`);
      }
      const regexPattern = parsedPatterns.find((pattern) => pattern.startsWith("/"));
      if (regexPattern) {
        throw new Error(
          `Invalid --story "${regexPattern}". Use a substring or glob (* and ?); /regex/ filters are not supported.`,
        );
      }
      stories.push(...parsedPatterns);
      index = nextIndex;
      continue;
    }
    if (arg === "--route" || arg.startsWith("--route=")) {
      const { value, nextIndex } = readFlagValue(args, index, "--route");
      const parsedRoutes = splitCommaValues(value);
      if (parsedRoutes.length === 0) {
        throw new Error(
          `Invalid --route "${value}". Expected at least one route starting with "/".`,
        );
      }
      for (const route of parsedRoutes) {
        routes.push(normalizeRoutePattern(route));
      }
      index = nextIndex;
      continue;
    }
    if (arg === "--mode" || arg.startsWith("--mode=")) {
      const { value, nextIndex } = readFlagValue(args, index, "--mode");
      if (value !== "demo" && value !== "workspace") {
        throw new Error(`Invalid --mode "${value}". Expected "demo" or "workspace".`);
      }
      mode = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--viewport" || arg.startsWith("--viewport=")) {
      const { value, nextIndex } = readFlagValue(args, index, "--viewport");
      if (value !== "desktop" && value !== "mobile" && value !== "both") {
        throw new Error(`Invalid --viewport "${value}". Expected "desktop", "mobile", or "both".`);
      }
      viewport = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--out" || arg.startsWith("--out=")) {
      const { value, nextIndex } = readFlagValue(args, index, "--out");
      outDir = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--update") {
      update = true;
      continue;
    }
    if (arg === "--container") {
      container = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unknown option "${arg}".\n${USAGE}`);
  }

  if (container && routes.length > 0) {
    throw new Error(
      "--container delegates Storybook visual baselines and cannot combine with --route.",
    );
  }

  return { stories, routes, mode, viewport, update, container, outDir, json, help };
};

export const inferAppMode = (routes: readonly string[], explicitMode?: AppMode): AppMode => {
  const normalizedRoutes = routes.map(normalizeRoutePattern);
  if (explicitMode) {
    return explicitMode;
  }
  const needsWorkspace = normalizedRoutes.some((route) => {
    const pathname = new URL(route, "http://127.0.0.1").pathname;
    return (
      pathname === "/app" ||
      pathname.startsWith("/app/") ||
      pathname === "/admin" ||
      pathname.startsWith("/admin/")
    );
  });
  return needsWorkspace ? "workspace" : "demo";
};

export const resolveViewports = (viewport: ViewportOption): ViewportName[] =>
  viewport === "both" ? ["desktop", "mobile"] : [viewport];

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compileStoryMatcher = (pattern: string): ((candidate: string) => boolean) => {
  if (pattern.includes("*") || pattern.includes("?")) {
    const regexBody = pattern
      .split("")
      .map((char) => (char === "*" ? ".*" : char === "?" ? "." : escapeRegex(char)))
      .join("");
    const regex = new RegExp(`^${regexBody}$`, "i");
    return (candidate) => regex.test(candidate);
  }
  const needle = pattern.toLowerCase();
  return (candidate) => candidate.toLowerCase().includes(needle);
};

export const filterStoryTargets = (
  patterns: readonly string[],
  indexEntries: readonly StorybookIndexEntry[],
  curatedTargets: readonly StoryTarget[] = DEFAULT_STORYBOOK_TARGETS,
): StoryTarget[] => {
  if (patterns.length === 0) {
    return [...curatedTargets];
  }

  const matchers = patterns.map(compileStoryMatcher);
  const selected: StoryTarget[] = [];
  const seenKeys = new Set<string>();

  for (const curated of curatedTargets) {
    const matchesCurated = matchers.some((match) => match(curated.name) || match(curated.id));
    if (matchesCurated) {
      const key = `${curated.id}|${curated.globals ?? ""}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        selected.push(curated);
      }
    }
  }

  for (const entry of indexEntries) {
    if (entry.type && entry.type !== "story") {
      continue;
    }
    const label = [entry.id, entry.title ?? "", entry.name ?? ""].join(" ");
    if (!matchers.some((match) => match(entry.id) || match(label))) {
      continue;
    }
    const key = `${entry.id}|`;
    const alreadyCoveredByCurated = [...seenKeys].some((existing) =>
      existing.startsWith(`${entry.id}|`),
    );
    if (alreadyCoveredByCurated) {
      continue;
    }
    seenKeys.add(key);
    selected.push({
      kind: "story",
      id: entry.id,
      name: entry.id,
      fullPage: !VIEWPORT_ONLY_STORY_IDS.has(entry.id),
    });
  }

  return selected;
};

export const sanitizeTargetName = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === "/") {
    return "route-root";
  }
  const prefix = trimmed.startsWith("/") ? "route-" : "";
  const sanitized = trimmed
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{3,}/g, "--")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${prefix}${sanitized || "target"}`;
};

export const buildUniqueTargetStems = (names: readonly string[]): string[] => {
  const baseStems = names.map((name) => sanitizeTargetName(name));
  const counts = new Map<string, number>();
  for (const stem of baseStems) {
    counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }

  const used = new Set<string>();
  return names.map((name, index) => {
    const base = baseStems[index] ?? "target";
    if ((counts.get(base) ?? 0) <= 1 && !used.has(base)) {
      used.add(base);
      return base;
    }
    const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
    let candidate = `${base}-${hash}`;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${hash}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
};

const CONTAINER_FOCUS_STORY_PATTERNS: Readonly<Record<string, string>> = {
  "focus-product": "control focus appearance in product",
  "focus-site": "control focus appearance in site",
  "design-language--focus-comparison": "control focus appearance in",
};

export const buildContainerDelegationArgs = (options: UiVerifyCliOptions): string[] => {
  if (options.routes.length > 0) {
    throw new Error(
      "--container delegates Storybook visual baselines and cannot combine with --route.",
    );
  }
  const args: string[] = [];
  if (options.update) {
    args.push("--update-snapshots");
  }
  if (options.viewport === "desktop") {
    args.push("--project", "desktop");
  } else if (options.viewport === "mobile") {
    args.push("--project", "mobile");
  }
  if (options.stories.length > 0) {
    const bodies = options.stories.flatMap((story) => {
      const mappedFocusPattern = CONTAINER_FOCUS_STORY_PATTERNS[story.toLowerCase()];
      if (mappedFocusPattern) {
        return [escapeRegex(mappedFocusPattern)];
      }
      // Curated aliases name host targets, not container test titles, so a substring or glob
      // that selects an alias on the host must also select that alias's container test.
      const matches = compileStoryMatcher(story);
      const aliasBodies = Object.entries(CONTAINER_FOCUS_STORY_PATTERNS)
        .filter(([alias]) => matches(alias))
        .map(([, aliasPattern]) => escapeRegex(aliasPattern));
      const storyBody = story
        .split("")
        .map((char) => (char === "*" ? ".*" : char === "?" ? "." : escapeRegex(char)))
        .join("");
      return [...aliasBodies, storyBody];
    });

    // Playwright CLI compiles a bare --grep pattern case-insensitively, so escaped
    // substrings and glob bodies can be joined into one alternation.
    const pattern = [...new Set(bodies)].join("|");
    args.push("--grep", pattern);
  }
  return args;
};

const isTransparentColor = (color: string): boolean => {
  const normalized = color.replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "transparent" ||
    /^#(?:[0-9a-f]{3}0|[0-9a-f]{6}00)$/.test(normalized) ||
    /^(?:rgba?|hsla?)\([^,)]+,[^,)]+,[^,)]+,(?:0+(?:\.0+)?|\.0+)%?\)$/.test(normalized) ||
    /^[a-z][a-z0-9-]*\([^)]+\/(?:0+(?:\.0+)?|\.0+)%?\)$/.test(normalized)
  );
};

const splitTopLevelCommas = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of value) {
    if (ch === "(") {
      depth += 1;
      current += ch;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
      current = "";
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    parts.push(trimmed);
  }
  return parts;
};

const SHADOW_COLOR_PATTERN = /\b[a-z][a-z0-9-]*\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/gi;

const isShadowLayerVisible = (layer: string): boolean => {
  const colorTokens = [...layer.matchAll(SHADOW_COLOR_PATTERN)].map((match) => match[0]);
  if (colorTokens.length > 0 && colorTokens.every(isTransparentColor)) {
    return false;
  }
  // A layer without offset, blur, or positive spread paints nothing outside (or inside, for
  // inset) the border box, whatever its color.
  const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = layer
    .replace(SHADOW_COLOR_PATTERN, " ")
    .split(/\s+/)
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value));
  return offsetX !== 0 || offsetY !== 0 || blur > 0 || spread > 0;
};

const hasVisibleBoxShadow = (boxShadow: string): boolean => {
  const trimmed = boxShadow.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return false;
  }
  return splitTopLevelCommas(trimmed).some(isShadowLayerVisible);
};

const hasVisibleOutline = (style: ElementStyleSnapshot): boolean =>
  style.outlineStyle !== "none" &&
  style.outlineStyle !== "" &&
  Number.parseFloat(style.outlineWidth) > 0 &&
  !isTransparentColor(style.outlineColor);

const hasVisibleBorder = (style: ElementStyleSnapshot): boolean =>
  (Number.parseFloat(style.borderTopWidth) > 0 && !isTransparentColor(style.borderTopColor)) ||
  (Number.parseFloat(style.borderRightWidth) > 0 && !isTransparentColor(style.borderRightColor)) ||
  (Number.parseFloat(style.borderBottomWidth) > 0 &&
    !isTransparentColor(style.borderBottomColor)) ||
  (Number.parseFloat(style.borderLeftWidth) > 0 && !isTransparentColor(style.borderLeftColor));

const hasVisibleBackground = (style: ElementStyleSnapshot): boolean =>
  (style.backgroundColor.trim() !== "" && !isTransparentColor(style.backgroundColor)) ||
  (style.backgroundImage.trim() !== "" && style.backgroundImage.trim().toLowerCase() !== "none");

const hasVisibleOpacity = (opacity: string | undefined): boolean => {
  if (opacity === undefined || opacity === "") {
    return true;
  }
  const parsed = Number.parseFloat(opacity);
  return Number.isFinite(parsed) && parsed > 0;
};

const hasVisiblePseudoPaint = (style: ElementStyleSnapshot): boolean =>
  hasVisibleOpacity(style.opacity) &&
  (hasVisibleOutline(style) ||
    hasVisibleBoxShadow(style.boxShadow) ||
    hasVisibleBorder(style) ||
    hasVisibleBackground(style));

const compareStyleSnapshots = (
  unfocused: ElementStyleSnapshot,
  focused: ElementStyleSnapshot,
  scope: string,
): string[] => {
  const isPseudo = scope.endsWith("::before") || scope.endsWith("::after");
  if (isPseudo && (focused.content === "none" || !hasVisibleOpacity(focused.opacity))) {
    return [];
  }

  const reasons: string[] = [];
  if (
    hasVisibleOutline(focused) &&
    (unfocused.outlineStyle !== focused.outlineStyle ||
      unfocused.outlineWidth !== focused.outlineWidth ||
      unfocused.outlineColor !== focused.outlineColor ||
      unfocused.outlineOffset !== focused.outlineOffset)
  ) {
    reasons.push(`${scope}:outline`);
  }
  if (focused.boxShadow !== unfocused.boxShadow && hasVisibleBoxShadow(focused.boxShadow)) {
    reasons.push(`${scope}:box-shadow`);
  }
  const borderChanged =
    unfocused.borderTopColor !== focused.borderTopColor ||
    unfocused.borderRightColor !== focused.borderRightColor ||
    unfocused.borderBottomColor !== focused.borderBottomColor ||
    unfocused.borderLeftColor !== focused.borderLeftColor ||
    unfocused.borderTopWidth !== focused.borderTopWidth ||
    unfocused.borderRightWidth !== focused.borderRightWidth ||
    unfocused.borderBottomWidth !== focused.borderBottomWidth ||
    unfocused.borderLeftWidth !== focused.borderLeftWidth;
  if (borderChanged && (!isPseudo || hasVisibleBorder(focused))) {
    reasons.push(`${scope}:border`);
  }
  if (
    (unfocused.backgroundColor !== focused.backgroundColor ||
      unfocused.backgroundImage !== focused.backgroundImage) &&
    (!isPseudo || hasVisibleBackground(focused))
  ) {
    reasons.push(`${scope}:background`);
  }
  if (
    unfocused.textDecorationLine !== focused.textDecorationLine ||
    unfocused.textDecorationThickness !== focused.textDecorationThickness
  ) {
    reasons.push(`${scope}:text-decoration`);
  }
  if (isPseudo) {
    if (
      focused.content !== undefined &&
      focused.content !== "none" &&
      (focused.content !== unfocused.content || focused.opacity !== unfocused.opacity) &&
      hasVisiblePseudoPaint(focused)
    ) {
      reasons.push(`${scope}:pseudo-indicator`);
    }
  }
  return reasons;
};

export const detectFocusVisualChange = (
  unfocused: FocusVisualSnapshot,
  focused: FocusVisualSnapshot,
): { changed: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  reasons.push(...compareStyleSnapshots(unfocused.self, focused.self, "self"));

  if (unfocused.before && focused.before) {
    reasons.push(...compareStyleSnapshots(unfocused.before, focused.before, "self::before"));
  }
  if (unfocused.after && focused.after) {
    reasons.push(...compareStyleSnapshots(unfocused.after, focused.after, "self::after"));
  }

  const ancestorCount = Math.min(unfocused.ancestors.length, focused.ancestors.length);
  for (let index = 0; index < ancestorCount; index += 1) {
    const beforeAncestor = unfocused.ancestors[index];
    const afterAncestor = focused.ancestors[index];
    if (beforeAncestor && afterAncestor) {
      reasons.push(...compareStyleSnapshots(beforeAncestor, afterAncestor, `ancestor[${index}]`));
    }
  }

  const descendantCount = Math.min(unfocused.descendants.length, focused.descendants.length);
  for (let index = 0; index < descendantCount; index += 1) {
    const beforeDesc = unfocused.descendants[index];
    const afterDesc = focused.descendants[index];
    if (beforeDesc && afterDesc) {
      reasons.push(...compareStyleSnapshots(beforeDesc, afterDesc, `descendant[${index}]`));
    }
  }

  return { changed: reasons.length > 0, reasons };
};

export const allocateFreePort = async (): Promise<number> =>
  new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen({ port: 0, host: "127.0.0.1" }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => rejectPort(new Error("Could not determine ephemeral port.")));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          rejectPort(closeError);
          return;
        }
        resolvePort(port);
      });
    });
  });

export type ManagedProcess = {
  child: ChildProcess;
  getLogs: () => string;
  getSpawnError: () => Error | undefined;
  hasAnnouncedUrl: () => boolean;
};

/**
 * Waits until the started child announces `announcedUrl` and that URL answers. The port is
 * released between allocation and the child's bind, so an HTTP response alone could come from a
 * foreign listener; Vite prints its local URL only after it binds the port itself.
 */
export const waitForHttpReady = async (
  url: string,
  timeoutMs: number,
  { child, getLogs, getSpawnError, hasAnnouncedUrl }: ManagedProcess,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  const assertChildAlive = () => {
    const spawnError = getSpawnError();
    if (spawnError) {
      throw new Error(
        `Server failed to start while waiting for ${url}: ${spawnError.message}\n${getLogs()}`,
      );
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      const detail = child.signalCode ? `signal ${child.signalCode}` : `code ${child.exitCode}`;
      throw new Error(`Server exited early with ${detail} while waiting for ${url}.\n${getLogs()}`);
    }
  };

  while (Date.now() < deadline) {
    assertChildAlive();
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    if (!hasAnnouncedUrl()) {
      lastError = "server has not announced its URL";
    } else {
      try {
        const response = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(remainingMs),
        });
        if (response.status >= 200 && response.status < 400) {
          assertChildAlive();
          return;
        }
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    const sleepMs = Math.min(250, Math.max(0, deadline - Date.now()));
    if (sleepMs > 0) {
      await delay(sleepMs);
    }
  }

  assertChildAlive();

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${url} (${lastError}).\n${getLogs()}`,
  );
};

const stopChildProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }

  const exitPromise = new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
  });

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      return;
    }
  }

  await Promise.race([exitPromise, delay(PROCESS_EXIT_GRACE_MS)]);

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already exited.
      }
    }
    await Promise.race([exitPromise, delay(1_000)]);
  }
};

type ManagedServer = {
  baseUrl: string;
  stop: () => Promise<void>;
};

export type RegisterCleanup = (cleanup: () => Promise<void>) => () => Promise<void>;

/**
 * Registers a resource's release before awaiting its acquisition, so a signal that drains the
 * cleanup stack mid-acquisition still waits for the resource and releases it. Rejects instead of
 * returning the resource when that shutdown began during acquisition.
 */
export const acquireWithCleanup = async <T>(
  acquisition: Promise<T>,
  release: (resource: T) => Promise<void>,
  registerCleanup: RegisterCleanup,
): Promise<{ resource: T; release: () => Promise<void> }> => {
  let releaseStarted = false;
  const releaseOnce = registerCleanup(async () => {
    releaseStarted = true;
    const resource = await acquisition.then(
      (value) => ({ value }),
      () => undefined,
    );
    if (resource) {
      await release(resource.value);
    }
  });
  const resource = await acquisition;
  if (releaseStarted) {
    throw new Error("Cleanup started while the resource was being acquired.");
  }
  return { resource, release: releaseOnce };
};

// Terminal color codes, which a forced-color environment can add to server output.
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export const spawnManagedProcess = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; announcedUrl: string },
): ManagedProcess => {
  const outputChunks: string[] = [];
  let spawnError: Error | undefined;
  let announced = false;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.on("error", (error) => {
    spawnError ??= error;
    outputChunks.push(`Spawn error: ${error.message}\n`);
  });

  const watch = (stream: NodeJS.ReadableStream | null) => {
    let tail = "";
    stream?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      outputChunks.push(text);
      if (outputChunks.length > 80) {
        outputChunks.shift();
      }
      tail = `${tail}${text.replace(ANSI_ESCAPE_PATTERN, "")}`.slice(-1024);
      if (tail.includes(options.announcedUrl)) {
        announced = true;
      }
    });
  };

  watch(child.stdout);
  watch(child.stderr);

  return {
    child,
    getLogs: () => outputChunks.join("").slice(-4000),
    getSpawnError: () => spawnError,
    hasAnnouncedUrl: () => announced,
  };
};

const runCommandAsync = async (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    label: string;
    registerCleanup: RegisterCleanup;
  },
): Promise<void> => {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stop = options.registerCleanup(() => stopChildProcess(child));

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk.toString("utf8"));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk.toString("utf8"));
  });

  try {
    await new Promise<void>((resolveRun, rejectRun) => {
      child.once("error", (error) => {
        rejectRun(new Error(`${options.label} failed to start: ${error.message}`));
      });
      child.once("exit", (code, signal) => {
        if (code === 0) {
          resolveRun();
          return;
        }
        const stderr = stderrChunks.join("").trim();
        const stdout = stdoutChunks.join("").trim();
        const detail = stderr || stdout;
        const reason = signal ? `terminated by ${signal}` : `exited with code ${code ?? "unknown"}`;
        rejectRun(new Error(`${options.label} failed (${reason}).${detail ? `\n${detail}` : ""}`));
      });
    });
  } finally {
    if (child.exitCode === null) {
      await stop().catch(() => undefined);
    }
  }
};

const buildStorybookIfNeeded = async (
  repoRoot: string,
  log: (line: string) => void,
  registerCleanup: RegisterCleanup,
): Promise<void> => {
  if (process.env.MERIT_STORYBOOK_PREBUILT === "1") {
    return;
  }
  log("Building static Storybook (cached via Vite Task)...");
  await runCommandAsync("vp", ["run", "@merit/storybook#build"], {
    cwd: repoRoot,
    label: "Storybook build",
    registerCleanup,
  });
};

const startStorybookServer = async (
  repoRoot: string,
  log: (line: string) => void,
  registerCleanup: RegisterCleanup,
): Promise<ManagedServer> => {
  const storybookDir = join(repoRoot, "tooling/storybook");
  const port = await allocateFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  log(`Starting isolated Storybook preview server on ${baseUrl}...`);
  const server = spawnManagedProcess(
    "vp",
    ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: storybookDir, announcedUrl: `${baseUrl}/` },
  );
  const stopServer = registerCleanup(() => stopChildProcess(server.child));

  try {
    await waitForHttpReady(`${baseUrl}/index.json`, STORYBOOK_READY_TIMEOUT_MS, server);
  } catch (error) {
    await stopServer();
    throw error;
  }

  return {
    baseUrl,
    stop: stopServer,
  };
};

const startAppServer = async (
  repoRoot: string,
  mode: AppMode,
  log: (line: string) => void,
  registerCleanup: RegisterCleanup,
): Promise<ManagedServer> => {
  loadEnvLocalFiles([join(repoRoot, "app/.env.local"), join(repoRoot, ".env.local")]);
  log(`Creating ephemeral test database for ${mode} mode...`);
  const { resource: database, release: disposeDatabase } = await acquireWithCleanup(
    createTestDatabase(),
    (created) => created.dispose(),
    registerCleanup,
  );

  let stopServer: (() => Promise<void>) | undefined;
  try {
    await database.migrate();
    if (mode === "workspace") {
      const dbEnv = { ...process.env, DATABASE_URL: database.connectionString };
      await runCommandAsync("vp", ["run", "@merit/app#db:seed"], {
        cwd: repoRoot,
        env: dbEnv,
        label: "Workspace seed",
        registerCleanup,
      });
    }
    const runtimeConnection = await database.createRuntimeConnection();
    const port = await allocateFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    log(`Starting isolated ${mode} app server on ${baseUrl}...`);

    const appArgs =
      mode === "workspace"
        ? [
            "dev",
            "--mode",
            "local-workspace",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--strictPort",
          ]
        : ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];

    const appEnv: NodeJS.ProcessEnv =
      mode === "workspace"
        ? {
            ...process.env,
            DATABASE_URL: runtimeConnection,
            MERIT_DEV_PORT: String(port),
            VITE_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZSQ=",
          }
        : {
            ...process.env,
            DATABASE_URL: runtimeConnection,
            MERIT_DEV_PORT: String(port),
            VITE_CLERK_PUBLISHABLE_KEY: "",
            CLERK_SECRET_KEY: "",
            CLERK_PUBLISHABLE_KEY: "",
          };

    const spawned = spawnManagedProcess("vp", appArgs, {
      cwd: join(repoRoot, "app"),
      env: appEnv,
      announcedUrl: `${baseUrl}/`,
    });
    const child = spawned.child;
    stopServer = registerCleanup(() => stopChildProcess(child));

    const readinessPath = mode === "workspace" ? "/app" : "/";
    await waitForHttpReady(`${baseUrl}${readinessPath}`, SERVER_READY_TIMEOUT_MS, spawned);

    const stop = stopServer;
    return {
      baseUrl,
      stop: async () => {
        await stop();
        await disposeDatabase();
      },
    };
  } catch (error) {
    if (stopServer) {
      await stopServer();
    }
    await disposeDatabase();
    throw error;
  }
};

type CapturedStop = {
  index: number;
  element: string;
  boundingBox: { width: number; height: number };
  focused: FocusVisualSnapshot;
  /** Captured after Tab moves on, so the next stop may have focus. */
  unfocused?: FocusVisualSnapshot;
  /** Captured once traversal ends and no element has focus. */
  cleanUnfocused?: FocusVisualSnapshot;
};

type MeritFocusTracker = {
  stops: Element[];
  captureSnapshot: (el: Element) => FocusVisualSnapshot;
  describeElement: (el: Element) => string;
  deepActiveElement: () => Element | null;
  isFocusable: (el: Element) => el is HTMLElement | SVGElement;
  isOpaqueFrame: (el: Element) => boolean;
  resetFocusToDocumentStart: () => void;
};

const OPAQUE_FRAME_INCOMPLETE_REASON =
  "Incomplete: focus entered a cross-origin frame whose controls cannot be inspected";

const isFocusTraversalIncomplete = (focus: FocusCheckResult): boolean =>
  focus.reachedCap || focus.incompleteReason !== undefined;

declare global {
  interface Window {
    __meritFocusTracker?: MeritFocusTracker;
  }
}

/**
 * Traverses Tab-reachable interactive elements via real keyboard Tab events and checks
 * bounding box visibility and focus indicator style changes against unfocused snapshots.
 */
export const checkKeyboardFocusTraversal = async (
  page: Page,
  maxStops = MAX_TAB_STOPS,
): Promise<FocusCheckResult> => {
  await page.evaluate(() => {
    const pickStyle = (style: CSSStyleDeclaration, pseudo = false): ElementStyleSnapshot => ({
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      boxShadow: style.boxShadow,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      textDecorationLine: style.textDecorationLine,
      textDecorationThickness: style.textDecorationThickness,
      ...(pseudo ? { content: style.content, opacity: style.opacity } : {}),
    });

    const isFrame = (el: Element): el is HTMLIFrameElement =>
      el.tagName === "IFRAME" || el.tagName === "FRAME";

    const frameDocument = (el: Element): Document | null => {
      try {
        return isFrame(el) ? el.contentDocument : null;
      } catch {
        return null;
      }
    };

    // Descends through shadow roots and same-origin frames, whose documents keep their own
    // active element while the outer document reports only the host or frame.
    const deepActiveElement = (): Element | null => {
      let current: Element | null = document.activeElement;
      while (current) {
        const shadowActive = current.shadowRoot?.activeElement;
        if (shadowActive) {
          current = shadowActive;
          continue;
        }
        const innerDocument = frameDocument(current);
        const frameActive = innerDocument?.activeElement;
        if (
          innerDocument &&
          frameActive &&
          frameActive !== innerDocument.body &&
          frameActive !== innerDocument.documentElement
        ) {
          current = frameActive;
          continue;
        }
        break;
      }
      return current;
    };

    const isOpaqueFrame = (el: Element): boolean => isFrame(el) && frameDocument(el) === null;

    // Frame content belongs to another realm, so check against that document's constructors.
    const isFocusable = (el: Element): el is HTMLElement | SVGElement => {
      const view = el.ownerDocument.defaultView;
      return Boolean(view && (el instanceof view.HTMLElement || el instanceof view.SVGElement));
    };

    const styleOf = (el: Element, pseudo?: string): CSSStyleDeclaration =>
      (el.ownerDocument.defaultView ?? window).getComputedStyle(el, pseudo);

    const captureSnapshot = (el: Element): FocusVisualSnapshot => {
      const ancestors: ElementStyleSnapshot[] = [];
      let parent = el.parentElement;
      for (
        let depth = 0;
        depth < 3 &&
        parent &&
        parent !== el.ownerDocument.body &&
        parent !== el.ownerDocument.documentElement;
        depth += 1
      ) {
        ancestors.push(pickStyle(styleOf(parent)));
        parent = parent.parentElement;
      }

      const descendants: ElementStyleSnapshot[] = [];
      const queue: Array<{ node: Element; depth: number }> = [];
      for (const child of Array.from(el.children)) {
        queue.push({ node: child, depth: 1 });
      }
      while (queue.length > 0 && descendants.length < 12) {
        const next = queue.shift();
        if (!next) {
          break;
        }
        descendants.push(pickStyle(styleOf(next.node)));
        if (next.depth < 2) {
          for (const child of Array.from(next.node.children)) {
            queue.push({ node: child, depth: next.depth + 1 });
          }
        }
      }

      return {
        self: pickStyle(styleOf(el)),
        before: pickStyle(styleOf(el, "::before"), true),
        after: pickStyle(styleOf(el, "::after"), true),
        ancestors,
        descendants,
      };
    };

    const describeElement = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const ariaLabel = el.getAttribute("aria-label");
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      const label = ariaLabel || text || el.getAttribute("placeholder") || el.id || "";
      const prefix = role ? `${tag}[role=${role}]` : tag;
      return label ? `${prefix} "${label}"` : prefix;
    };

    const resetFocusToDocumentStart = () => {
      const active = deepActiveElement();
      if (active && isFocusable(active)) {
        active.blur();
      }
      // Calling blur() alone leaves Chromium's sequential focus navigation starting point
      // at the blurred element; briefly focusing document.body resets Tab order to the top.
      if (document.body) {
        const previousBodyTabIndex = document.body.getAttribute("tabindex");
        document.body.setAttribute("tabindex", "-1");
        document.body.focus({ preventScroll: true });
        document.body.blur();
        if (previousBodyTabIndex === null) {
          document.body.removeAttribute("tabindex");
        } else {
          document.body.setAttribute("tabindex", previousBodyTabIndex);
        }
      }
    };

    window.__meritFocusTracker = {
      stops: [],
      captureSnapshot,
      describeElement,
      deepActiveElement,
      isFocusable,
      isOpaqueFrame,
      resetFocusToDocumentStart,
    };
  });

  const stops: CapturedStop[] = [];
  let reachedCap = false;
  let incompleteReason: string | undefined;

  // Reset focus to document top when the initially focused element is non-tabbable
  // (e.g. `<main tabindex="-1">`) or sits outside an open dialog, so Tab traversal
  // always inspects earlier controls from the start of the document.
  const initialState = await page.evaluate(() => {
    const tracker = window.__meritFocusTracker;
    if (!tracker) {
      return { resetFocus: false, initialStop: null };
    }
    const active = tracker.deepActiveElement();
    if (
      !active ||
      active === document.body ||
      active === document.documentElement ||
      !tracker.isFocusable(active)
    ) {
      return { resetFocus: false, initialStop: null };
    }
    const isInsideOpenDialog = Boolean(
      active.closest('[role="dialog"], [role="alertdialog"], dialog[open]'),
    );
    if (active.tabIndex < 0 || !isInsideOpenDialog) {
      tracker.resetFocusToDocumentStart();
      return { resetFocus: true, initialStop: null };
    }
    const rect = active.getBoundingClientRect();
    tracker.stops.push(active);
    return {
      resetFocus: false,
      initialStop: {
        index: 0,
        element: tracker.describeElement(active),
        boundingBox: { width: rect.width, height: rect.height },
        focused: tracker.captureSnapshot(active),
      },
    };
  });

  if (initialState.resetFocus) {
    await settleAnimations(page);
  }
  if (initialState.initialStop) {
    stops.push(initialState.initialStop);
  }

  for (let step = 0; step <= maxStops; step += 1) {
    const atCap = stops.length >= maxStops;
    await page.keyboard.press("Tab");
    await settleAnimations(page);

    const outcome = await page.evaluate(
      ({ previousIndex, isAtCap }: { previousIndex: number; isAtCap: boolean }) => {
        const tracker = window.__meritFocusTracker;
        if (!tracker) {
          return { done: true as const, reachedCap: false as const, previousUnfocused: undefined };
        }
        const active = tracker.deepActiveElement();
        const previousEl = previousIndex >= 0 ? tracker.stops[previousIndex] : undefined;
        let previousUnfocused: FocusVisualSnapshot | undefined;
        if (previousEl && previousEl !== active && previousEl.isConnected) {
          previousUnfocused = tracker.captureSnapshot(previousEl);
        }

        if (!active || active === document.body || active === document.documentElement) {
          return { done: true as const, reachedCap: false as const, previousUnfocused };
        }

        if (tracker.isOpaqueFrame(active)) {
          return {
            done: true as const,
            reachedCap: false as const,
            enteredOpaqueFrame: true,
            previousUnfocused,
          };
        }

        const existingIndex = tracker.stops.indexOf(active);
        if (existingIndex !== -1) {
          // Re-visiting index 0 after Tab gives us a genuine keyboard focus snapshot if it started autofocused.
          const refreshedFocused =
            existingIndex === 0 ? tracker.captureSnapshot(active) : undefined;
          return {
            done: true as const,
            reachedCap: false as const,
            cycledTo: existingIndex,
            refreshedFocused,
            previousUnfocused,
          };
        }

        if (isAtCap) {
          return { done: true as const, reachedCap: true as const, previousUnfocused };
        }

        const rect = active.getBoundingClientRect();
        const index = tracker.stops.length;
        tracker.stops.push(active);
        return {
          done: false as const,
          reachedCap: false as const,
          previousUnfocused,
          stop: {
            index,
            element: tracker.describeElement(active),
            boundingBox: { width: rect.width, height: rect.height },
            focused: tracker.captureSnapshot(active),
          },
        };
      },
      { previousIndex: stops.length - 1, isAtCap: atCap },
    );

    const lastStop = stops.at(-1);
    if (lastStop && outcome.previousUnfocused && !lastStop.unfocused) {
      lastStop.unfocused = outcome.previousUnfocused;
    }

    if (outcome.done) {
      if (outcome.reachedCap) {
        reachedCap = true;
      } else if ("enteredOpaqueFrame" in outcome) {
        incompleteReason = OPAQUE_FRAME_INCOMPLETE_REASON;
      } else if (outcome.cycledTo === 0 && outcome.refreshedFocused && stops[0]) {
        stops[0].focused = outcome.refreshedFocused;
      }
      break;
    }

    stops.push(outcome.stop);
  }

  // Capture unfocused baseline for the final stop if focus stayed on it.
  const finalStop = stops.at(-1);
  if (finalStop && !finalStop.unfocused) {
    await page.keyboard.press("Tab");
    await settleAnimations(page);
    const blurred = await page.evaluate((targetIndex: number) => {
      const tracker = window.__meritFocusTracker;
      const el = tracker?.stops[targetIndex];
      if (!tracker || !el || !el.isConnected) {
        return false;
      }
      if (tracker.deepActiveElement() === el && tracker.isFocusable(el)) {
        el.blur();
        return true;
      }
      return false;
    }, finalStop.index);
    if (blurred) {
      await settleAnimations(page);
    }
    const finalUnfocused = await page.evaluate((targetIndex: number) => {
      const tracker = window.__meritFocusTracker;
      const el = tracker?.stops[targetIndex];
      if (!tracker || !el || !el.isConnected) {
        return undefined;
      }
      return tracker.captureSnapshot(el);
    }, finalStop.index);
    if (finalUnfocused) {
      finalStop.unfocused = finalUnfocused;
    }
  }

  // A baseline captured after Tab can carry the next stop's focus styles, such as
  // `button:has(+ button:focus-visible)`, so also compare each stop with nothing focused.
  // Skip this when the page moves focus back, as modal focus containment does.
  if (stops.length > 0) {
    await page.evaluate(() => window.__meritFocusTracker?.resetFocusToDocumentStart());
    await settleAnimations(page);
    const cleanBaselines = await page.evaluate(() => {
      const tracker = window.__meritFocusTracker;
      const active = tracker?.deepActiveElement();
      if (!tracker || (active && active !== document.body && active !== document.documentElement)) {
        return null;
      }
      return tracker.stops.map((el) => (el.isConnected ? tracker.captureSnapshot(el) : null));
    });
    for (const stop of stops) {
      const baseline = cleanBaselines?.[stop.index];
      if (baseline) {
        stop.cleanUnfocused = baseline;
      }
    }
  }

  const failures: FocusStopFailure[] = [];
  for (const stop of stops) {
    const reasons: string[] = [];
    if (stop.boundingBox.width <= 0 || stop.boundingBox.height <= 0) {
      reasons.push(
        `zero-sized bounding box (${stop.boundingBox.width}x${stop.boundingBox.height})`,
      );
    }
    const baselines = [stop.unfocused, stop.cleanUnfocused].filter(
      (baseline): baseline is FocusVisualSnapshot => baseline !== undefined,
    );
    if (baselines.length > 0) {
      if (baselines.some((baseline) => !detectFocusVisualChange(baseline, stop.focused).changed)) {
        reasons.push("no visible focus indicator change compared to unfocused state");
      }
    } else if (
      !hasVisibleOutline(stop.focused.self) &&
      !hasVisibleBoxShadow(stop.focused.self.boxShadow)
    ) {
      reasons.push("no visible focus indicator detected");
    }

    if (reasons.length > 0) {
      failures.push({
        stopIndex: stop.index,
        element: stop.element,
        reasons,
        boundingBox: stop.boundingBox,
      });
    }
  }

  return {
    stopsChecked: stops.length,
    reachedCap,
    ...(reachedCap
      ? { incompleteReason: `Incomplete: >${stops.length} stops` }
      : incompleteReason
        ? { incompleteReason }
        : {}),
    failures,
  };
};

export const verifyLoadedPage = async ({
  page,
  browserErrors,
  kind,
  target,
  name,
  url,
  viewport,
  fullPage,
  screenshotPath,
  maxTabStops = MAX_TAB_STOPS,
}: {
  page: Page;
  browserErrors: BrowserError[];
  kind: "story" | "route";
  target: string;
  name: string;
  url: string;
  viewport: ViewportName;
  fullPage: boolean;
  screenshotPath: string | null;
  maxTabStops?: number;
}): Promise<TargetCheckResult> => {
  // Capture once the page settles but before measuring: disabling animations fast-forwards them
  // and can fire end handlers that change layout, so the verdict must describe the screenshot.
  const audit: PageAuditResult = await auditPage(page, undefined, {
    beforeMeasure: async () => {
      if (!screenshotPath) {
        return;
      }
      mkdirSync(dirname(screenshotPath), { recursive: true });
      if (fullPage) {
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await page.screenshot({
        path: screenshotPath,
        fullPage,
        animations: "disabled",
      });
    },
  });

  const focus = await checkKeyboardFocusTraversal(page, maxTabStops);
  const errorsCopy = [...browserErrors];

  const passed =
    audit.viteErrorOverlayCount === 0 &&
    audit.bodyVisible &&
    audit.dialogsVisible &&
    audit.enteringOrExitingCount === 0 &&
    !audit.hasHorizontalOverflow &&
    audit.axeViolations.length === 0 &&
    errorsCopy.length === 0 &&
    focus.failures.length === 0 &&
    !isFocusTraversalIncomplete(focus);

  return {
    kind,
    target,
    name,
    url,
    viewport,
    passed,
    screenshot: screenshotPath,
    viteErrorOverlayCount: audit.viteErrorOverlayCount,
    bodyVisible: audit.bodyVisible,
    dialogsVisible: audit.dialogsVisible,
    enteringOrExitingCount: audit.enteringOrExitingCount,
    scrollWidth: audit.scrollWidth,
    innerWidth: audit.innerWidth,
    hasHorizontalOverflow: audit.hasHorizontalOverflow,
    axeViolations: audit.axeViolations,
    browserErrors: errorsCopy,
    focus,
  };
};

const resolveTargetUrl = (target: VerifyTarget, baseUrl: string): string => {
  if (target.kind === "story") {
    const globalsQuery = target.globals ? `&globals=${encodeURIComponent(target.globals)}` : "";
    return `${baseUrl}/iframe.html?id=${encodeURIComponent(target.id)}&viewMode=story${globalsQuery}`;
  }
  return `${baseUrl}${target.route}`;
};

export const openTargetOnPage = async (
  page: Page,
  target: VerifyTarget,
  baseUrl: string,
  { routeReadyTimeoutMs = 20_000 }: { routeReadyTimeoutMs?: number } = {},
): Promise<string> => {
  const url = resolveTargetUrl(target, baseUrl);
  if (target.kind === "story") {
    const response = await page.goto(url, { waitUntil: "load" });
    if (response && response.status() >= 400) {
      throw new Error(`Story "${target.id}" returned HTTP ${response.status()} at ${url}.`);
    }
    await page.waitForFunction(
      () => {
        const status = document.querySelector("#storybook-root")?.getAttribute("data-story-ready");
        return status === "true" || status === "error";
      },
      undefined,
      { timeout: 30_000 },
    );
    const storyReadyState = await page.evaluate(() => {
      const root = document.querySelector("#storybook-root");
      return {
        status: root?.getAttribute("data-story-ready") ?? null,
        error: root?.getAttribute("data-story-error") ?? null,
      };
    });
    if (storyReadyState.status === "error") {
      const detail = storyReadyState.error?.trim() || 'Storybook reported data-story-ready="error"';
      throw new Error(`Story "${target.id}" failed to become ready: ${detail}`);
    }
    return url;
  }

  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (response && response.status() >= 400) {
    throw new Error(`Route "${target.route}" returned HTTP ${response.status()} at ${url}.`);
  }
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  try {
    await page.waitForFunction(
      () => Boolean(document.body && document.body.innerText.trim().length > 0),
      undefined,
      { timeout: routeReadyTimeoutMs },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Route "${target.route}" did not render non-empty content within ${routeReadyTimeoutMs}ms at ${url}: ${detail}`,
    );
  }
  return url;
};

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
  mode: UiVerifyResults["mode"];
  appMode?: AppMode;
  updated: boolean;
  outDir: string;
  targets: TargetCheckResult[];
  containerExitCode?: number;
  error?: string;
  generatedAt?: string;
}): UiVerifyResults => {
  const passedCount = targets.filter((item) => item.passed).length;
  const failedCount = targets.length - passedCount;
  const axeViolations = targets.reduce((sum, item) => sum + item.axeViolations.length, 0);
  const overflowFailures = targets.filter((item) => item.hasHorizontalOverflow).length;
  const browserErrors = targets.reduce((sum, item) => sum + item.browserErrors.length, 0);
  const focusFailures = targets.reduce(
    (sum, item) =>
      sum + item.focus.failures.length + (isFocusTraversalIncomplete(item.focus) ? 1 : 0),
    0,
  );

  const passed = error
    ? false
    : mode === "container"
      ? containerExitCode === 0
      : failedCount === 0 && targets.length > 0;

  return uiVerifyResultsSchema.parse({
    version: 1,
    generatedAt,
    mode,
    appMode,
    updated,
    outDir,
    passed,
    ...(error ? { error } : {}),
    summary: {
      total: targets.length,
      passed: passedCount,
      failed: failedCount,
      axeViolations,
      overflowFailures,
      browserErrors,
      focusFailures,
    },
    containerExitCode,
    targets,
  });
};

export const formatMarkdownReport = (results: UiVerifyResults): string => {
  const lines: string[] = [
    "# UI Verification Report",
    "",
    `- **Status:** ${results.passed ? "PASS" : "FAIL"}`,
    `- **Mode:** \`${results.mode}\`${results.appMode ? ` (\`${results.appMode}\`)` : ""}`,
    `- **Generated:** ${results.generatedAt}`,
    `- **Output:** \`${results.outDir}\``,
    `- **Updated:** ${results.updated ? "yes" : "no"}`,
    "",
  ];

  if (results.error) {
    lines.push("## Error", "", results.error, "");
  }

  if (results.mode === "container") {
    lines.push(
      `Delegated pixel-exact Linux visual baseline check to \`tooling/storybook/run-visual-container.ts\` (exit code: \`${results.containerExitCode ?? 1}\`).`,
      "",
    );
    return lines.join("\n");
  }

  lines.push(
    "## Summary",
    "",
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Targets checked | ${results.summary.total} |`,
    `| Passed | ${results.summary.passed} |`,
    `| Failed | ${results.summary.failed} |`,
    `| Axe WCAG violations | ${results.summary.axeViolations} |`,
    `| Overflow failures | ${results.summary.overflowFailures} |`,
    `| Console / page errors | ${results.summary.browserErrors} |`,
    `| Focus indicator failures | ${results.summary.focusFailures} |`,
    "",
    "## Targets",
    "",
    "| Target | Viewport | Status | Axe | Overflow | Errors | Focus | Screenshot |",
    "| --- | --- | --- | ---: | --- | ---: | --- | --- |",
  );

  for (const item of results.targets) {
    const status = item.passed ? "PASS" : "FAIL";
    const overflow = item.hasHorizontalOverflow
      ? `FAIL (${item.scrollWidth}>${item.innerWidth})`
      : "OK";
    const incompleteLabel =
      item.focus.incompleteReason ?? `Incomplete: >${item.focus.stopsChecked} stops`;
    const incomplete = isFocusTraversalIncomplete(item.focus);
    const focusCell =
      item.focus.failures.length > 0 && incomplete
        ? `FAIL (${item.focus.failures.length}/${item.focus.stopsChecked}; ${incompleteLabel})`
        : item.focus.failures.length > 0
          ? `FAIL (${item.focus.failures.length}/${item.focus.stopsChecked})`
          : incomplete
            ? `FAIL (${incompleteLabel})`
            : `OK (${item.focus.stopsChecked})`;
    const screenshotCell = item.screenshot
      ? `\`${relative(results.outDir, item.screenshot).replaceAll("\\", "/")}\``
      : "—";
    lines.push(
      `| \`${item.name.replaceAll("|", "\\|")}\` | ${item.viewport} | ${status} | ${item.axeViolations.length} | ${overflow} | ${item.browserErrors.length} | ${focusCell} | ${screenshotCell} |`,
    );
  }

  const failedTargets = results.targets.filter((item) => !item.passed);
  if (failedTargets.length > 0) {
    lines.push("", "## Failures", "");
    for (const item of failedTargets) {
      lines.push(`### \`${item.name}\` (${item.viewport})`, "");
      if (item.error) {
        lines.push(`- **Runtime error:** ${item.error}`);
      }
      if (item.viteErrorOverlayCount > 0) {
        lines.push(`- **Vite error overlay:** ${item.viteErrorOverlayCount} detected`);
      }
      if (!item.bodyVisible) {
        lines.push("- **Body visibility:** document body was not visible");
      }
      if (!item.dialogsVisible) {
        lines.push("- **Dialog visibility:** an open dialog remained transparent");
      }
      if (item.enteringOrExitingCount > 0) {
        lines.push(
          `- **Unsettled transitions:** ${item.enteringOrExitingCount} element(s) still marked entering/exiting`,
        );
      }
      if (item.hasHorizontalOverflow) {
        lines.push(
          `- **Horizontal overflow:** \`scrollWidth=${item.scrollWidth}\` > \`innerWidth=${item.innerWidth}\``,
        );
      }
      for (const violation of item.axeViolations) {
        const targets = violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(" "))
          .join(", ");
        lines.push(
          `- **Axe [${violation.impact ?? "unknown"}] \`${violation.id}\`:** ${violation.help}${targets ? ` (${targets})` : ""}`,
        );
      }
      for (const err of item.browserErrors) {
        lines.push(`- **Browser ${err.type}:** ${err.message}`);
      }
      if (item.focus.reachedCap) {
        const incompleteLabel =
          item.focus.incompleteReason ?? `Incomplete: >${item.focus.stopsChecked} stops`;
        lines.push(
          `- **Focus traversal incomplete:** ${incompleteLabel} (keyboard focus traversal hit the ${item.focus.stopsChecked}-stop cap before completing)`,
        );
      } else if (item.focus.incompleteReason) {
        lines.push(`- **Focus traversal incomplete:** ${item.focus.incompleteReason}`);
      }
      for (const focusFail of item.focus.failures) {
        lines.push(
          `- **Focus stop #${focusFail.stopIndex} (${focusFail.element}):** ${focusFail.reasons.join("; ")}`,
        );
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
};

export const writeProofArtifacts = (outDir: string, results: UiVerifyResults): void => {
  mkdirSync(outDir, { recursive: true });
  const validated = uiVerifyResultsSchema.parse(results);
  writeFileSync(join(outDir, "results.json"), `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "report.md"), formatMarkdownReport(validated), "utf8");
};

const storybookIndexSchema = z.object({
  entries: z
    .record(
      z.string(),
      z.object({
        id: z.string(),
        title: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
  stories: z
    .record(
      z.string(),
      z.object({
        id: z.string(),
        title: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
});

const OUTPUT_LOCK_FILE = ".ui-verify.lock";

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

/**
 * Gives this run exclusive use of `outDir` until the returned release runs, so concurrent runs
 * cannot delete or replace each other's screenshots before their reports are published. A lock
 * whose owning process has exited is taken over.
 */
export const acquireOutputLock = (outDir: string): (() => void) => {
  mkdirSync(outDir, { recursive: true });
  const lockPath = join(outDir, OUTPUT_LOCK_FILE);
  const owner = String(process.pid);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(lockPath, `${owner}\n`, { encoding: "utf8", flag: "wx" });
      return () => {
        if (existsSync(lockPath) && readFileSync(lockPath, "utf8").trim() === owner) {
          rmSync(lockPath, { force: true });
        }
      };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
    }
    const ownerPid = Number.parseInt(readFileSync(lockPath, "utf8"), 10);
    if (Number.isInteger(ownerPid) && ownerPid > 0 && isProcessAlive(ownerPid)) {
      throw new Error(
        `Another ui:verify run (pid ${ownerPid}) is writing to "${outDir}". Wait for it to finish or pass a different --out directory.`,
      );
    }
    rmSync(lockPath, { force: true });
  }
  throw new Error(`Could not lock "${outDir}" for ui:verify output.`);
};

const screenshotFileFor = (screenshotsDir: string, stem: string, viewport: ViewportName) =>
  join(screenshotsDir, `${stem}-${viewport}.png`);

const readStorybookIndex = (repoRoot: string): StorybookIndexEntry[] => {
  const indexPath = join(repoRoot, "tooling/storybook/dist/index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`Storybook index not found at "${indexPath}". Build Storybook first.`);
  }
  const parsed = storybookIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  return Object.values(parsed.entries ?? parsed.stories ?? {});
};

export const runTargetsInBrowser = async ({
  browser,
  targets,
  baseUrl,
  viewports,
  screenshotsDir,
  screenshotStems,
  maxTabStops,
  routeReadyTimeoutMs,
  log,
}: {
  browser: Browser;
  targets: readonly VerifyTarget[];
  baseUrl: string;
  viewports: readonly ViewportName[];
  screenshotsDir: string;
  screenshotStems?: readonly string[];
  maxTabStops?: number;
  routeReadyTimeoutMs?: number;
  log: (line: string) => void;
}): Promise<TargetCheckResult[]> => {
  const results: TargetCheckResult[] = [];
  const stems = screenshotStems ?? buildUniqueTargetStems(targets.map((target) => target.name));

  for (const viewport of viewports) {
    const contextOptions =
      viewport === "desktop"
        ? { viewport: desktopViewport }
        : {
            viewport: mobileOptions.viewport,
            isMobile: mobileOptions.isMobile,
            hasTouch: mobileOptions.hasTouch,
          };

    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex];
      if (!target) {
        continue;
      }
      let context: BrowserContext | undefined;
      const browserErrors: BrowserError[] = [];
      const stem = stems[targetIndex] ?? sanitizeTargetName(target.name);
      const screenshotFile = screenshotFileFor(screenshotsDir, stem, viewport);
      const targetId = target.kind === "story" ? target.id : target.route;
      let resolvedUrl = resolveTargetUrl(target, baseUrl);
      let screenshotCleaned = false;

      try {
        rmSync(screenshotFile, { force: true });
        screenshotCleaned = true;
        context = await browser.newContext(contextOptions);
        collectBrowserErrors(context, browserErrors);
        const page = await context.newPage();
        resolvedUrl = await openTargetOnPage(page, target, baseUrl, { routeReadyTimeoutMs });
        const checked = await verifyLoadedPage({
          page,
          browserErrors,
          kind: target.kind,
          target: targetId,
          name: target.name,
          url: resolvedUrl,
          viewport,
          fullPage: target.fullPage,
          screenshotPath: screenshotFile,
          maxTabStops,
        });
        results.push(checked);
        const focusSummary = isFocusTraversalIncomplete(checked.focus)
          ? `${checked.focus.failures.length}/${checked.focus.stopsChecked} (${checked.focus.incompleteReason ?? `Incomplete: >${checked.focus.stopsChecked} stops`})`
          : `${checked.focus.failures.length}/${checked.focus.stopsChecked}`;
        log(
          `${checked.passed ? "PASS" : "FAIL"} [${viewport}] ${target.name} (axe:${checked.axeViolations.length} overflow:${checked.hasHorizontalOverflow ? "yes" : "no"} errors:${checked.browserErrors.length} focus:${focusSummary})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          kind: target.kind,
          target: targetId,
          name: target.name,
          url: resolvedUrl,
          viewport,
          passed: false,
          screenshot: screenshotCleaned && existsSync(screenshotFile) ? screenshotFile : null,
          viteErrorOverlayCount: 0,
          bodyVisible: false,
          dialogsVisible: false,
          enteringOrExitingCount: 0,
          scrollWidth: 0,
          innerWidth: 0,
          hasHorizontalOverflow: false,
          axeViolations: [],
          browserErrors,
          focus: { stopsChecked: 0, reachedCap: false, failures: [] },
          error: message,
        });
        log(`FAIL [${viewport}] ${target.name}: ${message}`);
      } finally {
        if (context) {
          await context.close().catch(() => undefined);
        }
      }
    }
  }

  return results;
};

export const runUiVerify = async (
  options: UiVerifyCliOptions,
  {
    repoRoot = REPO_ROOT,
    runContainer = (containerArgs: readonly string[]) =>
      spawnSync(
        "vpx",
        [join(repoRoot, "tooling/storybook/run-visual-container.ts"), ...containerArgs],
        {
          cwd: repoRoot,
          stdio: options.json ? ["inherit", process.stderr, "inherit"] : "inherit",
        },
      ).status ?? 1,
    log = (line: string) => {
      if (options.json) {
        process.stderr.write(`${line}\n`);
      } else {
        process.stdout.write(`${line}\n`);
      }
    },
  }: {
    repoRoot?: string;
    runContainer?: (args: readonly string[]) => number;
    log?: (line: string) => void;
  } = {},
): Promise<UiVerifyResults> => {
  const outDir = resolve(repoRoot, options.outDir);
  const screenshotsDir = join(outDir, "screenshots");
  const releaseOutput = acquireOutputLock(outDir);

  if (options.container) {
    try {
      const containerArgs = buildContainerDelegationArgs(options);
      log(`Delegating to visual container: run-visual-container.ts ${containerArgs.join(" ")}`);
      const exitCode = runContainer(containerArgs);
      const results = summarizeResults({
        mode: "container",
        updated: options.update,
        outDir,
        targets: [],
        containerExitCode: exitCode,
      });
      writeProofArtifacts(outDir, results);
      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`FAIL: ${message}`);
      const results = summarizeResults({
        mode: "container",
        updated: options.update,
        outDir,
        targets: [],
        containerExitCode: 1,
        error: message,
      });
      writeProofArtifacts(outDir, results);
      return results;
    } finally {
      releaseOutput();
    }
  }

  const runStorybook = options.stories.length > 0 || options.routes.length === 0;
  const runApp = options.routes.length > 0;
  const mode: UiVerifyResults["mode"] =
    runStorybook && runApp ? "mixed" : runApp ? "app" : "storybook";
  const viewports = resolveViewports(options.viewport);
  let appMode: AppMode | undefined;

  const cleanups: Array<() => Promise<void>> = [];
  let cleaningUp = false;
  let cleanupPromise: Promise<void> | undefined;

  const registerCleanup: RegisterCleanup = (cleanup) => {
    let pending: Promise<void> | undefined;

    const idempotent = () => {
      pending ??= cleanup();
      return pending;
    };

    if (cleaningUp) {
      void idempotent().catch(() => undefined);
      return idempotent;
    }
    cleanups.push(idempotent);
    return idempotent;
  };

  // Registered first so it runs last, after the report is written or servers are stopped.
  registerCleanup(async () => releaseOutput());

  const runCleanups = (): Promise<void> => {
    if (cleanupPromise) {
      return cleanupPromise;
    }
    cleaningUp = true;
    cleanupPromise = (async () => {
      while (cleanups.length > 0) {
        const cleanup = cleanups.pop();
        if (cleanup) {
          await cleanup().catch(() => undefined);
        }
      }
    })();
    return cleanupPromise;
  };

  const onSignal = (signal: NodeJS.Signals) => {
    log(`Received ${signal}; tearing down isolated ui:verify servers...`);
    void runCleanups().finally(() => {
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  };

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const targetResults: TargetCheckResult[] = [];
  let browser: Browser | undefined;

  try {
    const normalizedRoutes = options.routes.map(normalizeRoutePattern);
    appMode = runApp ? inferAppMode(normalizedRoutes, options.mode) : undefined;

    let storybookServer: ManagedServer | undefined;
    let storyTargets: StoryTarget[] = [];

    if (runStorybook) {
      await buildStorybookIfNeeded(repoRoot, log, registerCleanup);
      if (options.stories.length > 0) {
        const indexEntries = readStorybookIndex(repoRoot);
        storyTargets = filterStoryTargets(options.stories, indexEntries);
        if (storyTargets.length === 0) {
          throw new Error(
            `No Storybook stories matched --story filter(s): ${options.stories.join(", ")}.`,
          );
        }
      } else {
        storyTargets = [...DEFAULT_STORYBOOK_TARGETS];
      }
    }

    let appServer: ManagedServer | undefined;
    const routeTargets: RouteTarget[] = normalizedRoutes.map((route) => ({
      kind: "route",
      route,
      name: route,
      fullPage: true,
    }));

    const combinedStems = buildUniqueTargetStems([
      ...storyTargets.map((target) => target.name),
      ...routeTargets.map((target) => target.name),
    ]);
    const storyStems = combinedStems.slice(0, storyTargets.length);
    const routeStems = combinedStems.slice(storyTargets.length);

    // --update clears only this run's targets and viewports up front, so an aborted run leaves
    // none of their old screenshots behind while other targets' evidence stays.
    if (options.update) {
      for (const stem of combinedStems) {
        for (const viewport of viewports) {
          rmSync(screenshotFileFor(screenshotsDir, stem, viewport), { force: true });
        }
      }
    }
    mkdirSync(screenshotsDir, { recursive: true });

    if (runStorybook) {
      storybookServer = await startStorybookServer(repoRoot, log, registerCleanup);
    }
    if (runApp && appMode) {
      appServer = await startAppServer(repoRoot, appMode, log, registerCleanup);
    }

    browser = await chromium.launch({ headless: true });
    const launchedBrowser = browser;
    registerCleanup(() => launchedBrowser.close());

    if (storybookServer && storyTargets.length > 0) {
      const storyChecks = await runTargetsInBrowser({
        browser: launchedBrowser,
        targets: storyTargets,
        baseUrl: storybookServer.baseUrl,
        viewports,
        screenshotsDir,
        screenshotStems: storyStems,
        log,
      });
      targetResults.push(...storyChecks);
    }

    if (appServer && routeTargets.length > 0) {
      const routeChecks = await runTargetsInBrowser({
        browser: launchedBrowser,
        targets: routeTargets,
        baseUrl: appServer.baseUrl,
        viewports,
        screenshotsDir,
        screenshotStems: routeStems,
        log,
      });
      targetResults.push(...routeChecks);
    }

    const results = summarizeResults({
      mode,
      appMode,
      updated: options.update,
      outDir,
      targets: targetResults,
    });
    writeProofArtifacts(outDir, results);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`FAIL: ${message}`);
    const results = summarizeResults({
      mode,
      appMode,
      updated: options.update,
      outDir,
      targets: targetResults,
      error: message,
    });
    writeProofArtifacts(outDir, results);
    return results;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await runCleanups();
  }
};

const main = async () => {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const results = await runUiVerify(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else if (results.error) {
    process.stderr.write(
      `\nUI verification FAILED: ${results.error}\nProof written to ${results.outDir}/report.md and ${results.outDir}/results.json.\n`,
    );
  } else {
    process.stdout.write(
      `\nUI verification ${results.passed ? "PASSED" : "FAILED"} (${results.summary.passed}/${results.summary.total} targets passed). Proof written to ${results.outDir}/report.md and ${results.outDir}/results.json.\n`,
    );
  }
  if (!results.passed) {
    process.exitCode = 1;
  }
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  await main();
}
