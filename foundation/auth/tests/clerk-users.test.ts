import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createClerkProfileReader } from "@merit/auth/clerk-users";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@clerk/backend", () => ({ createClerkClient: () => ({ users: { getUser } }) }));

const profile = {
  banned: false,
  locked: false,
  firstName: "Dana",
  lastName: "Reed",
  username: "dana",
  emailAddresses: [
    { emailAddress: "Dana@Example.test", verification: { status: "verified" } },
    { emailAddress: "unverified@example.test", verification: { status: "unverified" } },
    { emailAddress: "unknown@example.test", verification: null },
  ],
};

beforeEach(() => getUser.mockReset());

describe("Clerk account profiles", () => {
  it("shares one provider snapshot across concurrent email and name projections in a request", async () => {
    getUser.mockResolvedValue(profile);
    const read = createClerkProfileReader("test-secret");
    const [emails, name] = await Promise.all([
      read("account").then((user) => user.verifiedEmails),
      read("account").then((user) => user.displayName),
    ]);

    expect(emails).toEqual(["dana@example.test"]);
    expect(name).toBe("Dana Reed");
    expect(getUser).toHaveBeenCalledExactlyOnceWith("account");
  });

  it("keeps accounts and requests separate so profile changes are observed", async () => {
    getUser.mockResolvedValueOnce(profile).mockResolvedValue({ ...profile, firstName: "Updated" });
    const firstRequest = createClerkProfileReader("test-secret");
    expect((await firstRequest("first")).displayName).toBe("Dana Reed");
    expect((await firstRequest("second")).displayName).toBe("Updated Reed");
    expect((await createClerkProfileReader("test-secret")("first")).displayName).toBe(
      "Updated Reed",
    );
    expect(getUser.mock.calls).toEqual([["first"], ["second"], ["first"]]);
  });

  it.each(["banned", "locked"])(
    "does not return verified emails for a %s account",
    async (flag) => {
      getUser.mockResolvedValue({ ...profile, [flag]: true });
      expect((await createClerkProfileReader("test-secret")("account")).verifiedEmails).toEqual([]);
    },
  );

  it.each([
    { firstName: "Dana", lastName: null, username: "dana", expected: "Dana" },
    { firstName: null, lastName: "Reed", username: "dana", expected: "Reed" },
    { firstName: null, lastName: null, username: "dana", expected: "dana" },
    { firstName: null, lastName: null, username: null, expected: null },
  ])("uses the available display name: $expected", async ({ expected, ...names }) => {
    getUser.mockResolvedValue({ ...profile, ...names });
    expect((await createClerkProfileReader("test-secret")("account")).displayName).toBe(expected);
  });

  it("propagates provider failures and allows a new request to retry", async () => {
    const failure = new Error("Provider unavailable");
    getUser.mockRejectedValueOnce(failure).mockResolvedValue(profile);
    const read = createClerkProfileReader("test-secret");
    await expect(read("account")).rejects.toBe(failure);
    await expect(read("account")).rejects.toBe(failure);
    expect(getUser).toHaveBeenCalledOnce();
    expect((await createClerkProfileReader("test-secret")("account")).verifiedEmails).toEqual([
      "dana@example.test",
    ]);
  });
});
