import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";
import { createClerkProfileReader } from "@merit/auth/clerk-users";
import { resolveAccountUser, resolveGuestSession } from "@merit/auth/server";
import type { Database } from "@merit/db";

import { createWebIdentity } from "../src/server/identity.server";
import { createMcpIdentity } from "../src/server/mcp.server";

vi.mock("@merit/auth/clerk-oauth", () => ({ verifyClerkOAuth: vi.fn() }));
vi.mock("@merit/auth/clerk-users", () => ({ createClerkProfileReader: vi.fn() }));
vi.mock("@merit/auth/server", () => ({
  resolveAccountUser: vi.fn(),
  resolveGuestSession: vi.fn(),
}));
vi.mock("@merit/auth/session", () => ({
  currentAccount: vi.fn(async () => ({ status: "authenticated" as const, clerkUserId: "op-1" })),
}));

const database = async <T>(operation: (db: Database) => Promise<T>) => operation({} as Database);

const webOptions = {
  database,
  clerk: { secretKey: "secret", publishableKey: "key", browserPublishableKey: "key" },
  operatorUserIds: " op-1 , op-2 ",
};

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
  vi.mocked(resolveGuestSession).mockResolvedValue({
    userId: "guest-1",
    expiresAt: new Date(),
  });
  vi.mocked(createClerkProfileReader).mockReturnValue(async (id) => ({
    verifiedEmails: [`${id}@example.test`],
    displayName: `Name:${id}`,
  }));
});

afterEach(() => {
  vi.resetAllMocks();
});

it("resolves web identity and operator state order-independently when profile methods run before currentIdentity", async () => {
  const session = createWebIdentity(webOptions);
  const actor = { userId: "user-1" };

  expect(session.organizationIdentity.isOperator(actor)).toBe(false);

  expect(await session.organizationIdentity.verifiedEmails(actor)).toEqual(["op-1@example.test"]);
  expect(session.organizationIdentity.isOperator(actor)).toBe(true);
  expect(await session.organizationIdentity.displayName(actor)).toBe("Name:op-1");
  expect(await session.currentIdentity()).toEqual({ status: "authenticated", actor });
  expect(resolveAccountUser).toHaveBeenCalledOnce();
});

it("returns null displayName instead of a hardcoded fallback for guest or profileless local sessions", async () => {
  const { currentAccount } = await import("@merit/auth/session");
  vi.mocked(currentAccount).mockResolvedValueOnce({ status: "signed_out" });

  const guestSession = createWebIdentity({ ...webOptions, guestToken: "guest-cookie" });
  const guestActor = { userId: "guest-1" };

  expect(await guestSession.currentIdentity()).toEqual({
    status: "authenticated",
    actor: guestActor,
  });
  expect(await guestSession.isGuest()).toBe(true);
  expect(await guestSession.organizationIdentity.verifiedEmails(guestActor)).toEqual([]);
  expect(await guestSession.organizationIdentity.displayName(guestActor)).toBeNull();
  expect(guestSession.organizationIdentity.isOperator(guestActor)).toBe(false);

  const localSession = createWebIdentity({
    ...webOptions,
    localIdentity: { status: "authenticated", actor: { userId: "local-1" } },
  });
  expect(await localSession.organizationIdentity.displayName({ userId: "local-1" })).toBeNull();
  expect(await localSession.organizationIdentity.verifiedEmails({ userId: "local-1" })).toEqual([]);
  expect(localSession.organizationIdentity.isOperator({ userId: "local-1" })).toBe(false);
});

it("resolves MCP profile and operator state order-independently and memoizes authentication", async () => {
  const request = new Request(mcpConfig.resource, {
    headers: { Authorization: "Bearer token" },
  });
  const mcpIdentity = createMcpIdentity(request, mcpConfig, database);
  const actor = { userId: "user-1" };

  expect(mcpIdentity.organizationIdentity.isOperator(actor)).toBe(false);

  expect(await mcpIdentity.organizationIdentity.displayName(actor)).toBe("Name:op-1");
  expect(mcpIdentity.organizationIdentity.isOperator(actor)).toBe(true);
  expect(await mcpIdentity.organizationIdentity.verifiedEmails(actor)).toEqual([
    "op-1@example.test",
  ]);

  const firstAuth = await mcpIdentity.authenticate();
  const secondAuth = await mcpIdentity.authenticate();
  expect(firstAuth).toEqual(secondAuth);
  expect(verifyClerkOAuth).toHaveBeenCalledOnce();
  expect(resolveAccountUser).toHaveBeenCalledOnce();
});

it("ignores blank operator entries so empty operatorUserIds never grants operator access", async () => {
  vi.mocked(verifyClerkOAuth).mockResolvedValueOnce({
    clerkUserId: "",
    clientId: "client-1",
    scopes: [],
  });
  const request = new Request(mcpConfig.resource, {
    headers: { Authorization: "Bearer token" },
  });
  const mcpIdentity = createMcpIdentity(
    request,
    { ...mcpConfig, operatorUserIds: " , " },
    database,
  );
  const actor = await mcpIdentity.authenticate();
  expect(mcpIdentity.organizationIdentity.isOperator(actor)).toBe(false);
});

it("falls back to unavailable without rejecting when account resolution throws", async () => {
  vi.mocked(resolveAccountUser).mockRejectedValueOnce(new Error("database unavailable"));
  const session = createWebIdentity(webOptions);

  await expect(session.currentIdentity()).resolves.toEqual({ status: "unavailable" });
  expect(await session.isGuest()).toBe(false);
  expect(session.organizationIdentity.isOperator({ userId: "user-1" })).toBe(false);
});
