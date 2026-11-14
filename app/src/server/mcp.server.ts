import { AuthenticationError, type Actor } from "@merit/auth";
import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";
import { resolveAccountUser } from "@merit/auth/server";
import type { DatabaseRunner } from "@merit/db";
import { handleWorkspaceMcp } from "@merit/mcp";
import { setSpanAttributes, withSpan } from "@merit/telemetry";

import { createAccountDemoServices } from "./demo-workspace.server";
import { createClerkIdentitySupport, type OrganizationIdentity } from "./identity.server";
import { createApplicationServices } from "./services.server";

type McpConfig = Parameters<typeof verifyClerkOAuth>[1] & { operatorUserIds: string };

type ResolvedMcpSession = {
  actor: {
    userId: string;
    provenance: { interface: "mcp"; clientId: string };
    scopes: readonly string[];
  };
  clerkUserId: string;
  operator: boolean;
};

export const createMcpIdentity = (
  request: Request,
  config: McpConfig,
  database: DatabaseRunner,
) => {
  const { isOperatorAccount, readProfile } = createClerkIdentitySupport(
    config.secretKey,
    config.operatorUserIds,
  );
  let resolvedSession: ResolvedMcpSession | undefined;
  let sessionPromise: Promise<ResolvedMcpSession> | undefined;

  const resolveSession = () =>
    (sessionPromise ??= withSpan("auth.resolve_mcp_session", async (span) => {
      const verified = await verifyClerkOAuth(request, config);
      const user = await database((db) => resolveAccountUser(db, verified.clerkUserId));
      if (user.status === "disabled") {
        throw new AuthenticationError("disabled");
      }

      const session: ResolvedMcpSession = {
        actor: {
          userId: user.userId,
          provenance: { interface: "mcp" as const, clientId: verified.clientId },
          scopes: verified.scopes,
        },
        clerkUserId: verified.clerkUserId,
        operator: isOperatorAccount(verified.clerkUserId),
      };
      setSpanAttributes(span, {
        "merit.mcp.client_id": verified.clientId,
        "merit.auth.status": "authenticated",
        "merit.auth.operator": session.operator,
      });
      resolvedSession = session;
      return session;
    }));

  const readVerifiedProfile = async (actor: Actor) => {
    let session: ResolvedMcpSession;
    try {
      session = await resolveSession();
    } catch {
      return { verifiedEmails: [], displayName: null };
    }

    if (session.actor.userId !== actor.userId) {
      return { verifiedEmails: [], displayName: null };
    }
    return readProfile(session.clerkUserId);
  };

  const organizationIdentity: OrganizationIdentity = {
    isOperator: (actor) =>
      resolvedSession?.actor.userId === actor.userId && resolvedSession.operator,
    verifiedEmails: async (actor) => (await readVerifiedProfile(actor)).verifiedEmails,
    displayName: async (actor) => (await readVerifiedProfile(actor)).displayName,
  };

  return {
    organizationIdentity,
    authenticate: async () => (await resolveSession()).actor,
  };
};

export const handleMcp = (
  request: Request,
  config: McpConfig,
  dependencies: Omit<Parameters<typeof createApplicationServices>[0], "identity">,
) => {
  const identity = createMcpIdentity(request, config, dependencies.database);
  const services = createApplicationServices({
    ...dependencies,
    identity: identity.organizationIdentity,
  });

  return handleWorkspaceMcp(request, config.resource, {
    authenticate: identity.authenticate,
    rounds: services.rounds,
    applications: services.applications,
    reviews: services.reviews,
    reviewer: services.reviewer,
    recommendations: services.recommendations,
    grantmaking: services.grantmakingQueries,
    contacts: services.contacts,
    organizations: services.organizations,
    navigation: services.navigation,
    demo: createAccountDemoServices(dependencies.database, dependencies.networkAddress),
  });
};
