import { AuthenticationError } from "@merit/auth";
import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";
import { createClerkProfileReader } from "@merit/auth/clerk-users";
import { resolveAccountUser } from "@merit/auth/server";
import type { Database } from "@merit/db";
import { handleWorkspaceMcp } from "@merit/mcp";

import { createAccountDemoServices } from "./demo-workspace.server";
import type { OrganizationIdentity } from "./identity.server";
import { createApplicationServices } from "./services.server";

type McpConfig = Parameters<typeof verifyClerkOAuth>[1] & { operatorUserIds: string };

export const createMcpIdentity = (
  request: Request,
  config: McpConfig,
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>,
) => {
  let account: { clerkUserId: string; userId: string } | undefined;
  const readProfile = createClerkProfileReader(config.secretKey ?? "");
  const operators = config.operatorUserIds.split(",").map((id) => id.trim());
  const organizationIdentity: OrganizationIdentity = {
    isOperator: (actor) =>
      account?.userId === actor.userId && operators.includes(account.clerkUserId),
    verifiedEmails: async (actor) =>
      account?.userId === actor.userId
        ? (await readProfile(account.clerkUserId)).verifiedEmails
        : [],
    displayName: async (actor) =>
      account?.userId === actor.userId
        ? (await readProfile(account.clerkUserId)).displayName
        : null,
  };

  return {
    organizationIdentity,
    authenticate: async () => {
      const verified = await verifyClerkOAuth(request, config);
      const user = await database((db) => resolveAccountUser(db, verified.clerkUserId));
      if (user.status === "disabled") {
        throw new AuthenticationError("disabled");
      }

      account = { clerkUserId: verified.clerkUserId, userId: user.userId };
      return {
        userId: user.userId,
        provenance: { interface: "mcp" as const, clientId: verified.clientId },
        scopes: verified.scopes,
      };
    },
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
    workspace: {
      ...services.grantmaking,
      ...services.contacts,
      listRounds: services.grantmaking.listRoundSummaries,
      listContacts: services.contacts.listContactSummaries,
    },
    team: services.organizations,
    organizations: services.organizations,
    reviewer: services.reviewer,
    navigation: services.navigation,
    demo: createAccountDemoServices(dependencies.database, dependencies.networkAddress),
  });
};
