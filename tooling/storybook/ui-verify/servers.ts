import { join } from "node:path";

import { loadEnvLocalFiles } from "@merit/test-support/env";
import { createTestDatabase } from "@merit/test-support/test-database";

import { acquireWithCleanup, type RunContext } from "./cleanup.ts";
import {
  allocateFreePort,
  runCommandAsync,
  spawnManagedProcess,
  stopProcessGroup,
  waitForHttpReady,
} from "./processes.ts";
import type { AppMode } from "./targets.ts";

const APP_SERVER_READY_TIMEOUT_MS = 120_000;
const STORYBOOK_READY_TIMEOUT_MS = 60_000;
const SERVER_HOST = "127.0.0.1";

export type ManagedServer = {
  baseUrl: string;
  stop: () => Promise<void>;
};

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

type AppModeSettings = {
  /** Arguments for `vp dev` ahead of the host and port. */
  devArgs: readonly string[];
  /** The page that answers once the app can serve this mode. */
  readinessPath: string;
  /** Whether the database needs the workspace seed. */
  seedsWorkspace: boolean;
  /** Authentication settings for the dev server's environment. */
  authEnv: Readonly<Record<string, string>>;
};

const APP_MODES: Record<AppMode, AppModeSettings> = {
  demo: {
    devArgs: [],
    readinessPath: "/",
    seedsWorkspace: false,
    authEnv: { VITE_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "", CLERK_PUBLISHABLE_KEY: "" },
  },
  workspace: {
    devArgs: ["--mode", "local-workspace"],
    readinessPath: "/app",
    seedsWorkspace: true,
    authEnv: { VITE_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZSQ=" },
  },
};

const listenArgs = (port: number) => [
  "--host",
  SERVER_HOST,
  "--port",
  String(port),
  "--strictPort",
];

/**
 * Starts a server on a free port and waits until it is ready, stopping it again if it never is.
 * Its stop is registered first, so a teardown that starts meanwhile also stops it.
 */
const startManagedServer = async (
  { log, registerCleanup }: RunContext,
  server: {
    description: string;
    args: (port: number) => string[];
    cwd: string;
    env?: (port: number) => NodeJS.ProcessEnv;
    readinessPath: string;
    readyTimeoutMs: number;
  },
): Promise<ManagedServer> => {
  const port = await allocateFreePort();
  const baseUrl = `http://${SERVER_HOST}:${port}`;
  log(`Starting isolated ${server.description} on ${baseUrl}...`);
  const managed = spawnManagedProcess("vp", server.args(port), {
    cwd: server.cwd,
    env: server.env?.(port),
    announcedUrl: `${baseUrl}/`,
  });
  const stop = registerCleanup(() => stopProcessGroup(managed.child));
  try {
    await waitForHttpReady(`${baseUrl}${server.readinessPath}`, server.readyTimeoutMs, managed);
  } catch (error) {
    // The readiness failure is the one to report here; `stop` is the registered cleanup, so the
    // cleanup stack logs its failure when it drains.
    await stop().catch(() => undefined);
    throw error;
  }
  return { baseUrl, stop };
};

export const buildStorybookIfNeeded = async ({
  repoRoot,
  log,
  registerCleanup,
}: RunContext): Promise<void> => {
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

export const startStorybookServer = (context: RunContext): Promise<ManagedServer> =>
  startManagedServer(context, {
    description: "Storybook preview server",
    args: (port) => ["preview", ...listenArgs(port)],
    cwd: join(context.repoRoot, "tooling/storybook"),
    readinessPath: "/index.json",
    readyTimeoutMs: STORYBOOK_READY_TIMEOUT_MS,
  });

const prepareDatabase = async (
  { repoRoot, registerCleanup }: RunContext,
  settings: AppModeSettings,
  database: TestDatabase,
): Promise<void> => {
  await database.migrate();
  if (settings.seedsWorkspace) {
    await runCommandAsync("vp", ["run", "@merit/app#db:seed"], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: database.connectionString },
      label: "Workspace seed",
      registerCleanup,
    });
  }
};

const startDevServer = (
  context: RunContext,
  mode: AppMode,
  databaseUrl: string,
): Promise<ManagedServer> => {
  const settings = APP_MODES[mode];
  return startManagedServer(context, {
    description: `${mode} app server`,
    args: (port) => ["dev", ...settings.devArgs, ...listenArgs(port)],
    cwd: join(context.repoRoot, "app"),
    env: (port) => ({
      ...process.env,
      DATABASE_URL: databaseUrl,
      MERIT_DEV_PORT: String(port),
      ...settings.authEnv,
    }),
    readinessPath: settings.readinessPath,
    readyTimeoutMs: APP_SERVER_READY_TIMEOUT_MS,
  });
};

/** Starts the app in `mode` on its own ephemeral database, which stopping the server drops. */
export const startAppServer = async (
  context: RunContext,
  mode: AppMode,
): Promise<ManagedServer> => {
  const { repoRoot, log, registerCleanup } = context;
  loadEnvLocalFiles([join(repoRoot, "app/.env.local"), join(repoRoot, ".env.local")]);
  log(`Creating ephemeral test database for ${mode} mode...`);
  const { resource: database, release: disposeDatabase } = await acquireWithCleanup(
    createTestDatabase(),
    (created) => created.dispose(),
    registerCleanup,
  );

  try {
    await prepareDatabase(context, APP_MODES[mode], database);
    const server = await startDevServer(context, mode, await database.createRuntimeConnection());
    return {
      baseUrl: server.baseUrl,
      stop: async () => {
        await server.stop();
        await disposeDatabase();
      },
    };
  } catch (error) {
    await disposeDatabase();
    throw error;
  }
};
