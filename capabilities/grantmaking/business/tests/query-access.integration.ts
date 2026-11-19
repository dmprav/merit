import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { createFundingApplication, selectApplicationContact } from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import type { Database } from "@merit/db";
import type { GrantmakingQueries } from "@merit/grantmaking/api";
import { createGrantmakingService, getFundingRoundOverview } from "@merit/grantmaking/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

type Records = { roundId: string; applicationId: string; contactId: string };

type Query = (service: GrantmakingQueries, records: Records) => Promise<unknown>;

const placeholders: Records = {
  roundId: "000000000001",
  applicationId: "000000000001",
  contactId: randomUUID(),
};

const round = ({ roundId }: Records) => ({ workspaceSlug, roundId });

const application = ({ applicationId }: Records) => ({ workspaceSlug, applicationId });

const notFound = { status: "not_found" };

const forbidden = { status: "forbidden" };

// Each read with the result it returns to a workspace member without grant access.
const queries: [string, Query, unknown][] = [
  ["round list", (service) => service.listRounds(actor, workspaceSlug), forbidden],
  [
    "workspace applications",
    (service) => service.listWorkspaceApplications(actor, { workspaceSlug }),
    forbidden,
  ],
  [
    "workspace search",
    (service) => service.searchWorkspace(actor, { workspaceSlug, query: "community" }),
    forbidden,
  ],
  [
    "round page",
    (service, { roundId }) =>
      service.readRoundPage(actor, { workspaceSlug, publicId: roundId, kind: "round" }),
    null,
  ],
  [
    "application page",
    (service, { applicationId }) =>
      service.readApplicationPage(actor, { workspaceSlug, publicId: applicationId }),
    null,
  ],
  ["round summaries", (service) => service.listRoundSummaries(actor, { workspaceSlug }), forbidden],
  ["round overview", (service, ids) => service.readRound(actor, round(ids)), notFound],
  ["applications", (service, ids) => service.listApplications(actor, round(ids)), notFound],
  [
    "application context",
    (service, ids) => service.readApplication(actor, application(ids)),
    notFound,
  ],
  [
    "round content",
    (service, ids) => service.roundContent(actor, { ...round(ids), section: "details" }),
    notFound,
  ],
  [
    "application content",
    (service, ids) =>
      service.applicationContent(actor, { ...application(ids), section: "details" }),
    notFound,
  ],
  ["round history", (service, ids) => service.roundHistory(actor, round(ids)), notFound],
  [
    "application history",
    (service, ids) => service.applicationHistory(actor, { ...application(ids), history: "intake" }),
    notFound,
  ],
  [
    "contact applications",
    (service, { contactId }) =>
      service.listContactApplications(actor, { workspaceSlug, contactId }),
    notFound,
  ],
  ["reviews", (service, ids) => service.listReviews(actor, application(ids)), notFound],
];

for (const [name, query] of queries) {
  it(`PostgreSQL rejects writes during an independent ${name} query`, async ({ db }) => {
    // Inject an accidental persistence write into the actual transaction used by the query.
    const transaction: Database["transaction"] = (read, options) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`update organizations set name = name where false`);
        return read(tx);
      }, options);

    const guarded = new Proxy(db, {
      get(target, property, receiver): unknown {
        return property === "transaction" ? transaction : Reflect.get(target, property, receiver);
      },
    });
    const service = createGrantmakingService({
      database: (operation) => operation(guarded),
    });

    await expect(query(service, placeholders)).rejects.toMatchObject({ cause: { code: "25006" } });
  });
}

it("queries share a caller-owned transaction without committing its pending changes", async ({
  db,
}) => {
  let roundId = "";
  const rollback = new Error("Roll back the caller's work");
  await expect(
    db.transaction(async (tx) => {
      const created = await createFundingRound(tx, actor, {
        workspaceSlug,
        requestId: randomUUID(),
        title: "Uncommitted round",
      });
      assert(created.status === "ok");
      roundId = created.publicId;
      expect(await getFundingRoundOverview(tx, actor, { workspaceSlug, roundId })).toMatchObject({
        status: "ok",
        round: { title: "Uncommitted round" },
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);

  expect(await getFundingRoundOverview(db, actor, { workspaceSlug, roundId })).toEqual({
    status: "not_found",
  });
});

const createReadableRecords = async (db: Database): Promise<Records> => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Community grants",
  });
  assert(round.status === "ok");
  const application = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Community meals",
  });
  assert(application.status === "ok");
  const contact = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug,
      contactId: randomUUID(),
      action: "create",
      details: { name: "Leah Martin", email: "leah@example.test", affiliation: "" },
    },
    fundingRoundContactUsage,
  );
  assert(contact.status === "ok");
  const linked = await selectApplicationContact(db, actor, {
    workspaceSlug,
    publicId: application.publicId,
    expectedRevision: 0,
    contactId: contact.contact.id,
  });
  assert(linked.status === "ok");
  return {
    roundId: round.publicId,
    applicationId: application.publicId,
    contactId: contact.contact.id,
  };
};

for (const [name, query, denied] of queries) {
  it(`denies the ${name} query to a workspace member without grant access`, async ({
    db,
    database,
  }) => {
    const records = await createReadableRecords(db);
    const service = createGrantmakingService({ database: (operation) => operation(db) });
    expect(await query(service, records)).not.toEqual(denied);

    await database.client.query(
      "UPDATE memberships SET role = 'member' WHERE organization_id = 'alder' AND user_id = 'dana'",
    );

    expect(await query(service, records)).toEqual(denied);
  });
}
