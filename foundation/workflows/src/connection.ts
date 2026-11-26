import { Client, Connection } from "@temporalio/client";

import type { TemporalConfig } from "./config.ts";
import { createClientDataConverter } from "./payload-codec.ts";

export const connectionOptions = ({ address, tls, apiKey }: TemporalConfig) => ({
  address,
  tls,
  ...(apiKey === undefined ? {} : { apiKey }),
});

/**
 * Create a workflow client. The connection opens on first use, so constructing it never
 * blocks or fails when Temporal is unreachable; each call to start work reports that.
 */
export const createWorkflowClient = (config: TemporalConfig) =>
  new Client({
    connection: Connection.lazy(connectionOptions(config)),
    namespace: config.namespace,
    dataConverter: createClientDataConverter(config.payloadKey),
  });

export type WorkflowClient = ReturnType<typeof createWorkflowClient>;
