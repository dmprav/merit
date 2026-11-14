import { assert, expect, vi } from "vite-plus/test";

import { withDatabase } from "@merit/db";
import { createOrganizationService } from "@merit/organizations/server";
import { workspaceTest as it } from "@merit/organizations/testing/workspace";

const service = (connection: string, networkAddress: string | undefined = "192.0.2.1") => {
  const sendInvitation = vi.fn().mockResolvedValue(undefined);

  return {
    sendInvitation,
    operations: createOrganizationService({
      revokeReviewAccess: async () => {},
      database: (operation) => withDatabase(connection, operation),
      isOperator: (actor) => actor.userId === "dana",
      verifiedEmails: async () => [],
      sendInvitation,
      invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.example.test").href,
      networkAddress,
    }),
  };
};

it("stores normalized public interest once and restricts reading and review to operators", async ({
  database,
}) => {
  const { operations, sendInvitation } = service(database.connectionString);

  expect(await operations.requestAccess({ email: " Interested@Example.test " })).toEqual({
    status: "ok",
  });
  expect(await operations.requestAccess({ email: "interested@example.test" })).toEqual({
    status: "ok",
  });
  expect(await operations.requestAccess({ email: "invalid" })).toEqual({ status: "invalid_input" });

  const denied = { userId: "birch-manager" };

  expect(await operations.accessRequests(denied)).toEqual({ status: "forbidden" });
  expect(
    await operations.reviewAccessRequest(denied, { email: "interested@example.test" }),
  ).toEqual({ status: "forbidden" });

  const actor = { userId: "dana" };
  const list = await operations.accessRequests(actor);

  if (list.status !== "ok") {
    throw new Error("Read failed");
  }
  expect(list.value).toHaveLength(1);
  expect(list.value[0]).toMatchObject({ email: "interested@example.test", reviewedAt: null });

  const reviewed = await operations.reviewAccessRequest(actor, {
    email: "interested@example.test",
  });

  expect(reviewed).toMatchObject({
    status: "ok",
    value: { reviewedBy: "dana" },
  });
  assert.equal(reviewed.status, "ok");
  if (reviewed.status !== "ok") {
    throw new Error("Review failed");
  }
  expect(reviewed.value.reviewedAt).toBeInstanceOf(Date);
  expect(await operations.reviewAccessRequest(actor, { email: "interested@example.test" })).toEqual(
    reviewed,
  );
  expect(await operations.requestAccess({ email: "interested@example.test" })).toEqual({
    status: "ok",
  });
  expect(await operations.accessRequests(actor)).toMatchObject({
    status: "ok",
    value: [expect.objectContaining({ reviewedBy: "dana" })],
  });
  expect(sendInvitation).not.toHaveBeenCalled();
  expect(
    (
      await database.client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM memberships",
      )
    ).rows[0]?.count,
  ).toBe(2);
});

it("shares request limits across concurrent connections and removes expired buckets", async ({
  database,
}) => {
  await database.client.query("TRUNCATE access_request_limits");
  const { operations } = service(database.connectionString);
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      operations.requestAccess({ email: `person${i}@example.test` }),
    ),
  );

  expect(results.filter((result) => result.status === "ok")).toHaveLength(10);
  expect(results.filter((result) => result.status === "limited")).toHaveLength(2);

  const buckets = (
    await database.client.query<{ key: string }>("SELECT key FROM access_request_limits")
  ).rows;

  expect(buckets).toHaveLength(1);
  expect(buckets[0]?.key).toMatch(/^[a-f0-9]{64}$/);
  expect(
    await service(database.connectionString, "192.0.2.2").operations.requestAccess({
      email: "another@example.test",
    }),
  ).toEqual({ status: "ok" });

  await database.client.query(
    "UPDATE access_request_limits SET expires_at = now() - interval '1 hour'",
  );

  expect(await operations.requestAccess({ email: "after-expiry@example.test" })).toEqual({
    status: "ok",
  });
  expect(
    (
      await database.client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM access_request_limits",
      )
    ).rows[0]?.count,
  ).toBe(1);
});

it("fails closed when the host provides no trusted network address", async ({ database }) => {
  const { operations } = service(database.connectionString, "");

  expect(await operations.requestAccess({ email: "visitor@example.test" })).toEqual({
    status: "unavailable",
  });
});
