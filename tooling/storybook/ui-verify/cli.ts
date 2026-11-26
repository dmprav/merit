import { parseCliArgs } from "../../cli.ts";
import {
  CONTAINER_ROUTE_ERROR,
  normalizeRoutePattern,
  type AppMode,
  type ViewportOption,
} from "./targets.ts";

const DEFAULT_OUT_DIR = ".tmp/ui-verify";

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

export const USAGE = `Usage: vp run ui:verify [options]

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

const parseStoryPatterns = (value: string): string[] => {
  const patterns = splitCommaValues(value);
  if (patterns.length === 0) {
    throw new Error(`Invalid --story "${value}". Expected at least one non-empty pattern.`);
  }
  const regexPattern = patterns.find((pattern) => pattern.startsWith("/"));
  if (regexPattern) {
    throw new Error(
      `Invalid --story "${regexPattern}". Use a substring or glob (* and ?); /regex/ filters are not supported.`,
    );
  }
  return patterns;
};

const parseRoutePatterns = (value: string): string[] => {
  const routes = splitCommaValues(value);
  if (routes.length === 0) {
    throw new Error(`Invalid --route "${value}". Expected at least one route starting with "/".`);
  }
  return routes.map(normalizeRoutePattern);
};

const parseMode = (mode: string | undefined): AppMode | undefined => {
  if (mode !== undefined && mode !== "demo" && mode !== "workspace") {
    throw new Error(`Invalid --mode "${mode}". Expected "demo" or "workspace".`);
  }
  return mode;
};

const parseViewport = (viewport: string): ViewportOption => {
  if (viewport !== "desktop" && viewport !== "mobile" && viewport !== "both") {
    throw new Error(`Invalid --viewport "${viewport}". Expected "desktop", "mobile", or "both".`);
  }
  return viewport;
};

const parseOutDir = (out: string | undefined): string => {
  const outDir = out?.trim() ?? DEFAULT_OUT_DIR;
  if (!outDir) {
    throw new Error("--out requires a value.");
  }
  return outDir;
};

const readCliValues = (args: readonly string[]) =>
  parseCliArgs(args, {
    options: {
      story: { type: "string", multiple: true },
      route: { type: "string", multiple: true },
      mode: { type: "string" },
      viewport: { type: "string" },
      update: { type: "boolean" },
      container: { type: "boolean" },
      out: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    usage: USAGE,
  }).values;

export const parseUiVerifyArgs = (args: readonly string[]): UiVerifyCliOptions => {
  const values = readCliValues(args);
  const mode = parseMode(values.mode);
  const viewport = parseViewport(values.viewport ?? "both");
  const outDir = parseOutDir(values.out);
  const routes = (values.route ?? []).flatMap(parseRoutePatterns);
  const container = values.container ?? false;
  if (container && routes.length > 0) {
    throw new Error(CONTAINER_ROUTE_ERROR);
  }

  return {
    stories: (values.story ?? []).flatMap(parseStoryPatterns),
    routes,
    mode,
    viewport,
    update: values.update ?? false,
    container,
    outDir,
    json: values.json ?? false,
    help: values.help ?? false,
  };
};
