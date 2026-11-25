import { randomUUID } from "node:crypto";

import { Client, Connection } from "@temporalio/client";
import type { Payload } from "@temporalio/common";
import { NativeConnection } from "@temporalio/worker";

import { readTemporalConfig, type TemporalConfig } from "../config.ts";
import { connectionOptions, createWorkflowClient } from "../connection.ts";
import { createDataConverter } from "../payload-codec.ts";
import { createWorker, quietRuntime, type WorkerSettings } from "../worker.ts";

/**
 * Settings for the Compose Temporal service, for tests that need a real server.
 * Start it with `docker compose up -d --wait`; tests never download a server.
 */
export const readTestTemporalConfig = (
  env: Readonly<Record<string, string | undefined>>,
): TemporalConfig => readTemporalConfig(env, { local: true });

/** A name that cannot collide with another test, run, or developer's work on the shared server. */
export const uniqueName = (prefix: string) => `${prefix}-${randomUUID()}`;

export type TestWorker = {
  client: ReturnType<typeof createWorkflowClient>;
  taskQueue: string;
  /** Stop polling, wait for work in flight, and close the connection. */
  stop(): Promise<void>;
};

/**
 * Run a worker on a task queue of its own against the Compose server. Workflow IDs
 * should also come from {@link uniqueName}; a worker never sees another test's work.
 */
export const startTestWorker = async (
  config: TemporalConfig,
  settings: Omit<WorkerSettings, "config" | "taskQueue"> & { taskQueue?: string },
): Promise<TestWorker> => {
  quietRuntime();
  const taskQueue = settings.taskQueue ?? uniqueName("test");
  const connection = await NativeConnection.connect(connectionOptions(config));
  const worker = await createWorker(connection, { ...settings, config, taskQueue }).catch(
    async (error: unknown) => {
      await connection.close();
      throw error;
    },
  );
  const running = worker.run();
  return {
    client: createWorkflowClient(config),
    taskQueue,
    async stop() {
      worker.shutdown();
      await running;
      await connection.close();
    },
  };
};

const isPayload = (value: unknown): value is Payload => typeof value === "object" && value !== null;

const collectPayloads = (value: unknown, found: Payload[]) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPayloads(item, found);
    }
  } else if (value && typeof value === "object") {
    for (const [name, child] of Object.entries(value)) {
      if (name === "payloads" && Array.isArray(child)) {
        const items: unknown[] = child;
        found.push(...items.filter(isPayload));
      } else {
        collectPayloads(child, found);
      }
    }
  }
  return found;
};

/**
 * Every payload the server stored for a workflow, exactly as stored: the history is read
 * without the data converter, so encrypted payloads stay encrypted.
 */
export const readStoredPayloads = async (
  client: TestWorker["client"],
  workflowId: string,
  namespace: string,
) => {
  const { history } = await client.workflowService.getWorkflowExecutionHistory({
    namespace,
    execution: { workflowId },
  });
  return collectPayloads(history?.events ?? [], []);
};

/**
 * A client that decodes with another key, or with none when `payloadKey` is undefined, to
 * show that stored payloads cannot be read without the right key.
 */
export const createClientWithPayloadKey = (
  config: TemporalConfig,
  payloadKey: Uint8Array | undefined,
) =>
  new Client({
    connection: Connection.lazy(connectionOptions(config)),
    namespace: config.namespace,
    ...(payloadKey === undefined ? {} : { dataConverter: createDataConverter(payloadKey) }),
  });
