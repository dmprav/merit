import { assert, beforeAll, afterAll, beforeEach, describe, it, expect } from "vite-plus/test";

import { withDatabase } from "@merit/db";
import { migrate } from "@merit/db/migrate";
import { getFundingRoundPage, listFundingRounds } from "@merit/grantmaking/server";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { createOrganizationService } from "@merit/organizations/server";
import { revokeMembershipReviews } from "@merit/reviews/server/integrations";
import { createTestDatabase } from "@merit/test-support/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;

const service = (emails = ["recipient@example.test"]) =>
  createOrganizationService({
    revokeReviewAccess: revokeMembershipReviews,
    database: (operation) => withDatabase(database.connectionString, operation),
    isOperator: (actor) => actor.userId === "operator",
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

  it("separates administration from grant access", async () => {
    await withDatabase(database.connectionString, seedExampleRounds);
    await database.client.query(
      "UPDATE memberships SET administration='administrator', role='member' WHERE user_id='dana'",
    );
    const actor = { userId: "dana" };
    const rounds = await withDatabase(database.connectionString, (db) =>
      listFundingRounds(db, actor, "alder"),
    );

    expect(rounds).toEqual({ status: "forbidden" });
    expect((await service().workspaces({ userId: "dana" })).status).toBe("ok");
    const birch = await withDatabase(database.connectionString, (db) =>
      listFundingRounds(db, { userId: "birch-manager" }, "birch"),
    );
    assert(birch.status === "ok");
    const [round] = birch.rounds;
    assert.isDefined(round);

    expect(
      await withDatabase(database.connectionString, (db) =>
        getFundingRoundPage(db, actor, {
          workspaceSlug: "birch",
          publicId: round.publicId,
          kind: "round",
        }),
      ),
    ).toBeNull();
  });
});
