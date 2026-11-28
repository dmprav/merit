import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client as PgClient } from "pg";
import { assert, describe, expect } from "vite-plus/test";

import { withAuditFailure } from "@merit/audit/testing";
import type { Database } from "@merit/db";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import { encodeRecommendation, type SaveRecommendationRequest } from "@merit/recommendations/api";
import { createRecommendationsService } from "@merit/recommendations/server";
import { saveFundingRecommendation } from "@merit/recommendations/server";

import { readCurrentRecommendationsMap } from "../src/server/persistence/projections";
import {
  withRestrictedRecommendationRole,
  withRejectedRecommendationWrite,
  recommendationRequest,
  recommendationTest as it,
  withoutAssessment,
  readRecommendationVersions,
  toEncodedRecommendation,
  type RecommendationRow,
} from "./recommendation-test";

const read = async (db: Database, address: { publicId: string }) => {
  const current = (await readCurrentRecommendationsMap(db, [address.publicId])).get(
    address.publicId,
  );
  assert.isDefined(current, "Expected a saved recommendation");
  return current;
};

describe("persisted recommendations", () => {
  const save = (request: SaveRecommendationRequest) => (connection: Database) =>
    saveFundingRecommendation(connection, actor, request, withoutAssessment);

  it("saves with a restricted runtime role and requires row-lock and audit privileges", async ({
    db,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    await withRestrictedRecommendationRole(db, async (tx, role) => {
      await expect(
        saveFundingRecommendation(tx, actor, request, withoutAssessment),
      ).rejects.toMatchObject({
        cause: { code: "42501" },
      });

      await tx.execute(sql`SET LOCAL ROLE NONE`);
      await tx.execute(
        sql.raw(`GRANT UPDATE (id) ON funding_rounds, app_users, organizations TO ${role}`),
      );
      await tx.execute(sql.raw(`GRANT UPDATE (user_id) ON memberships TO ${role}`));
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));

      await expect(
        saveFundingRecommendation(tx, actor, request, withoutAssessment),
      ).rejects.toMatchObject({
        cause: { code: "42501", message: "permission denied for table recommendation_versions" },
      });

      await tx.execute(sql`SET LOCAL ROLE NONE`);
      await tx.execute(sql.raw(`GRANT INSERT ON recommendation_versions TO ${role}`));
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      await expect(
        saveFundingRecommendation(tx, actor, request, withoutAssessment),
      ).rejects.toMatchObject({
        cause: { code: "42501", message: "permission denied for table audit_events" },
      });

      await tx.execute(sql`SET LOCAL ROLE NONE`);
      await tx.execute(sql.raw(`GRANT SELECT, INSERT ON audit_events TO ${role}`));
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      const result = await saveFundingRecommendation(tx, actor, request, withoutAssessment);

      expect(result.status).toBe("ok");
      if (result.status !== "ok") {
        throw new Error("Expected restricted runtime save to succeed");
      }
      expect(result.recommendationVersion).toBe(2);

      const auditPrivileges = await tx.execute(
        sql`SELECT has_table_privilege(current_user, 'recommendation_versions', 'UPDATE') AS update, has_table_privilege(current_user, 'recommendation_versions', 'DELETE') AS delete`,
      );

      expect(auditPrivileges.rows[0]).toEqual({ update: false, delete: false });
      expect(
        (
          await tx.execute(
            sql`SELECT has_table_privilege(current_user, 'audit_events', 'UPDATE') AS update, has_table_privilege(current_user, 'audit_events', 'DELETE') AS delete`,
          )
        ).rows[0],
      ).toEqual({ update: false, delete: false });

      await tx.execute(sql`SET LOCAL ROLE NONE`);

      expect(
        (await tx.execute(sql`SELECT revision FROM recommendation_versions WHERE revision > 1`))
          .rows,
      ).toEqual([{ revision: 2 }]);
    });
  });

  it("rejects a stale recommendation revision without changing the saved recommendation or history", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const saved = await saveFundingRecommendation(db, actor, request, withoutAssessment);
    assert(saved.status === "ok");
    const before = await read(db, scenario.selected);
    const history = await readRecommendationVersions(database.client);
    expect(before).toEqual({
      revision: 2,
      recommendation: encodeRecommendation(saved.recommendation),
    });
    expect(
      history
        .filter((version) => version.application_public_id === request.publicId)
        .map((version) => version.revision),
    ).toEqual([1, 2]);
    expect(
      await saveFundingRecommendation(
        db,
        actor,
        {
          ...request,
          recommendation: {
            ...request.recommendation,
            reasoning: "A proposal based on stale information.",
          },
        },
        withoutAssessment,
      ),
    ).toEqual({ status: "conflict" });
    expect(await read(db, scenario.selected)).toEqual(before);
    expect(await readRecommendationVersions(database.client)).toEqual(history);
  });

  it.for(["none", "administrator", "owner"])(
    "commits the recommendation, revision and audit for %s",
    async (administration, { db, database, scenario }) => {
      await database.client.query("UPDATE memberships SET administration=$1 WHERE user_id='dana'", [
        administration,
      ]);
      const request = recommendationRequest(scenario.selected.publicId);
      const original = await read(db, scenario.selected);
      assert.isNotNull(original);
      const before = original.recommendation;

      const result = await saveFundingRecommendation(db, actor, request, withoutAssessment);

      expect(result.status).toBe("ok");
      if (result.status !== "ok") {
        throw new Error("Expected successful save");
      }
      expect(result.recommendationVersion).toBe(2);

      const recommendation = result.recommendation;

      expect(recommendation.recorded).toEqual({
        date: new Date().toISOString().slice(0, 10),
        applicationVersion: request.expectedApplicationVersion,
      });
      expect(result).not.toHaveProperty("round");

      const persisted = await read(db, scenario.selected);
      assert.isNotNull(persisted);

      expect(encodeMoney(result.totals.proposed).minorUnits).toBe("7000");
      expect(encodeMoney(result.totals.remaining!).minorUnits).toBe("3000");
      expect(persisted.recommendation).toEqual(encodeRecommendation(recommendation));
      expect(persisted.revision).toBe(2);

      const audit = await readRecommendationVersions(database.client, 1);

      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        application_public_id: request.publicId,
        revision: 2,
        actor_user_id: "dana",
        before: before,
        after: encodeRecommendation(recommendation),
      });
      expect((audit[0] ?? assert.fail("Expected audit[0]")).recorded_at).toBeInstanceOf(Date);
      expect(
        (
          await database.client.query(
            "SELECT organization_id, actor_user_id, actor_name, provenance, action, target_type, target_id, target_revision FROM audit_events WHERE target_revision=2",
          )
        ).rows,
      ).toEqual([
        {
          organization_id: "alder",
          actor_user_id: "dana",
          actor_name: "Dana Reed",
          provenance: { interface: "web" },
          action: "recommendation.recorded",
          target_type: "recommendation",
          target_id: request.publicId,
          target_revision: 2,
        },
      ]);
    },
  );

  it.for(["wrong_workspace", "wrong_identity", "revoked", "reviewer", "disabled"])(
    "rejects %s without changing data or producing an audit",
    async (denial, { db, database, scenario }) => {
      const request = recommendationRequest(scenario.selected.publicId);
      const original = await read(db, scenario.selected);
      assert.isNotNull(original);
      assert.isNotNull(original.recommendation);
      if (denial === "revoked") {
        await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");
      }
      if (denial === "reviewer") {
        await database.client.query(
          "UPDATE memberships SET role = 'reviewer' WHERE user_id = 'dana'",
        );
      }
      if (denial === "disabled") {
        await database.client.query("UPDATE app_users SET active = false WHERE id = 'dana'");
      }

      expect(
        await saveFundingRecommendation(
          db,
          denial === "wrong_identity" ? { userId: "birch-manager" } : actor,
          denial === "wrong_workspace" ? { ...request, workspaceSlug: "birch" } : request,
          withoutAssessment,
        ),
      ).toEqual({ status: "not_found" });
      expect(await readRecommendationVersions(database.client)).toEqual(scenario.versions);
      expect(
        (await database.client.query("SELECT id FROM audit_events WHERE target_revision>1")).rows,
      ).toEqual([]);

      const row = (
        await database.client.query<
          { recommendation_version: number } & Omit<
            RecommendationRow,
            "application_public_id" | "revision" | "actor_user_id" | "recorded_at"
          >
        >(
          `SELECT coalesce(r.revision, 0) AS recommendation_version,
             r.position, r.allocation_minor_units, r.allocation_currency, r.reasoning,
             r.recorded_date::text, r.material_version AS application_version,
             r.author_user_id, r.author_name, r.author_provenance_interface, r.author_provenance_client_id
           FROM application_cases c
           LEFT JOIN recommendation_versions r ON r.case_id=c.id AND r.revision=(SELECT max(v.revision) FROM recommendation_versions v WHERE v.case_id=c.id)
           WHERE c.id = $1`,
          [request.publicId],
        )
      ).rows[0];

      assert.isDefined(row);
      expect(row.recommendation_version).toBe(1);
      expect(toEncodedRecommendation(row)).toEqual(original.recommendation);
    },
  );

  it("allows proposals above the budget and reports the overspend without touching other case fields", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const original = await read(db, scenario.selected);
    assert.isNotNull(original);
    const before = original.recommendation;
    assert.isNotNull(before);
    // Unrelated case columns must not break or be touched by a recommendation save.
    await database.client.query(
      "UPDATE application_cases SET attention = ARRAY['unrelated']::text[] WHERE organization_id = 'alder'",
    );
    const result = await saveFundingRecommendation(
      db,
      actor,
      {
        ...request,
        recommendation: encodeRecommendation({
          position: "Fund with a condition",
          allocation: fromMinorUnits(8001n),
          reasoning: "Confirm the venue.",
        }),
      },
      withoutAssessment,
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("Expected compact save to succeed");
    }
    expect(encodeMoney(result.totals.proposed).minorUnits).toBe("11001");
    expect(encodeMoney(result.totals.remaining!).minorUnits).toBe("-1001");

    const audit = (await readRecommendationVersions(database.client, 1)).map(
      ({ before, after }) => ({
        before,
        after,
      }),
    );

    expect(audit).toEqual([{ before: before, after: encodeRecommendation(result.recommendation) }]);
    expect(
      (
        await database.client.query("SELECT attention FROM application_cases WHERE id = $1", [
          request.publicId,
        ])
      ).rows,
    ).toEqual([{ attention: ["unrelated"] }]);
  });

  it.for([
    { problem: "a malformed application ID", change: { publicId: "not-a-public-id" } },
    {
      problem: "a funded deferral",
      change: {
        recommendation: {
          position: "Defer",
          allocation: { currency: "EUR", minorUnits: "4000" },
          reasoning: "Updated after checking the evidence.",
        },
      },
    },
  ] satisfies { problem: string; change: Partial<SaveRecommendationRequest> }[])(
    "rejects $problem without writing",
    async ({ change }, { db, database, scenario }) => {
      const events = (await database.client.query("SELECT * FROM audit_events ORDER BY id")).rows;

      expect(
        await saveFundingRecommendation(
          db,
          actor,
          {
            ...recommendationRequest(scenario.selected.publicId),
            ...change,
          },
          withoutAssessment,
        ),
      ).toEqual({ status: "invalid", error: "invalid_recommendation" });
      expect(await readRecommendationVersions(database.client)).toEqual(scenario.versions);
      expect((await database.client.query("SELECT * FROM audit_events ORDER BY id")).rows).toEqual(
        events,
      );
    },
  );

  it.for(["recommendation_versions", "audit_events"] as const)(
    "rolls back the recommendation if writing %s fails",
    async (table, { db, database, scenario }) => {
      const request = recommendationRequest(scenario.selected.publicId);
      await withRejectedRecommendationWrite(database.client, table, () =>
        saveFundingRecommendation(db, actor, request, withoutAssessment),
      );
      expect(await readRecommendationVersions(database.client)).toEqual(scenario.versions);
      expect(
        (await database.client.query("SELECT id FROM audit_events WHERE target_revision>1")).rows,
      ).toEqual([]);
      expect(
        (
          await database.client.query<{ recommendation_version: number }>(
            "SELECT coalesce(max(revision), 0) AS recommendation_version FROM recommendation_versions WHERE case_id = $1",
            [request.publicId],
          )
        ).rows[0]?.recommendation_version,
      ).toBe(1);
    },
  );

  it("rolls back both records when the audit write fails at commit", async ({
    db,
    database,
    scenario,
  }) => {
    const service = createRecommendationsService({
      database: (operation) => operation(db),
      isCurrentAssessment: withoutAssessment,
    });
    const before = await read(db, scenario.selected);
    await expect(
      withAuditFailure(database.client, () =>
        service.saveRecommendation(actor, recommendationRequest(scenario.selected.publicId)),
      ),
    ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
    expect(await read(db, scenario.selected)).toEqual(before);
    expect(await readRecommendationVersions(database.client)).toEqual(scenario.versions);
    expect(
      (await database.client.query("SELECT id FROM audit_events WHERE target_revision>1")).rows,
    ).toEqual([]);
  });

  it("serializes competing saves and commits exactly one version of the same recommendation", async ({
    locks,
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);

    expect(
      await locks.race(
        save(request),
        save({
          ...request,
          recommendation: { ...request.recommendation, reasoning: "Competing edit." },
        }),
      ),
    ).toEqual({ status: "conflict" });

    const page = await read(db, scenario.selected);

    assert.isNotNull(page);
    expect(page.recommendation.reasoning).toBe(request.recommendation.reasoning);
    expect(page.revision).toBe(2);
    expect(await readRecommendationVersions(database.client, 1)).toHaveLength(1);
  });

  it("validates totals against the committed sibling recommendation during concurrent saves", async ({
    locks,
    db,
    database,
    scenario,
  }) => {
    const siblingBefore = await read(db, scenario.sibling);
    assert.isNotNull(siblingBefore);
    const first = {
      ...recommendationRequest(scenario.selected.publicId),
      recommendation: encodeRecommendation({
        position: "Fund",
        allocation: fromMinorUnits(6n * 10n ** 29n),
        reasoning: "Individually representable allocation.",
      }),
    };
    const second = { ...first, publicId: scenario.sibling.publicId };

    expect(await locks.race(save(first), save(second))).toEqual({
      status: "invalid",
      error: "allocation_total_too_large",
    });
    expect(await readRecommendationVersions(database.client, 1)).toHaveLength(1);

    const saved = await read(db, scenario.selected);
    const siblingAfter = await read(db, scenario.sibling);
    assert.isNotNull(saved);
    assert.isNotNull(saved.recommendation);
    assert.isNotNull(siblingAfter);

    expect(saved.recommendation.allocation).toEqual(first.recommendation.allocation);
    expect(saved.revision).toBe(2);
    expect(siblingAfter.recommendation).toEqual(siblingBefore.recommendation);
    expect(siblingAfter.revision).toBe(1);
  });

  it("rechecks revoked access after waiting for a concurrent round transaction", async ({
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const blocker = new PgClient({ connectionString: database.connectionString });
    const saver = new PgClient({ connectionString: database.connectionString });
    let pending: ReturnType<typeof saveFundingRecommendation> | undefined;
    try {
      await Promise.all([blocker.connect(), saver.connect()]);
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT id FROM funding_rounds WHERE organization_id = 'alder' FOR UPDATE",
      );
      const pid = (await saver.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
        ?.pid;
      pending = saveFundingRecommendation(drizzle(saver), actor, request, withoutAssessment);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const activity = (
          await database.client.query<{ wait_event_type: string | null }>(
            "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
            [pid],
          )
        ).rows[0];
        if (activity?.wait_event_type === "Lock") {
          waiting = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(waiting).toBe(true);

      await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");
      await blocker.query("COMMIT");

      expect(await pending).toEqual({ status: "not_found" });
      expect(await readRecommendationVersions(database.client)).toEqual(scenario.versions);
    } finally {
      await blocker.query("ROLLBACK");
      await pending;
      await Promise.all([blocker.end(), saver.end()]);
    }
  });

  it("attributes a recommendation to its authenticated recorder", async ({ db, scenario }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const saved = await saveFundingRecommendation(db, actor, request, withoutAssessment);
    assert(saved.status === "ok");
    const author = { userId: "dana", name: "Dana Reed", provenance: { interface: "web" } };

    expect(saved.recommendation.author).toEqual(author);
    expect((await read(db, scenario.selected)).recommendation.author).toEqual(author);
  });

  it("records a new revision when another manager saves an unchanged recommendation", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const saved = await saveFundingRecommendation(db, actor, request, withoutAssessment);
    assert(saved.status === "ok");
    await database.client.query("INSERT INTO app_users (id, name) VALUES ('pat', 'Pat Taylor')");
    await database.client.query(
      "INSERT INTO memberships (organization_id, user_id, role) VALUES ('alder', 'pat', 'program_manager')",
    );

    const resaved = await saveFundingRecommendation(
      db,
      { userId: "pat" },
      { ...request, expectedRevision: saved.recommendationVersion },
      withoutAssessment,
    );

    assert(resaved.status === "ok");
    expect(resaved.recommendationVersion).toBe(saved.recommendationVersion + 1);
    expect(resaved.recommendation.author).toEqual({
      userId: "pat",
      name: "Pat Taylor",
      provenance: { interface: "web" },
    });
    expect(await readRecommendationVersions(database.client, saved.recommendationVersion)).toEqual([
      expect.objectContaining({
        revision: resaved.recommendationVersion,
        actor_user_id: "pat",
      }),
    ]);
    expect(
      (
        await database.client.query(
          "SELECT actor_user_id, action FROM audit_events WHERE target_type = 'recommendation' AND target_revision > $1",
          [saved.recommendationVersion],
        )
      ).rows,
    ).toEqual([{ actor_user_id: "pat", action: "recommendation.recorded" }]);
  });

  it("keeps an unchanged recommendation revision and audit history", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const saved = await saveFundingRecommendation(db, actor, request, withoutAssessment);
    assert(saved.status === "ok");
    const before = (await database.client.query("SELECT * FROM audit_events ORDER BY id")).rows;
    const versions = await readRecommendationVersions(database.client);
    expect(
      await saveFundingRecommendation(
        db,
        actor,
        {
          ...request,
          expectedRevision: saved.recommendationVersion,
        },
        withoutAssessment,
      ),
    ).toEqual(saved);
    expect((await database.client.query("SELECT * FROM audit_events ORDER BY id")).rows).toEqual(
      before,
    );
    expect(await readRecommendationVersions(database.client)).toEqual(versions);
  });

  it("protects saved recommendation versions from updates and deletion", async ({
    db,
    database,
    scenario,
  }) => {
    const before = await read(db, scenario.selected);
    expect(
      (
        await database.client.query("SELECT 1 FROM application_cases WHERE id=$1", [
          scenario.selected.publicId,
        ])
      ).rowCount,
    ).toBe(1);
    await expect(
      database.client.query("UPDATE recommendation_versions SET reasoning=reasoning"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      database.client.query("DELETE FROM recommendation_versions"),
    ).rejects.toMatchObject({ code: "23514" });
    expect(await read(db, scenario.selected)).toEqual(before);
  });
});
