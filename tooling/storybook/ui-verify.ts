import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
  type ExecFileSyncOptions,
} from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  color: string;
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
  --story <pattern>            Filter Storybook story IDs (substring, glob, or /regex/; repeatable or comma-separated)
  --route <path>               Verify live app route(s) (e.g. /demo, /app/alder/rounds; repeatable or comma-separated)
  --mode demo|workspace        App server mode for --route (auto-inferred when omitted)
  --viewport desktop|mobile|both
                               Viewports to check (default: both)
  --update                     Refresh reference/output artifacts (or pass --update-snapshots with --container)
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
      stories.push(...splitCommaValues(value));
      index = nextIndex;
      continue;
    }
    if (arg === "--route" || arg.startsWith("--route=")) {
      const { value, nextIndex } = readFlagValue(args, index, "--route");
      for (const route of splitCommaValues(value)) {
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
  if (explicitMode) {
    return explicitMode;
  }
  const needsWorkspace = routes.some(
    (route) =>
      route === "/app" ||
      route.startsWith("/app/") ||
      route === "/admin" ||
      route.startsWith("/admin/"),
  );
  return needsWorkspace ? "workspace" : "demo";
};

export const resolveViewports = (viewport: ViewportOption): ViewportName[] =>
  viewport === "both" ? ["desktop", "mobile"] : [viewport];

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compileStoryMatcher = (pattern: string): ((candidate: string) => boolean) => {
  const regexLiteral = /^\/(.+)\/([gimsuy]*)$/.exec(pattern);
  if (regexLiteral?.[1]) {
    const flags = (regexLiteral[2] ?? "").replace(/[gy]/g, "");
    const regex = new RegExp(regexLiteral[1], flags);
    return (candidate) => regex.test(candidate);
  }
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
    const pattern = options.stories
      .map((story) => {
        const regexLiteral = /^\/(.+)\/[gimsuy]*$/.exec(story);
        if (regexLiteral?.[1]) {
          return regexLiteral[1];
        }
        return story
          .split("")
          .map((char) => (char === "*" ? ".*" : char === "?" ? "." : escapeRegex(char)))
          .join("");
      })
      .join("|");
    args.push("--grep", pattern);
  }
  return args;
};

const isTransparentColor = (color: string): boolean => {
  const normalized = color.replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized === "hsla(0,0%,0%,0)" ||
    /^rgba\([^)]+,0(?:\.0+)?\)$/.test(normalized)
  );
};

const hasVisibleOutline = (style: ElementStyleSnapshot): boolean =>
  style.outlineStyle !== "none" &&
  style.outlineStyle !== "" &&
  Number.parseFloat(style.outlineWidth) > 0 &&
  !isTransparentColor(style.outlineColor);

const compareStyleSnapshots = (
  unfocused: ElementStyleSnapshot,
  focused: ElementStyleSnapshot,
  scope: string,
): string[] => {
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
  if (focused.boxShadow !== unfocused.boxShadow && focused.boxShadow !== "none") {
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
  if (borderChanged) {
    reasons.push(`${scope}:border`);
  }
  if (
    unfocused.backgroundColor !== focused.backgroundColor ||
    unfocused.backgroundImage !== focused.backgroundImage
  ) {
    reasons.push(`${scope}:background`);
  }
  if (
    unfocused.textDecorationLine !== focused.textDecorationLine ||
    unfocused.textDecorationThickness !== focused.textDecorationThickness
  ) {
    reasons.push(`${scope}:text-decoration`);
  }
  if (scope.endsWith("::before") || scope.endsWith("::after")) {
    if (
      focused.content !== undefined &&
      focused.content !== "none" &&
      (focused.content !== unfocused.content || focused.opacity !== unfocused.opacity)
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

const waitForHttpReady = async (
  url: string,
  timeoutMs: number,
  child: ChildProcess,
  getLogs: () => string,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Server exited early with code ${child.exitCode} while waiting for ${url}.\n${getLogs()}`,
      );
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 400) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${url} (${lastError}).\n${getLogs()}`,
  );
};

const stopChildProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.pid === undefined) {
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

const spawnManagedProcess = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): { child: ChildProcess; getLogs: () => string } => {
  const outputChunks: string[] = [];
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const append = (chunk: Buffer) => {
    outputChunks.push(chunk.toString("utf8"));
    if (outputChunks.length > 80) {
      outputChunks.shift();
    }
  };

  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  return { child, getLogs: () => outputChunks.join("").slice(-4000) };
};

const startStorybookServer = async (
  repoRoot: string,
  log: (line: string) => void,
): Promise<ManagedServer> => {
  const storybookDir = join(repoRoot, "tooling/storybook");
  if (process.env.MERIT_STORYBOOK_PREBUILT !== "1") {
    log("Building static Storybook (cached via Vite Task)...");
    const execOptions: ExecFileSyncOptions = {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    };
    try {
      execFileSync("vp", ["run", "@merit/storybook#build"], execOptions);
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
      throw new Error(`Storybook build failed.\n${stderr}`);
    }
  }

  const port = await allocateFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  log(`Starting isolated Storybook preview server on ${baseUrl}...`);
  const { child, getLogs } = spawnManagedProcess(
    "vp",
    ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: storybookDir },
  );

  try {
    await waitForHttpReady(`${baseUrl}/index.json`, STORYBOOK_READY_TIMEOUT_MS, child, getLogs);
  } catch (error) {
    await stopChildProcess(child);
    throw error;
  }

  return {
    baseUrl,
    stop: () => stopChildProcess(child),
  };
};

const startAppServer = async (
  repoRoot: string,
  mode: AppMode,
  log: (line: string) => void,
): Promise<ManagedServer> => {
  loadEnvLocalFiles([join(repoRoot, "app/.env.local"), join(repoRoot, ".env.local")]);
  log(`Creating ephemeral test database for ${mode} mode...`);
  const database = await createTestDatabase();

  let child: ChildProcess | undefined;
  try {
    const dbEnv = { ...process.env, DATABASE_URL: database.connectionString };
    execFileSync("vp", ["run", "@merit/db#db:migrate"], {
      cwd: repoRoot,
      env: dbEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (mode === "workspace") {
      execFileSync("vp", ["run", "@merit/app#db:seed"], {
        cwd: repoRoot,
        env: dbEnv,
        stdio: ["ignore", "pipe", "pipe"],
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
    });
    child = spawned.child;

    const readinessPath = mode === "workspace" ? "/app" : "/";
    await waitForHttpReady(
      `${baseUrl}${readinessPath}`,
      SERVER_READY_TIMEOUT_MS,
      child,
      spawned.getLogs,
    );

    return {
      baseUrl,
      stop: async () => {
        if (child) {
          await stopChildProcess(child);
        }
        await database.dispose();
      },
    };
  } catch (error) {
    if (child) {
      await stopChildProcess(child);
    }
    await database.dispose();
    throw error;
  }
};

type CapturedStop = {
  index: number;
  element: string;
  boundingBox: { width: number; height: number };
  focused: FocusVisualSnapshot;
  unfocused?: FocusVisualSnapshot;
};

type MeritFocusTracker = {
  stops: Element[];
  captureSnapshot: (el: Element) => FocusVisualSnapshot;
  describeElement: (el: Element) => string;
  deepActiveElement: () => Element | null;
};

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
      color: style.color,
      ...(pseudo ? { content: style.content, opacity: style.opacity } : {}),
    });

    const deepActiveElement = (): Element | null => {
      let current: Element | null = document.activeElement;
      while (current && "shadowRoot" in current && current.shadowRoot?.activeElement) {
        current = current.shadowRoot.activeElement;
      }
      return current;
    };

    const captureSnapshot = (el: Element): FocusVisualSnapshot => {
      const ancestors: ElementStyleSnapshot[] = [];
      let parent = el.parentElement;
      for (
        let depth = 0;
        depth < 3 && parent && parent !== document.body && parent !== document.documentElement;
        depth += 1
      ) {
        ancestors.push(pickStyle(getComputedStyle(parent)));
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
        descendants.push(pickStyle(getComputedStyle(next.node)));
        if (next.depth < 2) {
          for (const child of Array.from(next.node.children)) {
            queue.push({ node: child, depth: next.depth + 1 });
          }
        }
      }

      return {
        self: pickStyle(getComputedStyle(el)),
        before: pickStyle(getComputedStyle(el, "::before"), true),
        after: pickStyle(getComputedStyle(el, "::after"), true),
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

    window.__meritFocusTracker = {
      stops: [],
      captureSnapshot,
      describeElement,
      deepActiveElement,
    };
  });

  const stops: CapturedStop[] = [];
  let reachedCap = false;

  // Record an initially focused naturally-tabbable control (e.g. autofocused dialog input or story button).
  const initialStop = await page.evaluate(() => {
    const tracker = window.__meritFocusTracker;
    if (!tracker) {
      return null;
    }
    const active = tracker.deepActiveElement();
    if (
      !active ||
      active === document.body ||
      active === document.documentElement ||
      !(active instanceof HTMLElement || active instanceof SVGElement)
    ) {
      return null;
    }
    const tabIndex = active instanceof HTMLElement ? active.tabIndex : -1;
    if (tabIndex < 0) {
      return null;
    }
    const rect = active.getBoundingClientRect();
    tracker.stops.push(active);
    return {
      index: 0,
      element: tracker.describeElement(active),
      boundingBox: { width: rect.width, height: rect.height },
      focused: tracker.captureSnapshot(active),
    };
  });

  if (initialStop) {
    stops.push(initialStop);
  }

  for (let step = 0; step < maxStops; step += 1) {
    await page.keyboard.press("Tab");
    await settleAnimations(page);

    const outcome = await page.evaluate((previousIndex: number) => {
      const tracker = window.__meritFocusTracker;
      if (!tracker) {
        return { done: true as const, previousUnfocused: undefined };
      }
      const active = tracker.deepActiveElement();
      const previousEl = previousIndex >= 0 ? tracker.stops[previousIndex] : undefined;
      let previousUnfocused: FocusVisualSnapshot | undefined;
      if (previousEl && previousEl !== active && previousEl.isConnected) {
        previousUnfocused = tracker.captureSnapshot(previousEl);
      }

      if (!active || active === document.body || active === document.documentElement) {
        return { done: true as const, previousUnfocused };
      }

      const existingIndex = tracker.stops.indexOf(active);
      if (existingIndex !== -1) {
        // Re-visiting index 0 after Tab gives us a genuine keyboard focus snapshot if it started autofocused.
        const refreshedFocused = existingIndex === 0 ? tracker.captureSnapshot(active) : undefined;
        return {
          done: true as const,
          cycledTo: existingIndex,
          refreshedFocused,
          previousUnfocused,
        };
      }

      const rect = active.getBoundingClientRect();
      const index = tracker.stops.length;
      tracker.stops.push(active);
      return {
        done: false as const,
        previousUnfocused,
        stop: {
          index,
          element: tracker.describeElement(active),
          boundingBox: { width: rect.width, height: rect.height },
          focused: tracker.captureSnapshot(active),
        },
      };
    }, stops.length - 1);

    const lastStop = stops.at(-1);
    if (lastStop && outcome.previousUnfocused && !lastStop.unfocused) {
      lastStop.unfocused = outcome.previousUnfocused;
    }

    if (outcome.done) {
      if (outcome.cycledTo === 0 && outcome.refreshedFocused && stops[0]) {
        stops[0].focused = outcome.refreshedFocused;
      }
      break;
    }

    stops.push(outcome.stop);
    if (stops.length >= maxStops) {
      reachedCap = true;
      break;
    }
  }

  // Capture unfocused baseline for the final stop if focus stayed on it.
  const finalStop = stops.at(-1);
  if (finalStop && !finalStop.unfocused) {
    await page.keyboard.press("Tab");
    await settleAnimations(page);
    const finalUnfocused = await page.evaluate((targetIndex: number) => {
      const tracker = window.__meritFocusTracker;
      const el = tracker?.stops[targetIndex];
      if (!tracker || !el || !el.isConnected) {
        return undefined;
      }
      if (tracker.deepActiveElement() === el && el instanceof HTMLElement) {
        el.blur();
      }
      return tracker.captureSnapshot(el);
    }, finalStop.index);
    if (finalUnfocused) {
      finalStop.unfocused = finalUnfocused;
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
    if (stop.unfocused) {
      const diff = detectFocusVisualChange(stop.unfocused, stop.focused);
      if (!diff.changed) {
        reasons.push("no visible focus indicator change compared to unfocused state");
      }
    } else if (!hasVisibleOutline(stop.focused.self) && stop.focused.self.boxShadow === "none") {
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
}): Promise<TargetCheckResult> => {
  const audit: PageAuditResult = await auditPage(page);

  if (screenshotPath) {
    mkdirSync(dirname(screenshotPath), { recursive: true });
    if (fullPage) {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.screenshot({
      path: screenshotPath,
      fullPage,
      animations: "disabled",
    });
  }

  const focus = await checkKeyboardFocusTraversal(page);
  const errorsCopy = [...browserErrors];

  const passed =
    audit.viteErrorOverlayCount === 0 &&
    audit.bodyVisible &&
    audit.dialogsVisible &&
    audit.enteringOrExitingCount === 0 &&
    !audit.hasHorizontalOverflow &&
    audit.axeViolations.length === 0 &&
    errorsCopy.length === 0 &&
    focus.failures.length === 0;

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

const openTargetOnPage = async (
  page: Page,
  target: VerifyTarget,
  baseUrl: string,
): Promise<string> => {
  if (target.kind === "story") {
    const globalsQuery = target.globals ? `&globals=${encodeURIComponent(target.globals)}` : "";
    const url = `${baseUrl}/iframe.html?id=${encodeURIComponent(target.id)}&viewMode=story${globalsQuery}`;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        document.querySelector("#storybook-root")?.getAttribute("data-story-ready") === "true" ||
        (document.querySelector("#storybook-root")?.childElementCount ?? 0) > 0,
      undefined,
      { timeout: 30_000 },
    );
    return url;
  }

  const url = `${baseUrl}${target.route}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page
    .waitForFunction(() => document.body && document.body.innerText.trim().length > 0, undefined, {
      timeout: 20_000,
    })
    .catch(() => undefined);
  return url;
};

export const summarizeResults = ({
  mode,
  appMode,
  updated,
  outDir,
  targets,
  containerExitCode,
  generatedAt = new Date().toISOString(),
}: {
  mode: UiVerifyResults["mode"];
  appMode?: AppMode;
  updated: boolean;
  outDir: string;
  targets: TargetCheckResult[];
  containerExitCode?: number;
  generatedAt?: string;
}): UiVerifyResults => {
  const passedCount = targets.filter((item) => item.passed).length;
  const failedCount = targets.length - passedCount;
  const axeViolations = targets.reduce((sum, item) => sum + item.axeViolations.length, 0);
  const overflowFailures = targets.filter((item) => item.hasHorizontalOverflow).length;
  const browserErrors = targets.reduce((sum, item) => sum + item.browserErrors.length, 0);
  const focusFailures = targets.reduce((sum, item) => sum + item.focus.failures.length, 0);

  const passed =
    mode === "container" ? containerExitCode === 0 : failedCount === 0 && targets.length > 0;

  return uiVerifyResultsSchema.parse({
    version: 1,
    generatedAt,
    mode,
    appMode,
    updated,
    outDir,
    passed,
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
    const focusCell =
      item.focus.failures.length > 0
        ? `FAIL (${item.focus.failures.length}/${item.focus.stopsChecked})`
        : `OK (${item.focus.stopsChecked})`;
    const screenshotCell = item.screenshot
      ? `\`${relative(results.outDir, item.screenshot).replaceAll("\\", "/")}\``
      : "—";
    lines.push(
      `| \`${item.name}\` | ${item.viewport} | ${status} | ${item.axeViolations.length} | ${overflow} | ${item.browserErrors.length} | ${focusCell} | ${screenshotCell} |`,
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

const readStorybookIndex = (repoRoot: string): StorybookIndexEntry[] => {
  const indexPath = join(repoRoot, "tooling/storybook/dist/index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`Storybook index not found at "${indexPath}". Build Storybook first.`);
  }
  const parsed = storybookIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  return Object.values(parsed.entries ?? parsed.stories ?? {});
};

const runTargetsInBrowser = async ({
  browser,
  targets,
  baseUrl,
  viewports,
  screenshotsDir,
  log,
}: {
  browser: Browser;
  targets: readonly VerifyTarget[];
  baseUrl: string;
  viewports: readonly ViewportName[];
  screenshotsDir: string;
  log: (line: string) => void;
}): Promise<TargetCheckResult[]> => {
  const results: TargetCheckResult[] = [];

  for (const viewport of viewports) {
    const contextOptions =
      viewport === "desktop"
        ? { viewport: desktopViewport }
        : {
            viewport: mobileOptions.viewport,
            isMobile: mobileOptions.isMobile,
            hasTouch: mobileOptions.hasTouch,
          };

    for (const target of targets) {
      let context: BrowserContext | undefined;
      const browserErrors: BrowserError[] = [];
      const screenshotFile = join(
        screenshotsDir,
        `${sanitizeTargetName(target.name)}-${viewport}.png`,
      );
      const targetId = target.kind === "story" ? target.id : target.route;
      let resolvedUrl = baseUrl;

      try {
        context = await browser.newContext(contextOptions);
        collectBrowserErrors(context, browserErrors);
        const page = await context.newPage();
        resolvedUrl = await openTargetOnPage(page, target, baseUrl);
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
        });
        results.push(checked);
        log(
          `${checked.passed ? "PASS" : "FAIL"} [${viewport}] ${target.name} (axe:${checked.axeViolations.length} overflow:${checked.hasHorizontalOverflow ? "yes" : "no"} errors:${checked.browserErrors.length} focus:${checked.focus.failures.length}/${checked.focus.stopsChecked})`,
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
          screenshot: existsSync(screenshotFile) ? screenshotFile : null,
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
          stdio: "inherit",
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

  if (options.container) {
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
  }

  if (options.update && existsSync(screenshotsDir)) {
    for (const file of readdirSync(screenshotsDir)) {
      if (file.endsWith(".png")) {
        rmSync(join(screenshotsDir, file), { force: true });
      }
    }
  }
  mkdirSync(screenshotsDir, { recursive: true });

  const runStorybook = options.stories.length > 0 || options.routes.length === 0;
  const runApp = options.routes.length > 0;
  const appMode = runApp ? inferAppMode(options.routes, options.mode) : undefined;
  const viewports = resolveViewports(options.viewport);

  const cleanups: Array<() => Promise<void>> = [];
  let cleaningUp = false;

  const runCleanups = async () => {
    if (cleaningUp) {
      return;
    }
    cleaningUp = true;
    for (const cleanup of [...cleanups].reverse()) {
      await cleanup().catch(() => undefined);
    }
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
    let storybookServer: ManagedServer | undefined;
    let storyTargets: StoryTarget[] = [];

    if (runStorybook) {
      storybookServer = await startStorybookServer(repoRoot, log);
      cleanups.push(storybookServer.stop);
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
    const routeTargets: RouteTarget[] = options.routes.map((route) => ({
      kind: "route",
      route,
      name: route,
      fullPage: true,
    }));

    if (runApp && appMode) {
      appServer = await startAppServer(repoRoot, appMode, log);
      cleanups.push(appServer.stop);
    }

    browser = await chromium.launch({ headless: true });
    const launchedBrowser = browser;
    cleanups.push(() => launchedBrowser.close());

    if (storybookServer && storyTargets.length > 0) {
      const storyChecks = await runTargetsInBrowser({
        browser: launchedBrowser,
        targets: storyTargets,
        baseUrl: storybookServer.baseUrl,
        viewports,
        screenshotsDir,
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
        log,
      });
      targetResults.push(...routeChecks);
    }

    const mode: UiVerifyResults["mode"] =
      runStorybook && runApp ? "mixed" : runApp ? "app" : "storybook";

    const results = summarizeResults({
      mode,
      appMode,
      updated: options.update,
      outDir,
      targets: targetResults,
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
