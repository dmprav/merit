import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, vi } from "vite-plus/test";

import { resolveAccountUser } from "@merit/auth/server";
import { currentAccount } from "@merit/auth/session";
import type { Database } from "@merit/db";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import { handleWorkspaceMcp, mcpScopes } from "@merit/mcp";
import type { WorkspaceServices } from "@merit/product/context";

import { createAccountDemoServices } from "../../src/server/demo-workspace.server";
import { createApplicationServices } from "../../src/server/services.server";

const session = vi.hoisted(() => ({ userId: "seed_alder" as string | null }));
vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: async () => ({ userId: session.userId }),
}));

export const endpoint = new URL("http://localhost:3000/mcp/workspace");

export const createTransport = (
  db: Database,
  identity: Parameters<typeof createApplicationServices>[0]["identity"] = {
    isOperator: () => false,
    verifiedEmails: async () => [],
    displayName: async () => null,
  },
  sendEmail: Parameters<typeof createApplicationServices>[0]["sendEmail"] = async () => {},
) => {
  const {
    grantmaking,
    grantmakingQueries,
    rounds,
    applications,
    recommendations,
    reviews,
    contacts,
    organizations: team,
    readWorkspace,
    reviewer,
    navigation,
  } = createApplicationServices({
    database: async (operation) => operation(db),
    identity,
    invitationOrigin: "http://localhost:3000",
    sendEmail,
    networkAddress: "integration",
  });
  const services: WorkspaceServices = {
    ...grantmaking,
    ...contacts,
    currentIdentity: async () => {
      const account = await currentAccount();
      if (account.status !== "authenticated") {
        return account;
      }

      const user = await resolveAccountUser(db, account.clerkUserId);
      return user.status === "active"
        ? { status: "authenticated", actor: { userId: user.userId } }
        : { status: "unavailable" };
    },
    readWorkspace,
  };

  const mcpOperations = {
    rounds,
    applications,
    reviews,
    reviewer,
    recommendations,
    grantmaking: grantmakingQueries,
    contacts,
    organizations: team,
    navigation,
    demo: createAccountDemoServices(async (operation) => operation(db)),
  };

  const callMcp = async (
    userId: string,
    toolArguments: Record<string, unknown>,
    name = "get_funding_round",
    scopes: readonly string[] = mcpScopes,
  ) => {
    const client = new Client({ name: "merit-persistence-test", version: "1.0.0" });

    try {
      await client.connect(
        new StreamableHTTPClientTransport(endpoint, {
          fetch: (url, init) => {
            const request = new Request(url, init);
            request.headers.set("host", endpoint.host);

            return handleWorkspaceMcp(request, endpoint.href, {
              authenticate: async () => ({
                userId,
                provenance: { interface: "mcp", clientId: "integration-client" },
                scopes,
              }),
              ...mcpOperations,
            });
          },
        }),
      );
      const tools = await client.listTools();

      expect(tools.tools.map((tool) => tool.name)).toContain("get_funding_round");

      return await client.callTool({ name, arguments: toolArguments });
    } finally {
      await client.close();
    }
  };

  return { services, mcpOperations, team, reviewer, navigation, callMcp, session };
};

export const transportTest = roundTest.extend(
  "transport",
  { auto: true },
  async ({ db }, { onCleanup }) => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "test-only");
    session.userId = "seed_alder";
    onCleanup(() => {
      vi.unstubAllEnvs();
    });
    return createTransport(db);
  },
);
