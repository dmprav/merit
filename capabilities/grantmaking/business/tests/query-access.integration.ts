import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import type { Database } from "@merit/db";
import type { GrantmakingQueries } from "@merit/grantmaking/api";
import { createGrantmakingService, getFundingRoundOverview } from "@merit/grantmaking/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

const publicId = "000000000001";
const round = { workspaceSlug, roundId: publicId };
const application = { workspaceSlug, applicationId: publicId };
const queries: [string, (service: GrantmakingQueries) => Promise<unknown>][] = [
  ["round list", (service) => service.listRounds(actor, workspaceSlug)],
  ["workspace applications", (service) => service.listWorkspaceApplications(actor, workspaceSlug)],
  [
    "round page",
    (service) => service.readRoundPage(actor, { workspaceSlug, publicId, kind: "round" }),
  ],
  [
    "application page",
    (service) => service.readApplicationPage(actor, { workspaceSlug, publicId }),
  ],
  ["round summaries", (service) => service.listRoundSummaries(actor, { workspaceSlug })],
  ["round overview", (service) => service.readRound(actor, round)],
  ["applications", (service) => service.listApplications(actor, round)],
  ["application context", (service) => service.readApplication(actor, application)],
  ["round content", (service) => service.roundContent(actor, { ...round, section: "details" })],
  [
    "application content",
    (service) => service.applicationContent(actor, { ...application, section: "details" }),
  ],
  ["round history", (service) => service.roundHistory(actor, round)],
  [
    "application history",
    (service) => service.applicationHistory(actor, { ...application, history: "intake" }),
  ],
  [
    "contact applications",
    (service) => service.listContactApplications(actor, { workspaceSlug, contactId: randomUUID() }),
  ],
  ["reviews", (service) => service.listReviews(actor, application)],
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

    await expect(query(service)).rejects.toMatchObject({ cause: { code: "25006" } });
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
