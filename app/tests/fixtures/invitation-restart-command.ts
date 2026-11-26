import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { text } from "node:stream/consumers";

import { createDatabasePool } from "@merit/db";

import { createApplicationServices } from "../../src/server/services.server";

const databaseUrl = process.env.DATABASE_URL;
assert(databaseUrl);
const { organizations } = createApplicationServices({
  database: createDatabasePool(databaseUrl),
  identity: {
    isOperator: async (actor) => actor.userId === "operator",
    verifiedEmails: async (actor) => [`${actor.userId}@example.test`],
    displayName: async (actor) => actor.userId,
  },
  startReviewerMessage: async () => false,
  // The process ends at the post-commit boundary, before it can contact Temporal.
  startOrganizationInvitation: () => process.exit(75),
});

if (process.argv[2] === "issue") {
  await organizations.create(
    { userId: "operator" },
    {
      requestId: randomUUID(),
      name: "Restart Foundation",
      slug: "restart-foundation",
      email: "recipient@example.test",
    },
  );
  throw new Error("The invitation command never reached the workflow start.");
} else {
  assert.equal(process.argv[2], "accept");
  const accepted = await organizations.accept(
    { userId: "recipient" },
    { token: await text(process.stdin) },
  );
  assert.equal(accepted.status, "ok");
}
