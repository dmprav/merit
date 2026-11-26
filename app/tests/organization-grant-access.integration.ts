import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vite-plus/test";

import { withDatabase } from "@merit/db";
import { migrate } from "@merit/db/migrate";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { createInlineOrganizationService } from "@merit/organizations/server/testing";
import { revokeMembershipReviews } from "@merit/reviews/server/integrations";
import { createTestDatabase } from "@merit/test-support/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;

const service = (emails = ["recipient@example.test"]) =>
  createInlineOrganizationService({
    revokeReviewAccess: revokeMembershipReviews,
    database: (operation) => withDatabase(database.connectionString, operation),
    isOperator: async (actor) => actor.userId === "operator",
    verifiedEmails: async () => emails,
    sendInvitation: async () => {},
    invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.example.test").href,
  });

beforeAll(async () => {
  database = await createTestDatabase();
  await migrate(database.client);
});
afterAll(async () => {
  await database.dispose();
});
beforeEach(async () => {
  await database.client.query("TRUNCATE organizations, app_users CASCADE");
  await database.client.query(
    "INSERT INTO app_users(id, clerk_user_id, name) SELECT value, value, value FROM unnest($1::text[]) value",
    [["another-recipient", "colleague", "operator", "recipient", "wrong"]],
  );
});

describe("organization provisioning", () => {
  it("does not issue another provisioning invitation for a seeded owner", async () => {
    await withDatabase(database.connectionString, seedExampleRounds);

    expect(await service().read({ userId: "operator" }, { organizationId: "alder" })).toMatchObject(
      {
        status: "ok",
        value: { hasOwner: true, owner: { name: "Dana Reed" }, invitation: null },
      },
    );
    expect(
      await service().invite(
        { userId: "operator" },
        { organizationId: "alder", email: "next@example.test" },
      ),
    ).toEqual({ status: "already_joined" });
  });
});
