import { createMCPClient } from "@tanstack/ai-mcp";
import { vi } from "vite-plus/test";

import { resolveAccountUser } from "@merit/auth/server";
import { currentAccount } from "@merit/auth/session";
import type { Database } from "@merit/db";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import { handleWorkspaceMcp, mcpScopes } from "@merit/mcp";
import { inlineInvitationDelivery } from "@merit/organizations/server/testing";
import { productLinks } from "@merit/product/links";
import { inlineReviewerDelivery } from "@merit/reviews/testing";

import { createAccountDemoServices } from "../../src/server/demo-workspace.server";
import type { EmailSender } from "../../src/server/email-delivery.server";
import {
  createApplicationServices,
  organizationInvitationDelivery,
  reviewerMessageDelivery,
} from "../../src/server/services.server";

const session = vi.hoisted(() => ({ userId: "seed_alder" as string | null }));
vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: async () => ({ userId: session.userId }),
}));

export const endpoint = new URL("http://localhost:3000/mcp/workspace");

export const createTransport = (
  db: Database,
  identity: Parameters<typeof createApplicationServices>[0]["identity"] = {
    isOperator: async () => false,
    verifiedEmails: async () => [],
    displayName: async () => null,
  },
  sendEmail: EmailSender = async () => {},
  analytics?: Parameters<typeof createApplicationServices>[0]["analytics"],
  aiReviewer?: Parameters<typeof createApplicationServices>[0]["aiReviewer"],
) => {
  const {
    grantmaking,
    rounds,
    applications,
    recommendations,
    decisions,
    reviews,
    contacts,
    organizations: team,
    reviewer,
  } = createApplicationServices({
    database: async (operation) => operation(db),
    identity,
    analytics,
    aiReviewer,
    startReviewerMessage: inlineReviewerDelivery(
      reviewerMessageDelivery({
        database: async (operation) => operation(db),
        invitationOrigin: "http://localhost:3000",
        sendEmail,
      }),
    ),
    startOrganizationInvitation: inlineInvitationDelivery(
      organizationInvitationDelivery({
        database: async (operation) => operation(db),
        invitationOrigin: "http://localhost:3000",
        sendEmail,
      }),
    ),
    deliveryWait: { timeoutMs: 0, intervalMs: 0 },
    networkAddress: "integration",
  });
  const services = {
    ...grantmaking,
    readWorkspace: team.readWorkspace,
    currentIdentity: async () => {
      const account = await currentAccount();
      if (account.status !== "authenticated") {
        return account;
      }

      const user = await resolveAccountUser(db, account.clerkUserId);
      return user.status === "active"
        ? { status: "authenticated" as const, actor: { userId: user.userId } }
        : { status: "unavailable" as const };
    },
  };

  const mcpOperations = {
    rounds,
    applications,
    reviews,
    reviewer,
    recommendations,
    decisions,
    grantmaking,
    contacts,
    organizations: {
      ...team,
      workspaceHomeUrl: (workspace) =>
        new URL(productLinks.workspaceHome(workspace), endpoint).href,
    },
    demo: createAccountDemoServices(async (operation) => operation(db), "integration"),
  } satisfies Omit<Parameters<typeof handleWorkspaceMcp>[2], "authenticate">;

  const connect = (userId: string, scopes: readonly string[]) =>
    createMCPClient({
      name: "merit-persistence-test",
      transport: {
        type: "http",
        url: endpoint.href,
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
      },
    });

  // A connected assistant discovers the catalog once and uses its grant across calls.
  const clients = new Map<string, ReturnType<typeof connect>>();

  const callMcp = async (
    userId: string,
    toolArguments: Record<string, unknown>,
    name = "get_funding_round",
    scopes: readonly string[] = mcpScopes,
  ) => {
    const key = JSON.stringify([userId, ...scopes]);
    let client = clients.get(key);
    if (!client) {
      client = connect(userId, scopes);
      clients.set(key, client);
    }
    return (await client).callTool(name, toolArguments);
  };

  const close = () =>
    Promise.all(Array.from(clients.values(), async (client) => (await client).close()));

  return { services, mcpOperations, team, reviewer, callMcp, session, close };
};

export const transportTest = roundTest.extend(
  "transport",
  { auto: true },
  async ({ db }, { onCleanup }) => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "test-only");
    session.userId = "seed_alder";
    const transport = createTransport(db);
    onCleanup(async () => {
      try {
        await transport.close();
      } finally {
        vi.unstubAllEnvs();
      }
    });
    return transport;
  },
);
