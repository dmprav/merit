import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, expect, vi } from "vite-plus/test";

import { AuthenticationError } from "@merit/auth";
import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";
import { currentAccount } from "@merit/auth/session";
import type { Database } from "@merit/db";
import { workspaceTest as it } from "@merit/organizations/testing/workspace";

import { handleMcp } from "../src/server/mcp.server";

vi.mock("@merit/auth/clerk-oauth", () => ({ verifyClerkOAuth: vi.fn() }));
vi.mock("@merit/auth/session", () => ({ currentAccount: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const endpoint = new URL("https://merit.example/mcp/workspace");
const config = {
  resource: endpoint.href,
  issuer: "https://identity.example",
  publishableKey: "key",
  secretKey: "secret",
  operatorUserIds: "",
};

const dependencies = (db: Database) => ({
  database: async <T>(operation: (db: Database) => Promise<T>) => operation(db),
  invitationOrigin: endpoint.origin,
  sendEmail: async () => {},
});

it("assembles real MCP services with each bearer's workspace and scopes despite browser cookies", async ({
  db,
}) => {
  vi.mocked(verifyClerkOAuth).mockImplementation(async (request) => ({
    clerkUserId: request.headers.get("Authorization")!.slice("Bearer ".length),
    clientId: "integration-client",
    scopes: ["workspace:read"],
  }));

  const discover = async (subject: string) => {
    const client = new Client({ name: "assembly-test", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(endpoint, {
          fetch: (url, init) => {
            const request = new Request(url, init);
            request.headers.set("Host", endpoint.host);
            request.headers.set("Authorization", `Bearer ${subject}`);
            request.headers.set("Cookie", "__session=another-account; merit-demo-session=guest");
            return handleMcp(request, config, dependencies(db));
          },
        }),
      );
      return (await client.callTool({ name: "list_workspaces", arguments: {} })).structuredContent;
    } finally {
      await client.close();
    }
  };

  expect(await discover("seed_alder")).toMatchObject({
    status: "ok",
    workspaces: [{ slug: "alder" }],
    grantedScopes: ["workspace:read"],
  });
  expect(await discover("seed_birch")).toMatchObject({
    status: "ok",
    workspaces: [{ slug: "birch" }],
  });
  expect(currentAccount).not.toHaveBeenCalled();
});

it("keeps missing, disabled and unavailable bearer identity distinct at the HTTP interface", async ({
  db,
  database,
}) => {
  const request = new Request(endpoint, {
    headers: { Host: endpoint.host, Cookie: "__session=browser; merit-demo-session=guest" },
  });
  vi.mocked(verifyClerkOAuth).mockRejectedValueOnce(new AuthenticationError("unauthenticated"));
  const missing = await handleMcp(request, config, dependencies(db));
  expect(missing.status).toBe(401);
  expect(missing.headers.get("WWW-Authenticate")).toContain(
    "oauth-protected-resource/mcp/workspace",
  );

  await database.client.query(
    "UPDATE app_users SET active = false WHERE clerk_user_id = 'seed_alder'",
  );
  vi.mocked(verifyClerkOAuth).mockResolvedValueOnce({
    clerkUserId: "seed_alder",
    clientId: "integration-client",
    scopes: ["workspace:read"],
  });
  expect((await handleMcp(request, config, dependencies(db))).status).toBe(403);

  vi.mocked(verifyClerkOAuth).mockRejectedValueOnce(new AuthenticationError("unavailable"));
  expect((await handleMcp(request, config, dependencies(db))).status).toBe(503);
  expect(currentAccount).not.toHaveBeenCalled();
});
