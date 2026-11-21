import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { AuthenticationError } from "@merit/auth";
import { verifyClerkOAuth } from "@merit/auth/clerk-oauth";
import { resolveAccountUser, resolveGuestSession } from "@merit/auth/server";
import { currentAccount } from "@merit/auth/session";
import type { Database } from "@merit/db";

import { authenticateMcp } from "./mcp.server";

vi.mock("@merit/auth/clerk-oauth", () => ({ verifyClerkOAuth: vi.fn() }));
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
});
afterEach(() => vi.resetAllMocks());

it("binds identity, client provenance and scopes to the bearer account", async () => {
  expect(await authenticateMcp(request, config, database)).toEqual({
    userId: "user-a",
    provenance: { interface: "mcp", clientId: "client-a" },
    scopes: ["workspace:read"],
  });
  expect(verifyClerkOAuth).toHaveBeenCalledExactlyOnceWith(request, config);
  expect(currentAccount).not.toHaveBeenCalled();
  expect(resolveGuestSession).not.toHaveBeenCalled();
});

it.each(["unauthenticated", "unavailable"] as const)(
  "preserves %s OAuth failures without using browser or guest identity",
  async (reason) => {
    vi.mocked(verifyClerkOAuth).mockRejectedValue(new AuthenticationError(reason));
    await expect(authenticateMcp(request, config, database)).rejects.toMatchObject({ reason });
    expect(resolveAccountUser).not.toHaveBeenCalled();
    expect(currentAccount).not.toHaveBeenCalled();
    expect(resolveGuestSession).not.toHaveBeenCalled();
  },
);

it("rejects a disabled bearer account", async () => {
  vi.mocked(resolveAccountUser).mockResolvedValue({ status: "disabled" });
  await expect(authenticateMcp(request, config, database)).rejects.toMatchObject({
    reason: "disabled",
  });
});
