import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import type { Database } from "@merit/db";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound, deleteFundingRound, editFundingRound } from "@merit/rounds/server";

import { noRoundApplications, noRoundCommitments, readPersistedRound } from "./persisted-round";
import { roundTest as it } from "./round-test";

const edit = (db: Database, publicId: string) =>
  editFundingRound(
    db,
    actor,
    {
      workspaceSlug,
      publicId,
      expectedRevision: 0,
      change: { section: "details", title: "Updated round", purpose: "", meetingDate: null },
    },
    noRoundCommitments,
  );

const create = (db: Database, requestId = randomUUID()) =>
  createFundingRound(db, actor, { workspaceSlug, requestId, title: "Concurrent grant work" });

it("serializes competing round edits and rejects the stale revision", async ({ rounds, locks }) => {
  const update = (db: Database) => edit(db, rounds.pageInput.publicId);

  expect(await locks.race(update, update)).toEqual({ status: "conflict" });
});

it("allows editing one round while another round has an uncommitted edit", async ({
  db,
  rounds,
  locks,
}) => {
  const created = await create(db);
  assert(created.status === "ok");
  const commit = await locks.hold((tx) => edit(tx, rounds.pageInput.publicId));
  expect(await edit(locks.second, created.publicId)).toMatchObject({ status: "ok" });
  expect((await readPersistedRound(db, rounds.pageInput.publicId)).round?.title).toBe(
    "Community grants",
  );
  await commit();
});

it("deletes an empty round while another round has an uncommitted edit", async ({
  db,
  rounds,
  locks,
}) => {
  const empty = await create(db);
  assert(empty.status === "ok");
  const commit = await locks.hold((tx) => edit(tx, rounds.pageInput.publicId));
  expect(
    await deleteFundingRound(
      locks.second,
      actor,
      {
        workspaceSlug,
        publicId: empty.publicId,
        expectedRevision: 0,
      },
      noRoundApplications,
    ),
  ).toEqual({ status: "ok" });
  await commit();
});

it("locks the existing round before the actor on a creation retry", async ({
  db,
  database,
  locks,
}) => {
  const requestId = randomUUID();
  const created = await create(db, requestId);
  assert(created.status === "ok");

  const commit = await locks.hold(async (tx) => {
    await tx.execute(sql`SELECT id FROM funding_rounds WHERE id = ${created.publicId} FOR UPDATE`);
    return { status: "ok" };
  });
  const retry = await locks.finishBlocked(create(locks.second, requestId), async () => {
    // The retry is waiting for its round. Its actor's membership must still be free.
    const probe = await database.client.query(
      "SELECT id FROM memberships WHERE organization_id = $1 AND user_id = $2 FOR UPDATE NOWAIT",
      [workspaceSlug, actor.userId],
    );
    expect(probe.rowCount).toBe(1);
    await commit();
  });
  expect(retry).toEqual(created);
});

it("keeps round creation retries serialized", async ({ locks }) => {
  const requestId = randomUUID();
  let publicId: string | undefined;
  const replay = await locks.race(
    async (tx) => {
      const result = await create(tx, requestId);
      assert(result.status === "ok");
      publicId = result.publicId;
      return result;
    },
    (second) => create(second, requestId),
  );
  expect(replay).toEqual({ status: "ok", publicId });
});
