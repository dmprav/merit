import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { AuthenticationError } from "@merit/auth";
import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";
import { createClerkProfileReader } from "@merit/auth/clerk-users";
import { resolveAccountUser, resolveGuestSession } from "@merit/auth/server";
import { currentAccount } from "@merit/auth/session";
import type { Database } from "@merit/db";

import { createMcpIdentity } from "./mcp.server";

vi.mock("@merit/auth/clerk-oauth", () => ({ verifyClerkOAuth: vi.fn() }));
vi.mock("@merit/auth/clerk-users", () => ({ createClerkProfileReader: vi.fn() }));
vi.mock("@merit/auth/server", () => ({
  resolveAccountUser: vi.fn(),
  resolveGuestSession: vi.fn(),
}));
vi.mock("@merit/auth/session", () => ({ currentAccount: vi.fn() }));

const database = async <T>(operation: (db: Database) => Promise<T>) => operation({} as Database);

const config = {
  secretKey: "secret",
  publishableKey: "key",
  issuer: "https://identity.example",
  resource: "https://merit.example/mcp/workspace",
  operatorUserIds: "account-a",
};
const request = new Request(config.resource, {
  headers: { Authorization: "Bearer token", Cookie: "merit-demo-session=guest; __session=browser" },
});

beforeEach(() => {
  vi.mocked(verifyClerkOAuth).mockResolvedValue({
    clerkUserId: "account-a",
    clientId: "client-a",
    scopes: ["workspace:read"],
  });
  vi.mocked(resolveAccountUser).mockResolvedValue({ status: "active", userId: "user-a" });
  vi.mocked(createClerkProfileReader).mockReturnValue(async (id) => ({
    verifiedEmails: [`${id}@example.test`],
    displayName: id,
  }));
});
afterEach(() => vi.resetAllMocks());

it("binds identity, profile and authority to the bearer account independently for each request", async () => {
  const first = createMcpIdentity(request, config, database);
  const actor = await first.authenticate();
  expect(actor).toEqual({
    userId: "user-a",
    provenance: { interface: "mcp", clientId: "client-a" },
    scopes: ["workspace:read"],
  });
  expect(await first.organizationIdentity.verifiedEmails(actor)).toEqual([
    "account-a@example.test",
  ]);
  expect(first.organizationIdentity.isOperator(actor)).toBe(true);

  vi.mocked(verifyClerkOAuth).mockResolvedValue({
    clerkUserId: "account-b",
    clientId: "client-b",
    scopes: ["workspace:read", "team:write"],
  });
  vi.mocked(resolveAccountUser).mockResolvedValue({ status: "active", userId: "user-b" });
  const second = createMcpIdentity(request, config, database);
  const other = await second.authenticate();
  expect(await second.organizationIdentity.displayName(other)).toBe("account-b");
  expect(await first.organizationIdentity.displayName(actor)).toBe("account-a");
  expect(await first.organizationIdentity.verifiedEmails(other)).toEqual([]);
  expect(second.organizationIdentity.isOperator(other)).toBe(false);
  expect(currentAccount).not.toHaveBeenCalled();
  expect(resolveGuestSession).not.toHaveBeenCalled();
});

it.each(["unauthenticated", "unavailable"] as const)(
  "preserves %s OAuth failures without using browser or guest identity",
  async (reason) => {
    vi.mocked(verifyClerkOAuth).mockRejectedValue(new AuthenticationError(reason));
    await expect(createMcpIdentity(request, config, database).authenticate()).rejects.toMatchObject(
      { reason },
    );
    expect(resolveAccountUser).not.toHaveBeenCalled();
    expect(currentAccount).not.toHaveBeenCalled();
    expect(resolveGuestSession).not.toHaveBeenCalled();
  },
);

it("rejects a disabled bearer account before making its profile or authority available", async () => {
  vi.mocked(resolveAccountUser).mockResolvedValue({ status: "disabled" });
  const identity = createMcpIdentity(request, config, database);
  await expect(identity.authenticate()).rejects.toMatchObject({ reason: "disabled" });
  expect(identity.organizationIdentity.isOperator({ userId: "user-a" })).toBe(false);
  expect(await identity.organizationIdentity.verifiedEmails({ userId: "user-a" })).toEqual([]);
});
