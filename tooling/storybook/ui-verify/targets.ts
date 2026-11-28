import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { VISUAL_TARGETS } from "../visual-targets.ts";

export type AppMode = "demo" | "workspace";

export type ViewportOption = "desktop" | "mobile" | "both";

export type ViewportName = "desktop" | "mobile";

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

/** The default sweep: the Storybook visual baseline stories. */
export const DEFAULT_STORYBOOK_TARGETS: readonly StoryTarget[] = VISUAL_TARGETS.map(
  ({ id, name, globals, fullPage }) => ({
    kind: "story",
    id,
    name,
    ...(globals ? { globals } : {}),
    fullPage,
  }),
);

const VIEWPORT_ONLY_STORY_IDS = new Set(
  VISUAL_TARGETS.filter((target) => !target.fullPage).map((target) => target.id),
);

// Routes resolve against a placeholder origin, so any route that leaves it names another host.
const LOCAL_ORIGIN = "http://127.0.0.1";

const WORKSPACE_ROUTE_PREFIXES = ["/app", "/admin"] as const;

const STORYBOOK_INDEX_PATH = "tooling/storybook/dist/index.json";

const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((ch) => {
    const code = ch.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

const parseLocalRoute = (raw: string, trimmed: string): URL => {
  try {
    return new URL(trimmed, LOCAL_ORIGIN);
  } catch {
    throw new Error(`Invalid route "${raw}". Could not parse as a URL path.`);
  }
};

export const normalizeRoutePattern = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) {
    throw new Error(`Invalid route "${raw}". Routes must start with "/".`);
  }
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    throw new Error(`Invalid route "${raw}". Protocol-relative routes are not allowed.`);
  }
  if (hasControlCharacter(trimmed)) {
    throw new Error(`Invalid route "${raw}". Routes must not contain control characters.`);
  }
  if (parseLocalRoute(raw, trimmed).origin !== LOCAL_ORIGIN) {
    throw new Error(`Invalid route "${raw}". Routes must stay on the local origin.`);
  }
  return trimmed;
};

const isWorkspaceRoute = (route: string): boolean => {
  const { pathname } = new URL(route, LOCAL_ORIGIN);
  return WORKSPACE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
};

export const inferAppMode = (routes: readonly string[], explicitMode?: AppMode): AppMode => {
  const normalizedRoutes = routes.map(normalizeRoutePattern);
  if (explicitMode) {
    return explicitMode;
  }
  return normalizedRoutes.some(isWorkspaceRoute) ? "workspace" : "demo";
};

export const resolveViewports = (viewport: ViewportOption): ViewportName[] =>
  viewport === "both" ? ["desktop", "mobile"] : [viewport];

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const globCharToRegex = (char: string): string => {
  if (char === "*") {
    return ".*";
  }
  return char === "?" ? "." : escapeRegex(char);
};

const compileStoryMatcher = (pattern: string): ((candidate: string) => boolean) => {
  if (pattern.includes("*") || pattern.includes("?")) {
    const regex = new RegExp(`^${pattern.split("").map(globCharToRegex).join("")}$`, "i");
    return (candidate) => regex.test(candidate);
  }
  const needle = pattern.toLowerCase();
  return (candidate) => candidate.toLowerCase().includes(needle);
};

type StoryMatcher = ReturnType<typeof compileStoryMatcher>;

const matchesAny = (matchers: readonly StoryMatcher[], ...candidates: string[]): boolean =>
  matchers.some((match) => candidates.some((candidate) => match(candidate)));

const isIndexedStory = (entry: StorybookIndexEntry): boolean =>
  !entry.type || entry.type === "story";

const indexedStoryTarget = (entry: StorybookIndexEntry): StoryTarget => ({
  kind: "story",
  id: entry.id,
  name: entry.id,
  fullPage: !VIEWPORT_ONLY_STORY_IDS.has(entry.id),
});

/** Curated targets that match, each story and theme once, in curated order. */
const selectCuratedTargets = (
  matchers: readonly StoryMatcher[],
  curatedTargets: readonly StoryTarget[],
): StoryTarget[] => {
  const seenKeys = new Set<string>();
  return curatedTargets.filter((curated) => {
    const key = `${curated.id}|${curated.globals ?? ""}`;
    if (!matchesAny(matchers, curated.name, curated.id) || seenKeys.has(key)) {
      return false;
    }
    seenKeys.add(key);
    return true;
  });
};

/** Indexed stories that match and that no selected curated target already covers. */
const selectIndexedTargets = (
  matchers: readonly StoryMatcher[],
  indexEntries: readonly StorybookIndexEntry[],
  coveredIds: ReadonlySet<string>,
): StoryTarget[] => {
  const selectedIds = new Set(coveredIds);
  return indexEntries.filter(isIndexedStory).flatMap((entry) => {
    const label = [entry.id, entry.title ?? "", entry.name ?? ""].join(" ");
    if (!matchesAny(matchers, entry.id, label) || selectedIds.has(entry.id)) {
      return [];
    }
    selectedIds.add(entry.id);
    return [indexedStoryTarget(entry)];
  });
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
  const curated = selectCuratedTargets(matchers, curatedTargets);
  const covered = new Set(curated.map((target) => target.id));
  return [...curated, ...selectIndexedTargets(matchers, indexEntries, covered)];
};

export const routeTargetsFor = (routes: readonly string[]): RouteTarget[] =>
  routes.map(normalizeRoutePattern).map((route) => ({
    kind: "route",
    route,
    name: route,
    fullPage: true,
  }));

/** The story ID or route a result reports for its target. */
export const targetIdentifier = (target: VerifyTarget): string =>
  target.kind === "story" ? target.id : target.route;

export const resolveTargetUrl = (target: VerifyTarget, baseUrl: string): string => {
  if (target.kind === "story") {
    const globalsQuery = target.globals ? `&globals=${encodeURIComponent(target.globals)}` : "";
    return `${baseUrl}/iframe.html?id=${encodeURIComponent(target.id)}&viewMode=story${globalsQuery}`;
  }
  return `${baseUrl}${target.route}`;
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

const STEM_HASH_LENGTH = 8;

export const buildUniqueTargetStems = (names: readonly string[]): string[] => {
  const used = new Set<string>();
  return names.map((name) => {
    const base = sanitizeTargetName(name);
    // Only a name that sanitizing leaves unchanged keeps its bare stem; any other, such as every
    // route, gets a hash of the full name, so a target's file is the same alone or in a batch.
    if (base === name && !used.has(base)) {
      used.add(base);
      return base;
    }
    const hash = createHash("sha256").update(name).digest("hex").slice(0, STEM_HASH_LENGTH);
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

export const screenshotFileFor = (screenshotsDir: string, stem: string, viewport: ViewportName) =>
  join(screenshotsDir, `${stem}-${viewport}.png`);

/** The parts of a run's options that select the container's visual tests. */
export type ContainerSelection = {
  stories: readonly string[];
  routes: readonly string[];
  viewport: ViewportOption;
  update: boolean;
};

export const CONTAINER_ROUTE_ERROR =
  "--container delegates Storybook visual baselines and cannot combine with --route.";

const containerTestTitles = (story: string): string[] => {
  const matches = compileStoryMatcher(story);
  const selected = VISUAL_TARGETS.filter((target) => matches(target.name) || matches(target.id));
  if (selected.length === 0) {
    throw new Error(
      `--story "${story}" matches no visual baseline story; container mode checks only the curated targets (${VISUAL_TARGETS.map((target) => target.name).join(", ")}).`,
    );
  }
  return selected.map((target) => target.testTitle);
};

export const buildContainerDelegationArgs = (selection: ContainerSelection): string[] => {
  if (selection.routes.length > 0) {
    throw new Error(CONTAINER_ROUTE_ERROR);
  }
  const args: string[] = selection.update ? ["--update-snapshots"] : [];
  if (selection.viewport !== "both") {
    args.push("--project", selection.viewport);
  }
  if (selection.stories.length > 0) {
    // Playwright matches --grep against the project and file names as well as the title, so
    // resolve each filter against the curated targets the visual spec covers, as the host does,
    // and select their exact titles. Anchoring each title to the end of the subject keeps
    // `...switcher` from selecting `...switcher-long-name`.
    const titles = new Set(selection.stories.flatMap(containerTestTitles));
    args.push("--grep", [...titles].map((title) => `${escapeRegex(title)}$`).join("|"));
  }
  return args;
};

const storybookIndexEntrySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
});

const storybookIndexSchema = z.object({
  entries: z.record(z.string(), storybookIndexEntrySchema).optional(),
  stories: z.record(z.string(), storybookIndexEntrySchema).optional(),
});

export const readStorybookIndex = (repoRoot: string): StorybookIndexEntry[] => {
  const indexPath = join(repoRoot, STORYBOOK_INDEX_PATH);
  if (!existsSync(indexPath)) {
    throw new Error(`Storybook index not found at "${indexPath}". Build Storybook first.`);
  }
  const parsed = storybookIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  return Object.values(parsed.entries ?? parsed.stories ?? {});
};
