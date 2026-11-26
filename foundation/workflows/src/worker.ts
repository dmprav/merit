import { setTimeout as delay } from "node:timers/promises";

import {
  DefaultLogger,
  makeTelemetryFilterString,
  NativeConnection,
  Runtime,
  type RuntimeOptions,
  Worker,
  type WorkerOptions,
} from "@temporalio/worker";

import type { TemporalConfig } from "./config.ts";
import { connectionOptions } from "./connection.ts";
import { createDataConverter } from "./payload-codec.ts";
import { writeSafeLogEntry } from "./runtime-logger.ts";

export type WorkerLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

/** Workflow code is bundled from a source file, or supplied as an already built bundle. */
export type WorkflowSource = { workflowsPath: string } | { workflowBundle: { code: string } };

/** A task queue that runs activities only, with its own limit on how many run at once. */
export type ActivityQueue = {
  taskQueue: string;
  activities: NonNullable<WorkerOptions["activities"]>;
  /** The most activities this process runs at once on the queue. */
  maxConcurrentActivities: number;
};

export type WorkerSettings = {
  config: TemporalConfig;
  taskQueue: string;
  workflows: WorkflowSource;
  activities?: WorkerOptions["activities"];
  /** Further queues this process polls for activities, such as one that limits turn concurrency. */
  activityQueues?: ActivityQueue[];
  /**
   * How long shutdown waits for activities in flight before it abandons them and the worker
   * rejects with `GracefulShutdownPeriodExpiredError`. Unset, it waits for them without limit.
   */
  shutdownForceTime?: WorkerOptions["shutdownForceTime"];
};

const messageLimit = 200;

/** A short, single-line description that is safe to log: never includes connection options. */
export const describeError = (error: unknown) =>
  (error instanceof Error ? error.message : "unknown error")
    .replaceAll(/\s+/gu, " ")
    .slice(0, messageLimit);

const connect = (config: TemporalConfig) => NativeConnection.connect(connectionOptions(config));

/** Create a worker over an open connection. The caller owns the connection. */
export const createWorker = (connection: NativeConnection, settings: WorkerSettings) =>
  Worker.create({
    connection,
    namespace: settings.config.namespace,
    taskQueue: settings.taskQueue,
    dataConverter: createDataConverter(settings.config.payloadKey),
    ...settings.workflows,
    ...(settings.activities === undefined ? {} : { activities: settings.activities }),
    ...(settings.shutdownForceTime === undefined
      ? {}
      : { shutdownForceTime: settings.shutdownForceTime }),
  });

/** Ask every worker to stop after its work in flight. A worker that is not running is skipped. */
const shutdownAll = (workers: Worker[]) => {
  for (const worker of workers) {
    try {
      worker.shutdown();
    } catch {
      // Already stopping or stopped, or never started: the SDK only shuts down a running worker.
    }
  }
};

/**
 * Release workers that were created but never polled. The SDK shuts down only a running worker,
 * and keeps the connection referenced until its worker has stopped, so such a worker is started
 * first, then told to stop, and awaited. Its own failures are not the caller's concern.
 */
const release = async (workers: Worker[]) => {
  const runs = workers.map((worker) => worker.run());
  shutdownAll(workers);
  await Promise.allSettled(runs);
};

/** Create the worker of the main queue and one activity-only worker per further queue. */
export const createWorkers = async (connection: NativeConnection, settings: WorkerSettings) => {
  const workers = [await createWorker(connection, settings)];
  try {
    for (const queue of settings.activityQueues ?? []) {
      workers.push(
        await Worker.create({
          connection,
          namespace: settings.config.namespace,
          taskQueue: queue.taskQueue,
          dataConverter: createDataConverter(settings.config.payloadKey),
          activities: queue.activities,
          maxConcurrentActivityTaskExecutions: queue.maxConcurrentActivities,
          ...(settings.shutdownForceTime === undefined
            ? {}
            : { shutdownForceTime: settings.shutdownForceTime }),
        }),
      );
    }
  } catch (error) {
    await release(workers);
    throw error;
  }
  return workers;
};

/**
 * Poll every worker until all stop. Polling starts when this is called, so a shutdown requested
 * right after it reaches every worker. One failing stops the others and waits until they have
 * stopped, so the connection they share can close, then rejects with the first failure.
 */
export const runWorkers = async (workers: Worker[]) => {
  const runs = workers.map((worker) => worker.run());
  try {
    await Promise.all(runs);
  } catch (error) {
    shutdownAll(workers);
    await Promise.allSettled(runs);
    throw error;
  }
};

/**
 * Options of the SDK Runtime: its logger writes through {@link writeSafeLogEntry}, and the
 * native core's own logs, which would otherwise go straight to the console with task tokens and
 * failure text, are forwarded to that logger.
 */
const runtimeOptions = (): RuntimeOptions => ({
  logger: new DefaultLogger("WARN", writeSafeLogEntry),
  telemetryOptions: {
    logging: { forward: {}, filter: makeTelemetryFilterString({ core: "WARN", other: "ERROR" }) },
  },
});

/**
 * Keep the SDK's bundler output and state changes out of the console. Warnings and errors
 * remain, with their level, workflow or activity type and identifiers, but never failure
 * text or stack traces: those can carry what the encrypted history protects.
 */
export const quietRuntime = () => {
  try {
    Runtime.install(runtimeOptions());
  } catch {
    // The runtime is installed once per process; keep its first configuration.
  }
};

export type RunOptions = {
  logger: WorkerLogger;
  /** Stops the worker after it finishes work in flight. */
  signal?: AbortSignal;
  /** Backoff between connection attempts, doubling from `initialMs` to `maxMs`. */
  backoff?: { initialMs: number; maxMs: number };
  /**
   * Start-up work that needs a reachable server, such as ensuring a Schedule. It runs beside
   * polling and is retried with the same backoff until it succeeds or the worker stops, so a
   * failure never leaves the work undone until the next process start. Each failure is logged as
   * a warning and does not stop the worker.
   */
  onConnected?: () => Promise<void>;
};

/** Run start-up work until it succeeds, pausing with doubling backoff, or until stopped. */
const retryStartup = async (
  work: () => Promise<void>,
  {
    logger,
    backoff: { initialMs, maxMs },
    signal,
  }: { logger: WorkerLogger; backoff: { initialMs: number; maxMs: number }; signal: AbortSignal },
) => {
  let wait = initialMs;
  while (!signal.aborted) {
    try {
      await work();
      return;
    } catch (error) {
      logger.warn(
        `Worker start-up work failed (${describeError(error)}). Retrying in ${Math.round(wait / 1000)}s.`,
      );
      await delay(wait, undefined, { signal }).catch(() => undefined);
      wait = Math.min(wait * 2, maxMs);
    }
  }
};

/**
 * Connect to Temporal, retrying with backoff while it is unreachable, then poll until
 * the signal aborts. Connection failures are logged without credentials and never throw,
 * so starting the worker before Temporal is ready is not an error. Failures to build the
 * worker, such as invalid workflow code, are not transient and reject.
 */
export const runWorker = async (settings: WorkerSettings, options: RunOptions) => {
  const { logger, signal } = options;
  quietRuntime();
  const { initialMs, maxMs } = options.backoff ?? { initialMs: 1000, maxMs: 30_000 };
  let wait = initialMs;
  let connection: NativeConnection | undefined;
  while (!signal?.aborted) {
    try {
      connection = await connect(settings.config);
      break;
    } catch (error) {
      logger.warn(
        `Temporal at ${settings.config.address} is unreachable (${describeError(error)}). Retrying in ${Math.round(wait / 1000)}s.`,
      );
      await delay(wait, undefined, signal ? { signal } : undefined).catch(() => undefined);
      wait = Math.min(wait * 2, maxMs);
    }
  }
  if (!connection) {
    return;
  }
  try {
    const workers = await createWorkers(connection, settings);
    const running = runWorkers(workers);

    const stop = () => shutdownAll(workers);

    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) {
      stop();
    }
    const startup = new AbortController();
    const startingUp = options.onConnected
      ? retryStartup(options.onConnected, {
          logger,
          backoff: { initialMs, maxMs },
          signal: signal ? AbortSignal.any([signal, startup.signal]) : startup.signal,
        })
      : undefined;
    const queues = [settings.taskQueue, ...(settings.activityQueues ?? []).map((q) => q.taskQueue)];
    logger.info(
      `Worker polling task queue ${queues.join(", ")} in namespace ${settings.config.namespace}.`,
    );
    try {
      await running;
    } finally {
      signal?.removeEventListener("abort", stop);
      startup.abort();
      await startingUp;
    }
  } finally {
    await connection.close();
  }
};
