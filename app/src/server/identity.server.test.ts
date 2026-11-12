import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { createClerkProfileReader } from "@merit/auth/clerk-users";
import { resolveAccountUser, resolveGuestSession } from "@merit/auth/server";
import { currentAccount } from "@merit/auth/session";
import type { Database } from "@merit/db";

import { createWebIdentity } from "./identity.server";

vi.mock("@merit/auth/server", () => ({
  resolveAccountUser: vi.fn(),
  resolveGuestSession: vi.fn(),
}));
vi.mock("@merit/auth/session", () => ({ currentAccount: vi.fn() }));
vi.mock("@merit/auth/clerk-users", () => ({ createClerkProfileReader: vi.fn() }));

const database = async <T>(operation: (db: Database) => Promise<T>) => operation({} as Database);

const options = {
  database,
  clerk: { secretKey: "secret", publishableKey: "key", browserPublishableKey: "key" },
  operatorUserIds: " other, account-a ",
  guestToken: "guest-token",
};
const actor = { userId: "user-a" };

beforeEach(() => {
  vi.mocked(currentAccount).mockResolvedValue({
    status: "authenticated",
    clerkUserId: "account-a",
  });
  vi.mocked(resolveAccountUser).mockResolvedValue({ status: "active", userId: actor.userId });
  vi.mocked(resolveGuestSession).mockResolvedValue({ userId: "guest", expiresAt: new Date() });
  vi.mocked(createClerkProfileReader).mockReturnValue(async (id) => ({
    verifiedEmails: [`${id}@example.test`],
    displayName: id,
  }));
});
afterEach(() => vi.resetAllMocks());

it("resolves lazily once per request and binds profile and operator access to that actor", async () => {
  const session = createWebIdentity(options);
  expect(currentAccount).not.toHaveBeenCalled();

  const [identity, emails, name] = await Promise.all([
    session.currentIdentity(),
    session.organizationIdentity.verifiedEmails(actor),
    session.organizationIdentity.displayName(actor),
  ]);

  expect(identity).toEqual({ status: "authenticated", actor });
  expect(emails).toEqual(["account-a@example.test"]);
  expect(name).toBe("account-a");
  expect(session.organizationIdentity.isOperator(actor)).toBe(true);
  expect(await session.isGuest()).toBe(false);
  expect(currentAccount).toHaveBeenCalledOnce();
  expect(resolveGuestSession).not.toHaveBeenCalled();
  expect(await session.organizationIdentity.verifiedEmails({ userId: "other" })).toEqual([]);
  expect(session.organizationIdentity.isOperator({ userId: "other" })).toBe(false);

  vi.mocked(currentAccount).mockResolvedValue({
    status: "authenticated",
    clerkUserId: "account-b",
  });
  vi.mocked(resolveAccountUser).mockResolvedValue({ status: "active", userId: "user-b" });
  const next = createWebIdentity(options);
  expect(await next.currentIdentity()).toEqual({
    status: "authenticated",
    actor: { userId: "user-b" },
  });
  expect(await session.currentIdentity()).toEqual(identity);
  expect(next.organizationIdentity.isOperator({ userId: "user-b" })).toBe(false);
});

it.each([
  { secretKey: "", publishableKey: "key", browserPublishableKey: "key" },
  { secretKey: "secret", publishableKey: "", browserPublishableKey: "" },
])("does not fall back to a guest for incomplete Clerk configuration: %j", async (clerk) => {
  const session = createWebIdentity({ ...options, clerk });
  expect(await session.currentIdentity()).toEqual({ status: "unavailable" });
  expect(await session.isGuest()).toBe(false);
  expect(currentAccount).not.toHaveBeenCalled();
  expect(resolveGuestSession).not.toHaveBeenCalled();
});

it("keeps provider failures and disabled accounts unavailable even with a valid guest cookie", async () => {
  vi.mocked(currentAccount).mockRejectedValueOnce(new Error("provider failed"));
  expect(await createWebIdentity(options).currentIdentity()).toEqual({ status: "unavailable" });

  vi.mocked(resolveAccountUser).mockResolvedValueOnce({ status: "disabled" });
  const disabled = createWebIdentity(options);
  expect(await disabled.currentIdentity()).toEqual({ status: "unavailable" });
  expect(disabled.organizationIdentity.isOperator(actor)).toBe(false);
  expect(await disabled.organizationIdentity.verifiedEmails(actor)).toEqual([]);
  expect(resolveGuestSession).not.toHaveBeenCalled();
});

it("resolves guest sessions when signed out, including when Clerk is unconfigured", async () => {
  vi.mocked(currentAccount).mockResolvedValue({ status: "signed_out" });
  const session = createWebIdentity(options);
  expect(await session.currentIdentity()).toEqual({
    status: "authenticated",
    actor: { userId: "guest" },
  });
  expect(await session.isGuest()).toBe(true);
  expect(await session.organizationIdentity.verifiedEmails({ userId: "guest" })).toEqual([]);
  expect(session.organizationIdentity.isOperator({ userId: "guest" })).toBe(false);

  const anonymous = createWebIdentity({ ...options, clerk: { secretKey: "", publishableKey: "" } });
  expect(await anonymous.isGuest()).toBe(true);
  expect(currentAccount).toHaveBeenCalledOnce();

  vi.mocked(resolveGuestSession).mockResolvedValue(null);
  expect(await createWebIdentity(options).currentIdentity()).toEqual({ status: "signed_out" });
});

it("uses explicit local identity and profile inputs without consulting Clerk", async () => {
  const localProfile = { verifiedEmails: ["fixture@example.test"], displayName: "Fixture" };
  const manager = createWebIdentity({
    ...options,
    localIdentity: { status: "authenticated", actor },
    localProfile,
  });
  expect(await manager.currentIdentity()).toEqual({ status: "authenticated", actor });
  expect(await manager.organizationIdentity.verifiedEmails(actor)).toEqual(
    localProfile.verifiedEmails,
  );
  expect(manager.organizationIdentity.isOperator(actor)).toBe(false);

  const operator = createWebIdentity({
    ...options,
    localActor: { clerkUserId: "fixture", operator: true },
    localProfile,
  });
  await operator.currentIdentity();
  expect(operator.organizationIdentity.isOperator(actor)).toBe(true);
  expect(await operator.organizationIdentity.displayName(actor)).toBe("Fixture");
  expect(currentAccount).not.toHaveBeenCalled();
});
