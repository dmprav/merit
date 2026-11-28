import { randomBytes } from "node:crypto";
import { env } from "node:process";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { createServerAnalytics } from "@merit/analytics/server";
import { createDatabasePool, createRequestDatabase } from "@merit/db";
import { mcpResourceMetadata } from "@merit/mcp";
import { createFileStorage } from "@merit/storage";
import { reportError } from "@merit/telemetry/errors";
import { traceServerRequest } from "@merit/telemetry/server";
import {
  createWorkflowClient,
  readTemporalConfig,
  type WorkflowClient,
} from "@merit/workflows/client";

import { readAnalyticsConfig } from "./analytics-config";
import type { ApplicationRequestContext } from "./request-context";
import { handleApplicationPdfHttp } from "./server/application-pdfs/http.server";
import { createAssistantHost } from "./server/assistant/host.server";
import { handleAssistantHttp } from "./server/assistant/http.server";
import { createBackgroundWork } from "./server/background-work.server";
import { createDemoServices, demoCookie } from "./server/demo.server";
import { createFileObjects } from "./server/file-objects.server";
import { applySecurityHeaders, createDocumentPolicy } from "./server/http-headers.server";
import { createWebIdentity } from "./server/identity.server";
import { handleMcp } from "./server/mcp.server";
import { readAppOrigin, readDatabaseUrl } from "./server/runtime-config.server";
import { createApplicationServices, createPdfRepository } from "./server/services.server";
import { readWorkSettings } from "./worker/task-queue";

const fileStorage = createFileStorage(createFileObjects(env));
const origin = readAppOrigin();
const database = createDatabasePool(readDatabaseUrl());
const analytics = createServerAnalytics(readAnalyticsConfig());

const clerkConfig = {
  publishableKey: env.CLERK_PUBLISHABLE_KEY ?? "",
  secretKey: env.CLERK_SECRET_KEY ?? "",
  issuer: env.CLERK_ISSUER ?? "",
  resource: new URL("/mcp/workspace", origin).href,
  operatorUserIds: env.MERIT_OPERATOR_USER_IDS ?? "",
};

const publicHttps = new URL(origin).protocol === "https:";
const documentPolicy = createDocumentPolicy(clerkConfig.issuer, readAnalyticsConfig());

// Created on first use, so a missing Temporal setting is a reported start failure, not a crash
// that keeps requests from committing.
let workflowClient: WorkflowClient | undefined;
const queues = readWorkSettings(env);
const {
  startReviewerMessage,
  startOrganizationInvitation,
  wakeAssistantConversation,
  cancelAssistantTurn,
} = createBackgroundWork({
  taskQueue: queues.taskQueue,
  turnTaskQueue: queues.turnTaskQueue,
  client: () =>
    (workflowClient ??= createWorkflowClient(
      readTemporalConfig(env, {
        local: Boolean(import.meta.env.DEV) || env.MERIT_LOCAL_PREVIEW === "1",
      }),
    )),
});

// Requests wake a conversation's workflow; the worker process runs its turns.
const assistant = createAssistantHost(
  {
    database,
    analytics,
    startReviewerMessage,
    startOrganizationInvitation,
    wakeConversation: wakeAssistantConversation,
    cancelConversation: cancelAssistantTurn,
    invitationOrigin: origin,
  },
  {
    apiKey: env.OPENAI_API_KEY ?? "",
    model: env.MERIT_AI_MODEL ?? "",
  },
);

// TanStack's Vite adapter supplies the socket peer on the request.
const peerAddress = (request: Request) =>
  "ip" in request && typeof request.ip === "string" && request.ip ? request.ip : undefined;

export default createServerEntry({
  async fetch(request, options) {
    const nonce = publicHttps ? randomBytes(16).toString("base64") : undefined;
    const response = await traceServerRequest(
      request,
      {
        endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
        headers: env.OTEL_EXPORTER_OTLP_HEADERS,
        serviceName: env.OTEL_SERVICE_NAME,
        traceFilter: env.OTEL_TRACE_FILTER,
      },
      async () => {
        const url = new URL(request.url);
        try {
          if (url.pathname === "/.well-known/oauth-protected-resource/mcp/workspace") {
            return mcpResourceMetadata(clerkConfig);
          }

          const requestDatabase = createRequestDatabase(database);
          try {
            const dependencies = {
              analytics,
              database: requestDatabase.run,
              networkAddress: import.meta.env.DEV ? "local" : peerAddress(request),
              startReviewerMessage,
              startOrganizationInvitation,
            };
            if (url.pathname === "/mcp/workspace") {
              return await handleMcp(request, clerkConfig, dependencies);
            }

            return await handleWebRequest(request, options, dependencies, nonce);
          } finally {
            await requestDatabase.close();
          }
        } catch (error) {
          reportError(error, {
            surface: "server",
            operation: "server.fetch",
            tags: { route: url.pathname, method: request.method },
          });
          throw error;
        }
      },
    );
    return applySecurityHeaders(response, nonce, documentPolicy);
  },
});

const handleWebRequest = async (
  request: Request,
  options: Parameters<typeof handler.fetch>[1],
  dependencies: Omit<Parameters<typeof createApplicationServices>[0], "identity">,
  nonce: string | undefined,
) => {
  const localIdentity = await resolveLocalIdentity(request);
  if (localIdentity instanceof Response) {
    return localIdentity;
  }

  const guestToken = demoCookie(request);
  const browserPublishableKey: unknown = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const identity = createWebIdentity({
    database: dependencies.database,
    guestToken,
    clerk: {
      ...clerkConfig,
      browserPublishableKey:
        typeof browserPublishableKey === "string" ? browserPublishableKey : undefined,
    },
    operatorUserIds: clerkConfig.operatorUserIds,
    ...localIdentity,
  });
  const services = createApplicationServices({
    ...dependencies,
    identity: identity.organizationIdentity,
  });
  const context: ApplicationRequestContext = {
    applicationPdfs: (request, workspace) =>
      handleApplicationPdfHttp(
        request,
        workspace,
        readAppOrigin(request),
        identity.currentIdentity,
        createPdfRepository(dependencies.database),
        fileStorage,
      ),
    assistant: (request, workspace) =>
      handleAssistantHttp(
        request,
        workspace,
        readAppOrigin(request),
        identity.currentIdentity,
        assistant.command,
      ),
    secureCookies: publicHttps,
    navigation: services.navigation,
    reviewer: services.reviewer,
    currentIdentity: identity.currentIdentity,
    demo: createDemoServices(
      dependencies.database,
      identity.currentIdentity,
      guestToken,
      identity.isGuest,
      import.meta.env.DEV ? false : dependencies.networkAddress,
    ),
    organizations: services.organizations,
    grantmaking: services.grantmaking,
    rounds: services.rounds,
    applications: services.applications,
    reviews: services.reviews,
    recommendations: services.recommendations,
    decisions: services.decisions,
    contacts: services.contacts,
  };

  return handler.fetch(request, {
    ...options,
    context: { ...options?.context, ...context, nonce },
  });
};

type LocalIdentity = Pick<
  Parameters<typeof createWebIdentity>[0],
  "localActor" | "localIdentity" | "localProfile"
>;

const resolveLocalIdentity = async (request: Request): Promise<LocalIdentity | Response> => {
  if (!import.meta.env.MERIT_LOCAL_WORKSPACE) {
    return {};
  }

  const local = await import("./development/local-workspace.server");
  if (!local.allowsLocalWorkspaceRequest(request)) {
    return new Response("Local workspace requires a same-origin loopback request.", {
      status: 403,
    });
  }

  const selected = local.localProvisioningIdentity(request);
  if (selected) {
    return {
      localActor: { clerkUserId: selected.actor.clerkUserId, operator: selected.operator },
      localProfile: { verifiedEmails: selected.emails, displayName: selected.displayName },
    };
  }
  return {
    localIdentity: await local.localWorkspaceIdentity(),
    localProfile: local.localWorkspaceProfile,
  };
};
