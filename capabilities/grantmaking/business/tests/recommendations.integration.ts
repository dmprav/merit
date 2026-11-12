import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client as PgClient } from "pg";
import { assert, describe, expect } from "vite-plus/test";

import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { recordAuditEvent } from "@merit/audit/server/record";
import type { Database } from "@merit/db";
import {
  getFundingApplicationPage,
  getFundingRoundPage,
  listFundingApplicationHistory,
  listFundingRounds,
} from "@merit/grantmaking/server";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import {
  actor,
  workspaceTest as grantTest,
  workspaceSlug,
} from "@merit/organizations/testing/workspace";
import { encodeRecommendation, type SaveRecommendationRequest } from "@merit/recommendations/api";
import { createRecommendationsService } from "@merit/recommendations/server";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { createFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

const recommendationRequest = (publicId: string): SaveRecommendationRequest => ({
  workspaceSlug,
  publicId,
  expectedRevision: 1,
  expectedApplicationVersion: 1,
  recommendation: {
    position: "Fund",
    allocation: { currency: "EUR", minorUnits: "4000" },
    reasoning: "Updated after checking the evidence.",
  },
});

const createRecommendedApplication = async (
  db: Database,
  roundId: string,
  title: string,
  allocation: bigint,
) => {
  const created = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: roundId,
    requestId: randomUUID(),
    title,
    applicant: "Community group",
    requested: "80.00",
    answers: [
      {
        questionId: "a62d30ed-37a4-57ff-9c98-2d5ecaaed7bd",
        question: "Purpose",
        response: "Weekly community activities.",
      },
    ],
  });
  assert(created.status === "ok", "Could not create the application fixture");
  const address = { workspaceSlug, publicId: created.publicId };
  const ready = await editFundingApplication(
    db,
    actor,
    {
      ...address,
      expectedRevision: 0,
      change: { action: "mark_ready" },
    },
    applicationWork,
  );
  assert(ready.status === "ok", "Could not mark the application fixture ready");
  const recommended = await saveFundingRecommendation(
    db,
    actor,
    {
      ...address,
      expectedRevision: 0,
      expectedApplicationVersion: 1,
      recommendation: {
        position: "Fund",
        allocation: encodeMoney(fromMinorUnits(allocation)),
        reasoning: "Original allocation.",
      },
    },
    recordAuditEvent,
  );
  assert(recommended.status === "ok", "Could not record the fixture's original recommendation");

  return address;
};

const recommendationAuditQuery = `SELECT case_id AS application_public_id, revision,
  actor_user_id, recorded_at, lag(content) OVER (PARTITION BY case_id ORDER BY revision) AS before,
  content AS after FROM recommendation_versions`;

const readAudit = async (client: PgClient) =>
  (
    await client.query<{
      application_public_id: string;
      revision: number;
      actor_user_id: string;
      recorded_at: Date;
      before: unknown;
      after: unknown;
    }>(`${recommendationAuditQuery} ORDER BY application_public_id, revision`)
  ).rows;

const it = grantTest.extend("scenario", async ({ db, database }) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Recommendation budget",
    budget: "100.00",
  });
  assert(round.status === "ok", "Could not create the funding-round fixture");

  // Each application starts at version 1 with recommendation revision 1 and its audit entry.
  const selected = await createRecommendedApplication(
    db,
    round.publicId,
    "Selected application",
    2000n,
  );
  const sibling = await createRecommendedApplication(
    db,
    round.publicId,
    "Sibling application",
    3000n,
  );

  return {
    round: { workspaceSlug, publicId: round.publicId, kind: "round" as const },
    selected,
    sibling,
    audit: await readAudit(database.client),
  };
});

describe("persisted recommendations", () => {
  const competingSave = async (
    database: { connectionString: string; client: PgClient },
    firstRequest: SaveRecommendationRequest,
    secondRequest: SaveRecommendationRequest,
  ) => {
    const options = { connectionString: database.connectionString, statement_timeout: 3000 };
    const first = new PgClient(options);
    const second = new PgClient(options);
    let ready!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending: Promise<unknown>[] = [];

    try {
      await Promise.all([first.connect(), second.connect()]);
      const firstPid = (await first.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
        .rows[0]?.pid;
      const secondPid = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
        .rows[0]?.pid;
      const committed = drizzle(first).transaction(async (tx) => {
        expect(
          await saveFundingRecommendation(tx, actor, firstRequest, recordAuditEvent),
        ).toMatchObject({
          status: "ok",
        });

        ready();
        await held;
      });
      pending.push(committed.catch(() => undefined));
      await Promise.race([started, committed]);
      const competing = saveFundingRecommendation(
        drizzle(second),
        actor,
        secondRequest,
        recordAuditEvent,
      );
      pending.push(competing.catch(() => undefined));
      await expect
        .poll(
          async () =>
            (
              await database.client.query<{ blockers: number[] }>(
                "SELECT pg_blocking_pids($1) AS blockers",
                [secondPid],
              )
            ).rows[0]?.blockers,
          { timeout: 1500 },
        )
        .toContain(firstPid);
      release();
      await committed;
      return await competing;
    } finally {
      release();
      await Promise.allSettled(pending);
      await Promise.all([first.end(), second.end()]);
    }
  };

  it("saves with a restricted runtime role and requires row-lock and audit privileges", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const role = `runtime_test_${randomUUID().replaceAll("-", "")}`;
    const rollback = new Error("Roll back the temporary runtime role and its grants");

    await expect(
      db.transaction(async (tx) => {
        // PostgreSQL roles are cluster-scoped; create and remove this role in the
        // same rolled-back transaction, including every nested savepoint save.
        await tx.execute(
          sql.raw(
            `CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
          ),
        );
        await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
        await tx.execute(
          sql.raw(
            `GRANT SELECT ON app_users, memberships, organizations, funding_rounds, application_cases, material_versions, material_drafts, criteria_versions, contacts, review_states, review_requests, assessments, assessment_versions, recommendation_versions TO ${role}`,
          ),
        );
        await tx.execute(sql.raw(`GRANT UPDATE (id) ON application_cases TO ${role}`));
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        const permissions = await tx.execute(
          sql`SELECT current_user AS role, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user`,
        );

        expect(permissions.rows[0]).toEqual({
          role,
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
        });
        expect(await listFundingRounds(tx, actor, "alder")).toMatchObject({
          status: "ok",
          rounds: [expect.objectContaining({ organizationId: "alder" })],
        });
        await expect(
          saveFundingRecommendation(tx, actor, request, recordAuditEvent),
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
          saveFundingRecommendation(tx, actor, request, recordAuditEvent),
        ).rejects.toMatchObject({
          cause: { code: "42501", message: "permission denied for table recommendation_versions" },
        });

        await tx.execute(sql`SET LOCAL ROLE NONE`);
        await tx.execute(sql.raw(`GRANT INSERT ON recommendation_versions TO ${role}`));
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        await expect(
          saveFundingRecommendation(tx, actor, request, recordAuditEvent),
        ).rejects.toMatchObject({
          cause: { code: "42501", message: "permission denied for table audit_events" },
        });

        await tx.execute(sql`SET LOCAL ROLE NONE`);
        await tx.execute(sql.raw(`GRANT SELECT, INSERT ON audit_events TO ${role}`));
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        const result = await saveFundingRecommendation(tx, actor, request, recordAuditEvent);

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

        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      (await database.client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rows,
    ).toEqual([]);
  });

  it.for(["none", "administrator", "owner"])(
    "commits the recommendation, revision and audit for %s",
    async (administration, { db, database, scenario }) => {
      await database.client.query("UPDATE memberships SET administration=$1 WHERE user_id='dana'", [
        administration,
      ]);
      const request = recommendationRequest(scenario.selected.publicId);
      const original = await getFundingApplicationPage(db, actor, scenario.selected);
      assert.isNotNull(original);
      const before = original.application.managerRecommendation;

      const result = await saveFundingRecommendation(db, actor, request, recordAuditEvent);

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

      const persisted = await getFundingApplicationPage(db, actor, scenario.selected);
      assert.isNotNull(persisted);

      expect(encodeMoney(result.totals.proposed).minorUnits).toBe("7000");
      expect(encodeMoney(result.totals.remaining!).minorUnits).toBe("3000");
      expect(encodeMoney(result.totals.proposed)).toEqual(
        encodeMoney(persisted.round.totals.proposed),
      );
      expect(encodeMoney(result.totals.remaining!)).toEqual(
        encodeMoney(persisted.round.totals.remaining!),
      );
      expect(persisted.application.managerRecommendation).toEqual(recommendation);
      expect(persisted.recommendationVersion).toBe(2);

      const audit = (
        await database.client.query<{ recorded_at: Date }>(
          `SELECT * FROM (${recommendationAuditQuery}) audit WHERE revision > 1`,
        )
      ).rows;

      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        application_public_id: request.publicId,
        revision: 2,
        actor_user_id: "dana",
        before: before && encodeRecommendation(before),
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
          action: "recommendation.saved",
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
      const original = await getFundingApplicationPage(db, actor, scenario.selected);
      assert.isNotNull(original);
      assert.isNotNull(original.application.managerRecommendation);
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
          recordAuditEvent,
        ),
      ).toEqual({ status: "not_found" });
      expect(await readAudit(database.client)).toEqual(scenario.audit);
      expect(
        (await database.client.query("SELECT id FROM audit_events WHERE target_revision>1")).rows,
      ).toEqual([]);

      const row = (
        await database.client.query<{
          recommendation_version: number;
          snapshot: { managerRecommendation: unknown };
        }>(
          "SELECT coalesce(r.revision, 0) AS recommendation_version, jsonb_build_object('managerRecommendation', r.content) AS snapshot FROM application_cases c LEFT JOIN recommendation_versions r ON r.case_id=c.id AND r.revision=(SELECT max(v.revision) FROM recommendation_versions v WHERE v.case_id=c.id) WHERE c.id = $1",
          [request.publicId],
        )
      ).rows[0];

      assert.isDefined(row);
      expect(row.recommendation_version).toBe(1);
      expect(row.snapshot.managerRecommendation).toEqual(
        encodeRecommendation(original.application.managerRecommendation),
      );
    },
  );

  it.for(["recommendation revision", "application version"] as const)(
    "rejects a stale %s without changing the saved recommendation, revision, or history",
    async (staleBasis, { db, scenario }) => {
      const request = recommendationRequest(scenario.selected.publicId);
      const saved = await saveFundingRecommendation(db, actor, request, recordAuditEvent);
      assert(saved.status === "ok");

      if (staleBasis === "application version") {
        const current = (await getFundingApplicationPage(db, actor, scenario.selected))!;
        const started = await editFundingApplication(
          db,
          actor,
          {
            ...scenario.selected,
            expectedRevision: current.intake.revision,
            change: { action: "start_revision", kind: "revision" },
          },
          applicationWork,
        );
        assert(started.status === "ok");
        const drafted = await editFundingApplication(
          db,
          actor,
          {
            ...scenario.selected,
            expectedRevision: started.revision,
            change: {
              action: "save_revision",
              draft: {
                kind: "revision",
                reason: "Updated request",
                content: { requested: "81.00" },
              },
            },
          },
          applicationWork,
        );
        assert(drafted.status === "ok");
        expect(
          await editFundingApplication(
            db,
            actor,
            {
              ...scenario.selected,
              expectedRevision: drafted.revision,
              change: { action: "publish_revision" },
            },
            applicationWork,
          ),
        ).toMatchObject({ status: "ok" });
      }

      const address = { workspaceSlug: request.workspaceSlug, publicId: request.publicId };
      const historyInput = {
        workspaceSlug: request.workspaceSlug,
        applicationId: request.publicId,
        history: "recommendation" as const,
      };
      const before = await getFundingApplicationPage(db, actor, address);
      const history = await listFundingApplicationHistory(db, actor, historyInput);
      expect(before).toMatchObject({
        application: { managerRecommendation: saved.recommendation },
        recommendationVersion: 2,
      });
      expect(history).toMatchObject({ status: "ok", entries: [{ revision: 1 }, { revision: 2 }] });

      const rejected = await saveFundingRecommendation(
        db,
        actor,
        {
          ...request,
          expectedRevision:
            staleBasis === "recommendation revision"
              ? request.expectedRevision
              : saved.recommendationVersion,
          recommendation: encodeRecommendation({
            position: "Fund with a condition",
            allocation: fromMinorUnits(5000n),
            reasoning: "A different proposal based on stale information.",
          }),
        },
        recordAuditEvent,
      );

      expect(rejected).toEqual({ status: "conflict" });
      expect(await getFundingApplicationPage(db, actor, address)).toEqual(before);
      expect(await listFundingApplicationHistory(db, actor, historyInput)).toEqual(history);
    },
  );

  it("saves using budget, intake readiness, versions and recommendations, allowing proposals above budget", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const original = await getFundingApplicationPage(db, actor, scenario.selected);
    assert.isNotNull(original);
    const before = original.application.managerRecommendation;
    assert.isNotNull(before);
    // Deliberately invalid case-only JSON must not be decoded by a recommendation save.
    await database.client.query(
      "UPDATE application_cases SET attention = '{}'::jsonb WHERE organization_id = 'alder'",
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
      recordAuditEvent,
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("Expected compact save to succeed");
    }
    expect(encodeMoney(result.totals.proposed).minorUnits).toBe("11001");
    expect(encodeMoney(result.totals.remaining!).minorUnits).toBe("-1001");

    const audit = (
      await database.client.query<{ before: unknown; after: unknown }>(
        `SELECT before, after FROM (${recommendationAuditQuery}) audit WHERE revision > 1`,
      )
    ).rows;

    expect(audit).toEqual([
      { before: encodeRecommendation(before), after: encodeRecommendation(result.recommendation) },
    ]);
  });

  it("returns the current budget with committed totals for subsequent editor previews", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const budget = encodeMoney(fromMinorUnits(1000n));
    await database.client.query(
      "UPDATE funding_rounds SET budget = $1 WHERE organization_id = 'alder'",
      [budget.minorUnits],
    );
    const result = await saveFundingRecommendation(db, actor, request, recordAuditEvent);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("Expected save to succeed");
    }
    expect(encodeMoney(result.budget!)).toEqual(budget);

    const persisted = await getFundingRoundPage(db, actor, scenario.round);
    assert.isNotNull(persisted);

    expect(encodeMoney(result.totals.remaining!).minorUnits).toBe("-6000");
    expect(encodeMoney(result.totals.remaining!)).toEqual(
      encodeMoney(persisted.round.totals.remaining!),
    );
  });

  it("applies domain validation before writing", async ({ db, database, scenario }) => {
    const request = recommendationRequest(scenario.selected.publicId);

    expect(
      await saveFundingRecommendation(
        db,
        actor,
        {
          ...request,
          recommendation: { ...request.recommendation, position: "Defer" },
        },
        recordAuditEvent,
      ),
    ).toEqual({ status: "invalid", error: "invalid_recommendation" });
    expect(await readAudit(database.client)).toEqual(scenario.audit);
  });

  it.for(["recommendation_versions", "audit_events"])(
    "rolls back the recommendation if writing %s fails",
    async (table, { db, database, scenario }) => {
      const request = recommendationRequest(scenario.selected.publicId);
      const original = await getFundingRoundPage(db, actor, scenario.round);
      assert.isNotNull(original);
      await database.client.query(
        `ALTER TABLE ${table} ADD CONSTRAINT reject_test_audit CHECK (false) NOT VALID`,
      );

      try {
        await expect(
          saveFundingRecommendation(db, actor, request, recordAuditEvent),
        ).rejects.toThrow();
        expect(await getFundingRoundPage(db, actor, scenario.round)).toEqual(original);
        expect(await readAudit(database.client)).toEqual(scenario.audit);
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
      } finally {
        await database.client.query(`ALTER TABLE ${table} DROP CONSTRAINT reject_test_audit`);
      }
    },
  );

  it("rolls back both records when the injected audit recorder fails after appending", async ({
    db,
    database,
    scenario,
  }) => {
    const failure = new Error("Audit recording failed");
    const service = createRecommendationsService({
      database: (operation) => operation(db),
      recordAuditEvent: async (tx, event) => {
        await recordAuditEvent(tx, event);
        throw failure;
      },
    });
    const before = await getFundingApplicationPage(db, actor, scenario.selected);
    await expect(
      service.saveRecommendation(actor, recommendationRequest(scenario.selected.publicId)),
    ).rejects.toBe(failure);
    expect(await getFundingApplicationPage(db, actor, scenario.selected)).toEqual(before);
    expect(await readAudit(database.client)).toEqual(scenario.audit);
    expect(
      (await database.client.query("SELECT id FROM audit_events WHERE target_revision>1")).rows,
    ).toEqual([]);
  });

  it("serializes competing saves and commits exactly one version of the same recommendation", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);

    expect(
      await competingSave(database, request, {
        ...request,
        recommendation: { ...request.recommendation, reasoning: "Competing edit." },
      }),
    ).toEqual({ status: "conflict" });

    const page = await getFundingApplicationPage(db, actor, {
      workspaceSlug: request.workspaceSlug,
      publicId: request.publicId,
    });

    assert.isNotNull(page);
    expect(page.application.managerRecommendation?.reasoning).toBe(
      request.recommendation.reasoning,
    );
    expect(page.recommendationVersion).toBe(2);
    expect(
      (
        await database.client.query<{ recorded_at: Date }>(
          `SELECT * FROM (${recommendationAuditQuery}) audit WHERE revision > 1`,
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("validates totals against the committed sibling recommendation during concurrent saves", async ({
    db,
    database,
    scenario,
  }) => {
    const siblingBefore = await getFundingApplicationPage(db, actor, scenario.sibling);
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

    expect(await competingSave(database, first, second)).toEqual({
      status: "invalid",
      error: "allocation_total_too_large",
    });
    expect(
      (
        await database.client.query<{ recorded_at: Date }>(
          `SELECT * FROM (${recommendationAuditQuery}) audit WHERE revision > 1`,
        )
      ).rows,
    ).toHaveLength(1);

    const saved = await getFundingApplicationPage(db, actor, scenario.selected);
    const siblingAfter = await getFundingApplicationPage(db, actor, scenario.sibling);
    assert.isNotNull(saved);
    assert.isNotNull(saved.application.managerRecommendation);
    assert.isNotNull(siblingAfter);

    expect(encodeMoney(saved.application.managerRecommendation.allocation)).toEqual(
      first.recommendation.allocation,
    );
    expect(saved.recommendationVersion).toBe(2);
    expect(siblingAfter.application.managerRecommendation).toEqual(
      siblingBefore.application.managerRecommendation,
    );
    expect(siblingAfter.recommendationVersion).toBe(1);
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
      pending = saveFundingRecommendation(drizzle(saver), actor, request, recordAuditEvent);
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
      expect(await readAudit(database.client)).toEqual(scenario.audit);
    } finally {
      await blocker.query("ROLLBACK");
      await pending;
      await Promise.all([blocker.end(), saver.end()]);
    }
  });
});
