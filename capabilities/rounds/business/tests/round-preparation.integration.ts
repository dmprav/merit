import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, describe, expect } from "vite-plus/test";

import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import type { RoundChange } from "@merit/rounds/domain";
import { createFundingRound, editFundingRound, deleteFundingRound } from "@merit/rounds/server";

import { noRoundApplications, noRoundCommitments, readPersistedRound } from "./persisted-round";

const create = async (db: NodePgDatabase) => {
  const result = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Neighbourhood grants",
  });

  if (result.status !== "ok") {
    throw new Error("Creation failed");
  }

  return { workspaceSlug, publicId: result.publicId };
};

type SqlClient = { query: (text: string) => Promise<unknown> };

const accessDenials: {
  denial: string;
  as: { userId: string };
  workspaceSlug?: string;
  deny: (client: SqlClient) => Promise<unknown>;
}[] = [
  {
    denial: "another workspace's manager",
    as: { userId: "birch-manager" },
    deny: async () => {},
  },
  {
    denial: "a workspace administrator without grant access",
    as: actor,
    deny: (client) =>
      client.query(
        "UPDATE memberships SET role = 'member', administration = 'administrator' WHERE user_id = 'dana'",
      ),
  },
  {
    denial: "a disabled account",
    as: actor,
    deny: (client) => client.query("UPDATE app_users SET active = false WHERE id = 'dana'"),
  },
  {
    denial: "a manager of an expired demo workspace",
    as: actor,
    deny: (client) =>
      client.query(
        "UPDATE organizations SET kind = 'demo', demo_seed_version = 1, demo_expires_at = statement_timestamp() - interval '1 minute' WHERE id = 'alder'",
      ),
  },
];

describe("funding-round preparation", () => {
  it("deletes an empty round and keeps its creation request from recreating it", async ({
    db,
    database,
  }) => {
    const request = { workspaceSlug, requestId: randomUUID(), title: "New round" };
    const created = await createFundingRound(db, actor, request);
    assert(created.status === "ok");

    expect(
      await deleteFundingRound(
        db,
        actor,
        { workspaceSlug, publicId: created.publicId, expectedRevision: 0 },
        noRoundApplications,
      ),
    ).toEqual({ status: "ok" });
    expect(await createFundingRound(db, actor, request)).toEqual({
      status: "invalid",
      error: "round_deleted",
    });
    expect((await database.client.query("SELECT id FROM funding_rounds")).rows).toEqual([]);
    expect(
      (
        await database.client.query<{ action: string }>(
          "SELECT action FROM audit_events ORDER BY target_revision",
        )
      ).rows,
    ).toEqual([{ action: "round.created" }, { action: "round.deleted" }]);
  });

  it.for(accessDenials)(
    "rejects round creation by $denial without recording it",
    async ({ as, deny }, { db, database }) => {
      await deny(database.client);

      expect(
        await createFundingRound(db, as, {
          workspaceSlug,
          requestId: randomUUID(),
          title: "New round",
        }),
      ).toEqual({ status: "not_found" });
      expect((await database.client.query("SELECT id FROM funding_rounds")).rows).toEqual([]);
      expect((await database.client.query("SELECT action FROM audit_events")).rows).toEqual([]);
    },
  );

  it.for([
    ...accessDenials,
    {
      denial: "another workspace's manager addressing it through their own workspace",
      as: { userId: "birch-manager" },
      workspaceSlug: "birch",
      deny: async () => {},
    },
  ])(
    "rejects round edits and deletion by $denial without changing the round",
    async ({ as, deny, ...denial }, { db, database }) => {
      const { publicId } = await create(db);
      const address = { workspaceSlug: denial.workspaceSlug ?? workspaceSlug, publicId };
      await deny(database.client);

      expect(
        await editFundingRound(
          db,
          as,
          {
            ...address,
            expectedRevision: 0,
            change: { section: "details", title: "Unauthorized title" },
          },
          noRoundCommitments,
        ),
      ).toEqual({ status: "not_found" });
      expect(
        await deleteFundingRound(db, as, { ...address, expectedRevision: 0 }, noRoundApplications),
      ).toEqual({ status: "not_found" });
      expect(
        (await database.client.query("SELECT title, revision FROM funding_rounds")).rows,
      ).toEqual([{ title: "Neighbourhood grants", revision: 0 }]);
      expect((await database.client.query("SELECT action FROM audit_events")).rows).toEqual([
        { action: "round.created" },
      ]);
    },
  );

  it("rejects round edits and deletion made against a stale revision", async ({ db }) => {
    const address = await create(db);
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { section: "budget", amount: "100.25", reason: "" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 1 });
    const before = await readPersistedRound(db, address.publicId);

    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { section: "details", title: "Stale", purpose: "", meetingDate: null },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "conflict" });
    expect(
      await deleteFundingRound(db, actor, { ...address, expectedRevision: 0 }, noRoundApplications),
    ).toEqual({ status: "conflict" });
    expect(await readPersistedRound(db, address.publicId)).toEqual(before);
  });

  it("requires a reason to change an established budget and records the exact change", async ({
    db,
  }) => {
    const address = await create(db);

    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { section: "budget", amount: "100.25", reason: "" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 1 });
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 1,
          change: { section: "budget", amount: "200", reason: "" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "invalid", error: "budget_reason_required" });
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 1,
          change: { section: "budget", amount: "200", reason: "Additional allocation" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 2 });

    const persisted = await readPersistedRound(db, address.publicId);

    expect(persisted.budgetHistory[0]).toMatchObject({
      actor: "Dana Reed",
      reason: "Additional allocation",
      before: { minorUnits: "10025" },
      after: { minorUnits: "20000" },
    });
  });

  it.for([
    {
      established: "during creation",
      establish: async (db: NodePgDatabase) => {
        const created = await createFundingRound(db, actor, {
          workspaceSlug,
          requestId: randomUUID(),
          title: "Budget recovery",
          budget: "0",
        });
        assert(created.status === "ok");
        return { address: { workspaceSlug, publicId: created.publicId }, revision: 0 };
      },
    },
    {
      established: "by a later edit",
      establish: async (db: NodePgDatabase) => {
        const address = await create(db);
        const edited = await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: 0,
            change: { section: "budget", amount: "100", reason: "" },
          },
          noRoundCommitments,
        );
        assert(edited.status === "ok");
        return { address, revision: edited.revision };
      },
    },
  ])(
    "requires a reason to replace a cleared budget established $established",
    async ({ establish }, { db }) => {
      const { address, revision } = await establish(db);
      const cleared = await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: revision,
          change: { section: "budget", amount: "", reason: "Awaiting allocation" },
        },
        noRoundCommitments,
      );
      assert(cleared.status === "ok");

      expect(
        await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: cleared.revision,
            change: { section: "budget", amount: "250", reason: "" },
          },
          noRoundCommitments,
        ),
      ).toEqual({ status: "invalid", error: "budget_reason_required" });
      expect(
        await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: cleared.revision,
            change: { section: "budget", amount: "", reason: "" },
          },
          noRoundCommitments,
        ),
      ).toEqual({ status: "ok", revision: cleared.revision });
      expect(
        await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: cleared.revision,
            change: { section: "budget", amount: "250", reason: "Replacement approved" },
          },
          noRoundCommitments,
        ),
      ).toEqual({ status: "ok", revision: cleared.revision + 1 });

      const persisted = await readPersistedRound(db, address.publicId);

      expect(persisted.budgetHistory[0]).toMatchObject({
        reason: "Replacement approved",
        before: null,
        after: { minorUnits: "25000" },
      });
    },
  );

  it("does not advance revisions or record history for unchanged saves", async ({
    db,
    database,
  }) => {
    const address = await create(db);
    for (const change of [
      { section: "details", title: "Neighbourhood grants", purpose: "", meetingDate: null },
      { section: "criteria", criteria: [] },
      { section: "manager", userId: "dana" },
      { section: "budget", amount: "", reason: "" },
    ] satisfies RoundChange[]) {
      expect(
        await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: 0,
            change: { ...change },
          },
          noRoundCommitments,
        ),
      ).toEqual({ status: "ok", revision: 0 });
    }

    await editFundingRound(
      db,
      actor,
      {
        ...address,
        expectedRevision: 0,
        change: { section: "budget", amount: "100", reason: "" },
      },
      noRoundCommitments,
    );

    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 1,
          change: { section: "budget", amount: "100.00", reason: "Unnecessary reason" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 1 });
    expect(
      (
        await database.client.query<{ action: string }>(
          "SELECT action FROM audit_events ORDER BY target_revision",
        )
      ).rows,
    ).toEqual([{ action: "round.created" }, { action: "round.budget_changed" }]);
  });

  it("rejects responsibility for a manager from another workspace without changing the round", async ({
    db,
  }) => {
    const address = await create(db);

    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { section: "manager", userId: "birch-manager" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "invalid", error: "manager_unavailable" });

    expect(await readPersistedRound(db, address.publicId)).toMatchObject({
      round: { revision: 0, managerUserId: "dana", managerName: "Dana Reed" },
    });
  });

  const composerRound = {
    workspaceSlug,
    title: "Composer round",
    purpose: "Shared local work",
    budget: "0.00",
    meetingDate: "2027-03-15",
  };

  it.for([
    { problem: "an invalid meeting date", change: { meetingDate: "2027-02-30" } },
    { problem: "a negative budget", change: { budget: "-1" } },
  ])(
    "rejects round creation with $problem without writing",
    async ({ change }, { db, database }) => {
      expect(
        await createFundingRound(db, actor, {
          ...composerRound,
          requestId: randomUUID(),
          ...change,
        }),
      ).toMatchObject({ status: "invalid" });
      expect((await database.client.query("SELECT id FROM funding_rounds")).rows).toEqual([]);
      expect((await database.client.query("SELECT action FROM audit_events")).rows).toEqual([]);
    },
  );

  it("returns the original round when a creation request is retried with changed details", async ({
    db,
    database,
  }) => {
    const request = { ...composerRound, requestId: randomUUID() };
    const created = await createFundingRound(db, actor, request);
    assert(created.status === "ok");

    expect(await createFundingRound(db, actor, { ...request, purpose: "Changed retry" })).toEqual(
      created,
    );
    expect((await database.client.query("SELECT purpose FROM funding_rounds")).rows).toEqual([
      { purpose: request.purpose },
    ]);
  });

  it("persists optional round details supplied at creation", async ({ db }) => {
    const created = await createFundingRound(db, actor, {
      ...composerRound,
      requestId: randomUUID(),
    });
    assert(created.status === "ok");

    const persisted = await readPersistedRound(db, created.publicId);

    expect(persisted.round).toMatchObject({
      title: "Composer round",
      purpose: composerRound.purpose,
      meetingDate: composerRound.meetingDate,
      managerUserId: "dana",
      decisionStatus: "Preparing",
    });
    expect(persisted.round?.budgetMinorUnits).toBe("0");
    expect(persisted.round?.revision).toBe(0);
    expect(persisted.budgetHistory).toMatchObject([
      { action: "round.created", reason: null, before: null, after: { minorUnits: "0" } },
    ]);
  });

  it("retains IDs through renaming and reordering criteria with duplicate titles", async ({
    db,
  }) => {
    const address = await create(db);
    const first = { id: randomUUID(), title: "Fit", description: "Purpose" };
    const second = { id: randomUUID(), title: "Fit", description: "Participation" };
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { section: "criteria", criteria: [first, second] },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 1 });
    const renamed = { ...first, title: "Purpose" };
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 1,
          change: { section: "criteria", criteria: [second, renamed] },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 2 });
    const persisted = await readPersistedRound(db, address.publicId);
    expect(persisted.criteria).toMatchObject({
      criteria: [second, renamed],
      criteriaHistory: [
        { version: 1, criteria: [] },
        { version: 2, criteria: [first, second] },
        { version: 3, criteria: [second, renamed] },
      ],
    });
  });

  it("rejects stale Tier 1 edits when requireCurrentRevision is set for Undo", async ({ db }) => {
    const address = await create(db);
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          change: { section: "details", title: "Spring grants" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 1 });
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          change: { section: "details", title: "Autumn grants" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 2 });

    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 1,
          requireCurrentRevision: true,
          change: { section: "details", title: "Composer round" },
        },
        noRoundCommitments,
      ),
    ).toEqual({ status: "conflict" });

    const persisted = await readPersistedRound(db, address.publicId);
    expect(persisted.round?.title).toBe("Autumn grants");
  });
});
