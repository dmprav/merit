import type { Client } from "pg";
import type { z } from "zod";

import type { Database } from "@merit/db";

import type { observedCall } from "./result";

export type Call = (
  name: string,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export type ObservedCall = z.infer<typeof observedCall>;

export const successfulCalls = (trace: readonly ObservedCall[], name: string) =>
  trace.flatMap((call) =>
    call.name === name && call.outcome.kind === "success"
      ? [{ ...call, outcome: call.outcome }]
      : [],
  );

export type ScenarioContext = {
  db: Database;
  sql: Client;
  roundId: string;
  createApplication: (
    title: string,
    requested?: string | null,
  ) => Promise<{ workspaceSlug: string; publicId: string }>;
  seed: (
    name: string,
    args: Record<string, unknown>,
    actorId?: string,
  ) => Promise<Record<string, unknown>>;
  recipients: string[];
};

export type Scenario = {
  verifyReply?: (reply: string, serverUrl?: string) => void | Promise<void>;
  manualReplyCriterion?: string;
  verifyEffects?: () => void | Promise<void>;
  verifyTrace?: (trace: readonly ObservedCall[]) => void | Promise<void>;
  acceptsError?: (call: ObservedCall) => boolean;
  calibrationControl?: Scenario["control"];
  control: (call: Call) => Promise<string>;
  allowDiscovery?: boolean;
  checkSelection?: (calls: readonly ObservedCall[]) => string[];
  beforeCall?: (name: string) => Promise<void>;
  externalMail?: { from: string; subject: string; receivedAt: string; body: string };
};
