import { join, resolve } from "node:path";

import { errorMessage } from "../../cli.ts";
import { launchVerificationBrowser, runTargetsInBrowser } from "./audit.ts";
import { acquireWithCleanup, createCleanupStack, type Log, type RunContext } from "./cleanup.ts";
import type { UiVerifyCliOptions } from "./cli.ts";
import {
  acquireOutputLock,
  prepareScreenshotsDir,
  publishResults,
  type RunOutcome,
  type RunReport,
} from "./output.ts";
import type { RunMode, TargetCheckResult, UiVerifyResults } from "./results.ts";
import {
  buildStorybookIfNeeded,
  startAppServer,
  startStorybookServer,
  type ManagedServer,
} from "./servers.ts";
import {
  buildContainerDelegationArgs,
  buildUniqueTargetStems,
  DEFAULT_STORYBOOK_TARGETS,
  filterStoryTargets,
  inferAppMode,
  readStorybookIndex,
  resolveViewports,
  routeTargetsFor,
  type AppMode,
  type RouteTarget,
  type StoryTarget,
  type VerifyTarget,
  type ViewportName,
} from "./targets.ts";

/** Runs the Docker visual baseline check with these arguments, returning its exit code. */
export type RunContainer = (args: readonly string[]) => number;

/**
 * Calls `teardown` when the user interrupts the run, until the returned stop is called. The
 * caller decides what happens once teardown finishes, such as exiting the process.
 */
export type WatchInterrupts = (teardown: (signal: NodeJS.Signals) => Promise<void>) => () => void;

export type UiVerifyDependencies = {
  repoRoot: string;
  log: Log;
  runContainer: RunContainer;
  watchInterrupts?: WatchInterrupts;
};

type ContainerPlan = {
  kind: "container";
  args: string[];
};

type HostPlan = {
  kind: "host";
  update: boolean;
  screenshotsDir: string;
  viewports: ViewportName[];
  /** Story filters when the run checks Storybook; none selects the curated sweep. */
  storybook?: { filters: readonly string[] };
  app?: { mode: AppMode; targets: RouteTarget[] };
};

export type RunPlan = ContainerPlan | HostPlan;

const runsStorybook = (options: UiVerifyCliOptions): boolean =>
  options.stories.length > 0 || options.routes.length === 0;

const runModeFor = (options: UiVerifyCliOptions): RunMode => {
  if (options.container) {
    return "container";
  }
  if (options.routes.length === 0) {
    return "storybook";
  }
  return runsStorybook(options) ? "mixed" : "app";
};

/** Where the run publishes and how its report names it; decided before anything can fail. */
export const planReport = (options: UiVerifyCliOptions, repoRoot: string): RunReport => ({
  mode: runModeFor(options),
  outDir: resolve(repoRoot, options.outDir),
  updated: options.update,
});

/** Decides what the run checks and where; throws when the options select nothing it can check. */
export const planRun = (options: UiVerifyCliOptions, report: RunReport): RunPlan => {
  if (options.container) {
    return { kind: "container", args: buildContainerDelegationArgs(options) };
  }
  const routeTargets = routeTargetsFor(options.routes);
  return {
    kind: "host",
    update: options.update,
    screenshotsDir: join(report.outDir, "screenshots"),
    viewports: resolveViewports(options.viewport),
    ...(runsStorybook(options) ? { storybook: { filters: options.stories } } : {}),
    ...(routeTargets.length > 0
      ? {
          app: {
            mode: inferAppMode(
              routeTargets.map((target) => target.route),
              options.mode,
            ),
            targets: routeTargets,
          },
        }
      : {}),
  };
};

const delegateToContainer = (plan: ContainerPlan, log: Log, runContainer: RunContainer) => {
  log(`Delegating to visual container: run-visual-container.ts ${plan.args.join(" ")}`);
  return { targets: [], containerExitCode: runContainer(plan.args) };
};

/** Builds Storybook and selects the stories the filters match, or the curated sweep without any. */
const selectStories = async (
  filters: readonly string[],
  context: RunContext,
): Promise<StoryTarget[]> => {
  await buildStorybookIfNeeded(context);
  if (filters.length === 0) {
    return [...DEFAULT_STORYBOOK_TARGETS];
  }
  const stories = filterStoryTargets(filters, readStorybookIndex(context.repoRoot));
  if (stories.length === 0) {
    throw new Error(`No Storybook stories matched --story filter(s): ${filters.join(", ")}.`);
  }
  return stories;
};

/**
 * Selects the targets, starts their servers, and checks them in one browser, adding results to
 * `results` as they finish so a later failure still reports them.
 */
const checkOnHost = async (
  plan: HostPlan,
  context: RunContext,
  results: TargetCheckResult[],
): Promise<void> => {
  const stories = plan.storybook ? await selectStories(plan.storybook.filters, context) : [];
  const routes = plan.app?.targets ?? [];
  // Stems come from every target together, so stories and routes never share a screenshot.
  const stems = buildUniqueTargetStems([...stories, ...routes].map((target) => target.name));
  prepareScreenshotsDir(plan.screenshotsDir, {
    update: plan.update,
    stems,
    viewports: plan.viewports,
  });

  const storybook = plan.storybook ? await startStorybookServer(context) : undefined;
  const app = plan.app ? await startAppServer(context, plan.app.mode) : undefined;
  const { resource: browser } = await acquireWithCleanup(
    launchVerificationBrowser(),
    (launched) => launched.close(),
    context.registerCleanup,
  );

  const check = async (
    targets: readonly VerifyTarget[],
    server: ManagedServer | undefined,
    screenshotStems: readonly string[],
  ) => {
    if (!server || targets.length === 0) {
      return;
    }
    const checked = await runTargetsInBrowser({
      browser,
      targets,
      baseUrl: server.baseUrl,
      viewports: plan.viewports,
      screenshotsDir: plan.screenshotsDir,
      screenshotStems,
      log: context.log,
    });
    results.push(...checked);
  };

  await check(stories, storybook, stems.slice(0, stories.length));
  await check(routes, app, stems.slice(stories.length));
};

/** Runs the planned checks; a failure ends the run with the results it already has. */
const runChecks = async (
  options: UiVerifyCliOptions,
  report: RunReport,
  context: RunContext,
  runContainer: RunContainer,
): Promise<RunOutcome> => {
  const targets: TargetCheckResult[] = [];
  let appMode: AppMode | undefined;
  try {
    const plan = planRun(options, report);
    if (plan.kind === "container") {
      return delegateToContainer(plan, context.log, runContainer);
    }
    appMode = plan.app?.mode;
    await checkOnHost(plan, context, targets);
    return { targets, appMode };
  } catch (error) {
    const message = errorMessage(error);
    context.log(`FAIL: ${message}`);
    const containerExitCode = report.mode === "container" ? 1 : undefined;
    return { targets, appMode, containerExitCode, error: message };
  }
};

const ignoreInterrupts: WatchInterrupts = () => () => undefined;

/**
 * Verifies the selected targets and publishes `results.json` and `report.md` under `--out`,
 * also when the run fails. Holds the output directory until the report is written and its
 * servers are stopped. A host run tears down on interrupt; container runs leave interrupts to
 * the container.
 */
export const runUiVerify = async (
  options: UiVerifyCliOptions,
  { repoRoot, log, runContainer, watchInterrupts = ignoreInterrupts }: UiVerifyDependencies,
): Promise<UiVerifyResults> => {
  const report = planReport(options, repoRoot);
  const releaseOutput = await acquireOutputLock(report.outDir);
  const { registerCleanup, runCleanups } = createCleanupStack(log);
  // Registered first so it runs last, after the report is written and servers are stopped.
  registerCleanup(async () => releaseOutput());
  const stopWatching = (report.mode === "container" ? ignoreInterrupts : watchInterrupts)(
    async (signal) => {
      log(`Received ${signal}; tearing down isolated ui:verify servers...`);
      await runCleanups();
    },
  );

  try {
    const outcome = await runChecks(
      options,
      report,
      { repoRoot, log, registerCleanup },
      runContainer,
    );
    return publishResults(report, outcome);
  } finally {
    // An interrupt during teardown, such as while the database is dropped, waits for it to finish.
    await runCleanups();
    stopWatching();
  }
};
