import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { createFundingApplication } from "@merit/applications/server";
import { createDatabasePool, withDatabase, type Database } from "@merit/db";
import { actor, workspaceTest } from "@merit/organizations/testing/workspace";
import { readWorkspace, writeWorkspace } from "@merit/organizations/transactions";

import { listWorkspaceApplications } from "../src/server";
import { fundingExampleIds } from "../src/server/demo";
import { seedExampleRounds } from "../testing/seed-example-rounds";

const visible = async (db: Database) =>
  (
    await db.execute<{ organization_id: string }>(
      sql`select distinct organization_id from application_cases order by organization_id`,
    )
  ).rows.map((row) => row.organization_id);

const it = workspaceTest.extend("runtimeUrl", { scope: "file" }, ({ database }) =>
  database.createRuntimeConnection(),
);

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

it("isolates a dual member's grant reads and writes on a reused runtime connection", async ({
  db,
  database,
  runtimeUrl,
}) => {
  await seedExampleRounds(db);
  await database.client.query(
    "insert into memberships (user_id, organization_id, role) values ('dana', 'birch', 'program_manager')",
  );
  const birch = await fundingExampleIds("birch");
  const alder = await fundingExampleIds("alder");
  await database.client.query(
    `insert into material_drafts (case_id, base_material_version, kind, title, applicant, requested, reason, revision)
     values ($1, 1, 'correction', 'Birch draft', '', '', '', 1) on conflict (case_id) do nothing`,
    [birch.applications.A1],
  );
  await withDatabase(runtimeUrl, async (runtime) => {
    const unprotected = await runtime.execute(sql`
      select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
      and relname not in ('access_requests','access_request_limits','demo_entry_limits','app_users','guest_sessions')
      and not row_security_active(oid)`);
    expect(unprotected.rows).toEqual([]);
    expect(await visible(runtime)).toEqual([]);
    const created = await createFundingApplication(runtime, actor, {
      workspaceSlug: "alder",
      publicId: alder.roundId,
      requestId: randomUUID(),
      title: "Runtime application",
    });
    assert(created.status === "ok");
    const page = await listWorkspaceApplications(runtime, actor, { workspaceSlug: "alder" });
    assert(page.status === "ok");
    expect(page.applications.map((application) => application.id)).toContain(created.publicId);
    await writeWorkspace(runtime, actor.userId, "alder", async (tx) => {
      expect(await visible(tx)).toEqual(["alder"]);
      const versions = await tx.execute<{ case_id: string }>(
        sql`select distinct case_id from material_versions`,
      );
      expect(versions.rows.map((row) => row.case_id).sort()).toEqual(
        [...Object.values(alder.applications), created.publicId].sort(),
      );
      expect(
        (
          await tx.execute(
            sql`update application_cases set revision = revision + 1 where id = ${birch.applications.A3}`,
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await tx.execute(
            sql`delete from material_drafts where case_id = ${birch.applications.A1}`,
          )
        ).rowCount,
      ).toBe(0);
      await expect(
        writeWorkspace(tx, actor.userId, "alder", (nested) =>
          nested.execute(sql`insert into material_drafts (case_id, base_material_version, kind, title, applicant, project_period, requested, reason, revision)
           values (${birch.applications.A3}, 1, 'correction', 'Title', '', '', '', '', 0)`),
        ),
      ).rejects.toMatchObject({ cause: { code: "42501" } });
      await expect(readWorkspace(tx, actor.userId, "birch", visible)).rejects.toThrow(
        "cannot change",
      );
      expect(await visible(tx)).toEqual(["alder"]);
    });
    expect(await visible(runtime)).toEqual([]);
    await expect(
      writeWorkspace(runtime, actor.userId, "birch", async () => {
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await visible(runtime)).toEqual([]);
    expect(await readWorkspace(runtime, actor.userId, "birch", visible)).toEqual(["birch"]);
    await database.client.query("update app_users set active = false where id = 'dana'");
    expect(await readWorkspace(runtime, actor.userId, "alder", visible)).toEqual([]);
    await database.client.query("update app_users set active = true where id = 'dana'");
    await database.client.query(
      "delete from memberships where user_id = 'dana' and organization_id = 'alder'",
    );
    expect(await readWorkspace(runtime, actor.userId, "alder", visible)).toEqual([]);
    await database.client.query(
      "update organizations set kind = 'demo', demo_seed_version = 1, demo_expires_at = now() where id = 'birch'",
    );
    expect(await readWorkspace(runtime, actor.userId, "birch", visible)).toEqual([]);
  });
});
