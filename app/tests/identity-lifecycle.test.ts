import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";
import { createClerkProfileReader } from "@merit/auth/clerk-users";
import { resolveAccountUser } from "@merit/auth/server";
import type { Database } from "@merit/db";

import { createMcpIdentity } from "../src/server/mcp.server";

vi.mock("@merit/auth/clerk-oauth", () => ({ verifyClerkOAuth: vi.fn() }));
vi.mock("@merit/auth/clerk-users", () => ({ createClerkProfileReader: vi.fn() }));
vi.mock("@merit/auth/server", () => ({ resolveAccountUser: vi.fn() }));

const database = async <T>(operation: (db: Database) => Promise<T>) => operation({} as Database);

const mcpConfig = {
  secretKey: "secret",
  publishableKey: "key",
  issuer: "https://identity.example",
  resource: "https://merit.example/mcp/workspace",
  operatorUserIds: " op-1 , op-2 ",
};

beforeEach(() => {
  vi.mocked(verifyClerkOAuth).mockResolvedValue({
    clerkUserId: "op-1",
    clientId: "client-1",
    scopes: ["workspace:read"],
  });
  vi.mocked(resolveAccountUser).mockResolvedValue({ status: "active", userId: "user-1" });
  vi.mocked(createClerkProfileReader).mockReturnValue(async (id) => ({
    verifiedEmails: [`${id}@example.test`],
    displayName: `Name:${id}`,
  }));
});

afterEach(() => {
  vi.resetAllMocks();
});

it("verifies the bearer token once per MCP request whether authority or authentication is checked first", async () => {
  const request = new Request(mcpConfig.resource, {
    headers: { Authorization: "Bearer token" },
  });
  const mcpIdentity = createMcpIdentity(request, mcpConfig, database);
  const actor = { userId: "user-1" };

  expect(await mcpIdentity.organizationIdentity.isOperator(actor)).toBe(true);
  const firstAuth = await mcpIdentity.authenticate();
  const secondAuth = await mcpIdentity.authenticate();

  expect(firstAuth).toEqual(secondAuth);
  expect(verifyClerkOAuth).toHaveBeenCalledOnce();
  expect(resolveAccountUser).toHaveBeenCalledOnce();
});
