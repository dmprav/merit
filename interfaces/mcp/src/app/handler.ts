import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
} from "@modelcontextprotocol/server";

import { AuthenticationError } from "@merit/auth";

import type { McpActor } from "../contracts";
import type { McpOperations } from "./operations";
import { createWorkspaceServer } from "./server";

type Dependencies = McpOperations & {
  authenticate: (request: Request) => Promise<McpActor>;
};

export const handleWorkspaceMcp = async (
  request: Request,
  resource: string,
  dependencies: Dependencies,
): Promise<Response> => {
  const url = new URL(resource);
  const rejected =
    hostHeaderValidationResponse(request, [url.hostname]) ??
    originValidationResponse(request, [url.hostname]);
  if (rejected) {
    return rejected;
  }
  // The SDK checks hostnames; browser origins must also match the scheme and port.
  if (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const headers = new Headers({
    "Access-Control-Allow-Origin": url.origin,
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, Mcp-Method, Mcp-Name",
    "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Session-Id",
    "Cache-Control": "private, no-store",
  });
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  let actor: McpActor;
  try {
    actor = await dependencies.authenticate(request);
  } catch (error) {
    return authenticationErrorResponse(error, url, headers);
  }

  // Each request closes over its own verified identity; it is never shared between clients.
  const handler = createMcpHandler(() => createWorkspaceServer(actor, dependencies, url.origin));
  const response = await handler.fetch(request, {
    authInfo: {
      token: request.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "",
      clientId: actor.provenance.clientId,
      scopes: [...actor.scopes],
      resource: url,
      resourceMetadataUrl: new URL(
        `/.well-known/oauth-protected-resource${url.pathname}`,
        url.origin,
      ).href,
    },
  });
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
};

const authenticationErrorResponse = (error: unknown, resource: URL, headers: Headers): Response => {
  const statuses = { unauthenticated: 401, disabled: 403, unavailable: 503 } as const;
  const status = error instanceof AuthenticationError ? statuses[error.reason] : 503;
  const messages = {
    401: "Sign in required",
    403: "Account access denied",
    503: "Authentication unavailable",
  } as const;

  if (status === 401) {
    const metadata = new URL(
      `/.well-known/oauth-protected-resource${resource.pathname}`,
      resource.origin,
    ).href;
    headers.set("WWW-Authenticate", `Bearer resource_metadata="${metadata}"`);
  }

  return Response.json({ error: messages[status] }, { status, headers });
};
