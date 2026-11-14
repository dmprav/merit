import { env, waitUntil } from "cloudflare:workers";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { mcpResourceMetadata } from "@merit/mcp";
import { reportError } from "@merit/telemetry/errors";
import { describeHttpRoute, traceWorkerRequest } from "@merit/telemetry/worker";

import type { ApplicationRequestContext } from "./request-context";
import { createRequestDatabase } from "./server/database.server";
import { createDemoServices, demoCookie } from "./server/demo.server";
import { createEmailSender } from "./server/email-delivery.server";
import { createWebIdentity } from "./server/identity.server";
import { handleMcp } from "./server/mcp.server";
import { createApplicationServices } from "./server/services.server";

export default createServerEntry({
  fetch(request, options) {
    return traceWorkerRequest(
      request,
      {
        endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
        headers: env.OTEL_EXPORTER_OTLP_HEADERS,
        serviceName: env.OTEL_SERVICE_NAME,
        traceFilter: env.OTEL_TRACE_FILTER,
      },
      waitUntil,
      async () => {
        const url = new URL(request.url);
        try {
          const config = {
            publishableKey: env.CLERK_PUBLISHABLE_KEY,
            secretKey: env.CLERK_SECRET_KEY,
            issuer: env.CLERK_ISSUER,
            resource: new URL("/mcp/workspace", env.APP_ORIGIN).href,
            operatorUserIds: env.MERIT_OPERATOR_USER_IDS,
          };
          if (url.pathname === "/.well-known/oauth-protected-resource/mcp/workspace") {
            return mcpResourceMetadata(config);
          }
          if (url.pathname === "/mcp") {
            return new Response("Not found", { status: 404 });
          }

          const requestDatabase = createRequestDatabase();
          try {
            const dependencies = {
              database: requestDatabase.run,
              invitationOrigin: import.meta.env.DEV ? url.origin : env.APP_ORIGIN,
              networkAddress: import.meta.env.DEV
                ? "local"
                : (request.headers.get("CF-Connecting-IP") ?? undefined),
              sendEmail: createEmailSender({
                from: env.EMAIL_FROM,
                resendKey: env.RESEND_API_KEY,
                mailpitUrl: import.meta.env.DEV ? env.MAILPIT_URL : undefined,
              }),
            };
            if (url.pathname === "/mcp/workspace") {
              return await handleMcp(request, config, dependencies);
            }

            return await handleWebRequest(request, options, config, dependencies);
          } finally {
            await requestDatabase.close();
          }
        } catch (error) {
          reportError(error, {
            surface: "server",
            operation: "worker.fetch",
            tags: { route: describeHttpRoute(url.pathname).route, method: request.method },
          });
          throw error;
        }
      },
    );
  },
});

const handleWebRequest = async (
  request: Request,
  options: Parameters<typeof handler.fetch>[1],
  config: { publishableKey: string; secretKey: string },
  dependencies: Omit<Parameters<typeof createApplicationServices>[0], "identity">,
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
      ...config,
      browserPublishableKey:
        typeof browserPublishableKey === "string" ? browserPublishableKey : undefined,
    },
    operatorUserIds: env.MERIT_OPERATOR_USER_IDS,
    ...localIdentity,
  });
  const services = createApplicationServices({
    ...dependencies,
    identity: identity.organizationIdentity,
  });
  const context: ApplicationRequestContext = {
    navigation: services.navigation,
    reviewer: services.reviewer,
    currentIdentity: identity.currentIdentity,
    demo: createDemoServices(
      dependencies.database,
      identity.currentIdentity,
      guestToken,
      identity.isGuest,
      import.meta.env.DEV ? undefined : dependencies.networkAddress,
    ),
    organizations: services.organizations,
    workspace: {
      ...services.grantmaking,
      ...services.contacts,
      currentIdentity: identity.currentIdentity,
      readWorkspace: services.readWorkspace,
    },
  };

  const response = await handler.fetch(request, {
    ...options,
    context: { ...options?.context, ...context },
  });
  return preventFraming(response);
};

const preventFraming = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.append("Content-Security-Policy", "frame-ancestors 'none'");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
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
