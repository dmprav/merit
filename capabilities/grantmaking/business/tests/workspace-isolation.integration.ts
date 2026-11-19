import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { createFundingApplication } from "@merit/applications/server";
import { createDatabasePool, withDatabase, type Database } from "@merit/db";
import { actor, workspaceTest } from "@merit/organizations/testing/workspace";
import { readWorkspace, writeWorkspace } from "@merit/organizations/transactions";
import { createFundingRound } from "@merit/rounds/server";

import { listWorkspaceApplications } from "../src/server";

const visible = async (db: Database) =>
  (
    await db.execute<{ organization_id: string }>(
      sql`select distinct organization_id from application_cases order by organization_id`,
    )
  ).rows.map((row) => row.organization_id);

const it = workspaceTest
  .extend("runtimeUrl", { scope: "file" }, ({ database }) => database.createRuntimeConnection())
  .extend("cases", async ({ db, database }) => {
    // Dana manages both workspaces, so only the transaction's workspace separates their rows.
    await database.client.query(
      "insert into memberships (user_id, organization_id, role) values ('dana', 'birch', 'program_manager')",
    );

    const createCase = async (slug: string) => {
      const round = await createFundingRound(db, actor, {
        workspaceSlug: slug,
        requestId: randomUUID(),
        title: `${slug} round`,
      });
      assert(round.status === "ok");
      const application = await createFundingApplication(db, actor, {
        workspaceSlug: slug,
        publicId: round.publicId,
        requestId: randomUUID(),
        title: `${slug} application`,
      });
      assert(application.status === "ok");
      return { roundId: round.publicId, applicationId: application.publicId };
    };

    const cases = { alder: await createCase("alder"), birch: await createCase("birch") };
    await database.client.query(
      `insert into material_drafts (case_id, base_material_version, kind, title, applicant, requested, reason, revision)
       values ($1, 1, 'correction', 'Birch draft', '', '', '', 1)`,
      [cases.birch.applicationId],
    );
    return cases;
  });

it("refuses a new runtime connection if a workspace table loses row security", async ({
  database,
  runtimeUrl,
}) => {
  await expect(createDatabasePool(runtimeUrl)(visible)).resolves.toEqual([]);
  await database.client.query("ALTER TABLE contacts DISABLE ROW LEVEL SECURITY");
  try {
    await expect(createDatabasePool(runtimeUrl)(visible)).rejects.toThrow("workspace row security");
  } finally {
    await database.client.query("ALTER TABLE contacts ENABLE ROW LEVEL SECURITY");
  }
});

it("enables row security on every workspace table for the runtime role", async ({ runtimeUrl }) => {
  const unprotected = await withDatabase(runtimeUrl, (runtime) =>
    runtime.execute(sql`
      select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
      and relname not in ('access_requests','access_request_limits','demo_entry_limits','app_users','guest_sessions')
      and not row_security_active(oid)`),
  );

  expect(unprotected.rows).toEqual([]);
});

it("shows no workspace rows on a runtime connection outside a workspace transaction", async ({
  cases: _cases,
  runtimeUrl,
}) => {
  expect(await withDatabase(runtimeUrl, visible)).toEqual([]);
});

it("creates and lists a dual member's applications through the runtime role", async ({
  cases,
  runtimeUrl,
}) => {
  await withDatabase(runtimeUrl, async (runtime) => {
    const created = await createFundingApplication(runtime, actor, {
      workspaceSlug: "alder",
      publicId: cases.alder.roundId,
      requestId: randomUUID(),
      title: "Runtime application",
    });
    assert(created.status === "ok");
    const page = await listWorkspaceApplications(runtime, actor, { workspaceSlug: "alder" });
    assert(page.status === "ok");

    expect(page.applications.map((application) => application.id).sort()).toEqual(
      [cases.alder.applicationId, created.publicId].sort(),
    );
  });
});

it("limits a dual member's workspace transaction to that workspace's rows", async ({
  cases,
  runtimeUrl,
}) => {
  await withDatabase(runtimeUrl, (runtime) =>
    writeWorkspace(runtime, actor.userId, "alder", async (tx) => {
      const versions = await tx.execute<{ case_id: string }>(
        sql`select distinct case_id from material_versions`,
      );

      expect(await visible(tx)).toEqual(["alder"]);
      expect(versions.rows.map((row) => row.case_id)).toEqual([cases.alder.applicationId]);
    }),
  );
});

it("cannot update or delete another workspace's rows from a workspace transaction", async ({
  cases,
  database,
  runtimeUrl,
}) => {
  const birch = cases.birch.applicationId;
  await withDatabase(runtimeUrl, (runtime) =>
    writeWorkspace(runtime, actor.userId, "alder", async (tx) => {
      const updated = await tx.execute(
        sql`update application_cases set revision = revision + 1 where id = ${birch}`,
      );
      const deleted = await tx.execute(sql`delete from material_drafts where case_id = ${birch}`);

      expect(updated.rowCount).toBe(0);
      expect(deleted.rowCount).toBe(0);
    }),
  );
  const draft = await database.client.query(
    "select revision from material_drafts where case_id = $1",
    [birch],
  );
  expect(draft.rows).toEqual([{ revision: 1 }]);
});

it("rejects inserting a row for another workspace's case", async ({ cases, runtimeUrl }) => {
  await withDatabase(runtimeUrl, (runtime) =>
    expect(
      writeWorkspace(runtime, actor.userId, "alder", (tx) =>
        tx.execute(sql`insert into material_drafts (case_id, base_material_version, kind, title, applicant, project_period, requested, reason, revision)
         values (${cases.birch.applicationId}, 1, 'correction', 'Title', '', '', '', '', 0)`),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } }),
  );
});

it("refuses to change workspace within a workspace transaction", async ({
  cases: _cases,
  runtimeUrl,
}) => {
  await withDatabase(runtimeUrl, (runtime) =>
    writeWorkspace(runtime, actor.userId, "alder", async (tx) => {
      await expect(readWorkspace(tx, actor.userId, "birch", visible)).rejects.toThrow(
        "cannot change",
      );
      expect(await visible(tx)).toEqual(["alder"]);
    }),
  );
});

it("clears the workspace from a reused connection after commit and rollback", async ({
  cases: _cases,
  runtimeUrl,
}) => {
  await withDatabase(runtimeUrl, async (runtime) => {
    await writeWorkspace(runtime, actor.userId, "alder", visible);
    expect(await visible(runtime)).toEqual([]);

    await expect(
      writeWorkspace(runtime, actor.userId, "birch", async () => {
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await visible(runtime)).toEqual([]);

    expect(await readWorkspace(runtime, actor.userId, "birch", visible)).toEqual(["birch"]);
  });
});

it.for([
  ["an inactive account", "update app_users set active = false where id = 'dana'"],
  [
    "a removed membership",
    "delete from memberships where user_id = 'dana' and organization_id = 'alder'",
  ],
  [
    "an expired demo workspace",
    "update organizations set kind = 'demo', demo_seed_version = 1, demo_expires_at = now() where id = 'alder'",
  ],
] as const)(
  "shows no workspace rows to %s",
  async ([, revoke], { cases: _cases, database, runtimeUrl }) => {
    await withDatabase(runtimeUrl, async (runtime) => {
      expect(await readWorkspace(runtime, actor.userId, "alder", visible)).toEqual(["alder"]);

      await database.client.query(revoke);

      expect(await readWorkspace(runtime, actor.userId, "alder", visible)).toEqual([]);
    });
  },
);
