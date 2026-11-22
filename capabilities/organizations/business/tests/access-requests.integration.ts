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
      isOperator: async (actor) => actor.userId === "dana",
      verifiedEmails: async () => [],
      sendInvitation,
      invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.example.test").href,
      networkAddress,
    }),
  };
};

const operator = { userId: "dana" };
const email = "interested@example.test";

it("stores repeated public interest once under the normalized email", async ({ database }) => {
  const { operations } = service(database.connectionString);

  expect(await operations.requestAccess({ email: " Interested@Example.test " })).toEqual({
    status: "ok",
  });
  expect(await operations.requestAccess({ email })).toEqual({ status: "ok" });

  expect(await operations.accessRequests(operator)).toMatchObject({
    status: "ok",
    value: { requests: [{ email, reviewedAt: null, reviewedBy: null }], nextCursor: null },
  });
});

it("rejects an invalid email without storing a request", async ({ database }) => {
  const { operations } = service(database.connectionString);

  expect(await operations.requestAccess({ email: "invalid" })).toEqual({ status: "invalid_input" });
  expect(await operations.accessRequests(operator)).toEqual({
    status: "ok",
    value: { requests: [], nextCursor: null },
  });
});

it("restricts reading and reviewing access requests to operators", async ({ database }) => {
  const { operations } = service(database.connectionString);
  await operations.requestAccess({ email });
  const workspaceOwner = { userId: "birch-manager" };

  expect(await operations.accessRequests(workspaceOwner)).toEqual({ status: "forbidden" });
  expect(await operations.reviewAccessRequest(workspaceOwner, { email })).toEqual({
    status: "forbidden",
  });
  expect(await operations.accessRequests(operator)).toMatchObject({
    status: "ok",
    value: { requests: [{ email, reviewedAt: null }], nextCursor: null },
  });
});

it("records an operator's review once and keeps it when the person asks again", async ({
  database,
}) => {
  const { operations } = service(database.connectionString);
  await operations.requestAccess({ email });

  const reviewed = await operations.reviewAccessRequest(operator, { email });

  assert(reviewed.status === "ok");
  expect(reviewed.value).toMatchObject({ email, reviewedBy: operator.userId });
  expect(reviewed.value.reviewedAt).toBeInstanceOf(Date);
  expect(await operations.reviewAccessRequest(operator, { email })).toEqual(reviewed);
  expect(await operations.requestAccess({ email })).toEqual({ status: "ok" });
  expect(await operations.accessRequests(operator)).toEqual({
    status: "ok",
    value: { requests: [reviewed.value], nextCursor: null },
  });
});

it("pages all requests with unreviewed first and breaks exact timestamp ties by email", async ({
  database,
}) => {
  const { operations } = service(database.connectionString);
  await database.client.query(`
    INSERT INTO access_requests(email, requested_at, reviewed_at) VALUES
      ('c@example.test', '2026-11-01T10:00:00.000001Z', NULL),
      ('a@example.test', '2026-11-01T10:00:00.000002Z', NULL),
      ('b@example.test', '2026-11-01T10:00:00.000002Z', NULL),
      ('d@example.test', '2026-11-02T10:00:00Z', now())
  `);
  const emails = [];
  let page = await operations.accessRequests(operator, { limit: 1 });
  for (;;) {
    assert(page.status === "ok");
    expect(page.value.requests).toHaveLength(1);
    emails.push(page.value.requests[0]?.email);
    if (!page.value.nextCursor) {
      break;
    }
    expect(emails.length).toBeLessThan(4);
    page = await operations.accessRequests(operator, { limit: 1, after: page.value.nextCursor });
  }
  expect(emails).toEqual(["a@example.test", "b@example.test", "c@example.test", "d@example.test"]);
});

it("rejects a page size above the access-request limit", async ({ database }) => {
  const { operations } = service(database.connectionString);
  expect(await operations.accessRequests(operator, { limit: 51 })).toEqual({
    status: "invalid_input",
  });
});

it("neither invites nor admits a person who requests access", async ({ database }) => {
  const { operations, sendInvitation } = service(database.connectionString);

  const memberships = () =>
    database.client.query<{ user_id: string }>("SELECT user_id FROM memberships ORDER BY user_id");

  const before = (await memberships()).rows;

  await operations.requestAccess({ email });
  await operations.reviewAccessRequest(operator, { email });

  expect(sendInvitation).not.toHaveBeenCalled();
  expect((await memberships()).rows).toEqual(before);
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
