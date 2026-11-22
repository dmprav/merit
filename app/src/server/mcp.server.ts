import { AuthenticationError } from "@merit/auth";
import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";
import { resolveAccountUser } from "@merit/auth/server";
import type { DatabaseRunner } from "@merit/db";
import { handleWorkspaceMcp } from "@merit/mcp";
import { productLinks } from "@merit/product/links";
import { setSpanAttributes, withSpan } from "@merit/telemetry";

import { createAccountDemoServices } from "./demo-workspace.server";
import { createApplicationServices } from "./services.server";

type McpConfig = Parameters<typeof verifyClerkOAuth>[1];

export const authenticateMcp = (request: Request, config: McpConfig, database: DatabaseRunner) =>
  withSpan("auth.resolve_mcp_session", async (span) => {
    const verified = await verifyClerkOAuth(request, config);
    const user = await database((db) => resolveAccountUser(db, verified.clerkUserId));
    if (user.status === "disabled") {
      throw new AuthenticationError("disabled");
    }
    setSpanAttributes(span, {
      "merit.mcp.client_id": verified.clientId,
      "merit.auth.status": "authenticated",
    });
    return {
      userId: user.userId,
      provenance: { interface: "mcp" as const, clientId: verified.clientId },
      scopes: verified.scopes,
    };
  });

export const handleMcp = (
  request: Request,
  config: McpConfig,
  dependencies: Omit<Parameters<typeof createApplicationServices>[0], "identity">,
) => {
  const services = createApplicationServices({
    ...dependencies,
    // MCP uses workspace and member reads. Organization provisioning and invitations use web identity.
    identity: {
      isOperator: async () => false,
      verifiedEmails: async () => [],
      displayName: async () => null,
    },
  });

  return handleWorkspaceMcp(request, config.resource, {
    captureMcpToolFinished: dependencies.analytics?.captureMcpToolFinished,
    authenticate: () => authenticateMcp(request, config, dependencies.database),
    rounds: services.rounds,
    applications: services.applications,
    reviews: services.reviews,
    reviewer: services.reviewer,
    recommendations: services.recommendations,
    grantmaking: services.grantmaking,
    contacts: services.contacts,
    organizations: {
      workspacesPage: services.organizations.workspacesPage,
      membersPage: services.organizations.membersPage,
      workspaceHomeUrl: (workspace) =>
        new URL(productLinks.workspaceHome(workspace), config.resource).href,
    },
    demo: createAccountDemoServices(dependencies.database, dependencies.networkAddress),
  });
};
