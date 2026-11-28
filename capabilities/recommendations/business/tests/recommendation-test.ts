import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { type Client as PgClient } from "pg";
import { assert, expect } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import { applicationTest, noApplicationWork } from "@merit/applications/testing";
import type { Database, Transaction } from "@merit/db";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { type SaveRecommendationRequest } from "@merit/recommendations/api";
import { saveFundingRecommendation } from "@merit/recommendations/server";

export const withoutAssessment = async (): Promise<boolean> => {
  throw new Error("This recommendation does not specify an assessment");
};

export const recommendationRequest = (publicId: string): SaveRecommendationRequest => ({
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

export type RecommendationRow = {
  application_public_id: string;
  revision: number;
  actor_user_id: string | null;
  recorded_at: Date;
  position: string;
  allocation_minor_units: string;
  allocation_currency: string;
  reasoning: string;
  recorded_date: string | null;
  application_version: number | null;
  author_user_id: string | null;
  author_name: string | null;
  author_provenance_interface: string | null;
  author_provenance_client_id: string | null;
};

export const toEncodedRecommendation = (
  row: Omit<
    RecommendationRow,
    "application_public_id" | "revision" | "actor_user_id" | "recorded_at"
  >,
) => ({
  position: row.position,
  allocation: { minorUnits: row.allocation_minor_units, currency: row.allocation_currency },
  reasoning: row.reasoning,
  ...(row.author_name !== null
    ? {
        author: {
          ...(row.author_user_id !== null ? { userId: row.author_user_id } : {}),
          name: row.author_name,
          ...(row.author_provenance_interface === "web"
            ? { provenance: { interface: "web" } }
            : row.author_provenance_interface === "mcp" && row.author_provenance_client_id
              ? { provenance: { interface: "mcp", clientId: row.author_provenance_client_id } }
              : {}),
        },
      }
    : {}),
  ...(row.recorded_date !== null && row.application_version !== null
    ? { recorded: { date: row.recorded_date, applicationVersion: row.application_version } }
    : {}),
});

export const readRecommendationVersions = async (client: PgClient, minRevision = 0) => {
  const rows = (
    await client.query<RecommendationRow>(
      `SELECT case_id AS application_public_id, revision, actor_user_id, recorded_at,
         position, allocation_minor_units, allocation_currency, reasoning,
         recorded_date::text, material_version AS application_version,
         author_user_id, author_name, author_provenance_interface, author_provenance_client_id
       FROM recommendation_versions ORDER BY case_id, revision`,
    )
  ).rows;
  const previousByCase = new Map<string, ReturnType<typeof toEncodedRecommendation>>();
  const entries: {
    application_public_id: string;
    revision: number;
    actor_user_id: string | null;
    recorded_at: Date;
    before: ReturnType<typeof toEncodedRecommendation> | null;
    after: ReturnType<typeof toEncodedRecommendation>;
  }[] = [];
  for (const row of rows) {
    const after = toEncodedRecommendation(row);
    const before = previousByCase.get(row.application_public_id) ?? null;
    previousByCase.set(row.application_public_id, after);
    if (row.revision > minRevision) {
      entries.push({
        application_public_id: row.application_public_id,
        revision: row.revision,
        actor_user_id: row.actor_user_id,
        recorded_at: row.recorded_at,
        before,
        after,
      });
    }
  }
  return entries;
};

export const recommendationTest = applicationTest.extend(
  "scenario",
  async ({ db, database, rounds, applications }) => {
    const recommend = async (title: string, allocation: bigint) => {
      const address = await applications.createApplication(title);
      const ready = await editFundingApplication(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { action: "mark_ready" },
        },
        noApplicationWork,
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
        withoutAssessment,
      );
      assert(recommended.status === "ok", "Could not record the fixture's original recommendation");

      return address;
    };

    const selected = await recommend("Selected application", 2000n);
    const sibling = await recommend("Sibling application", 3000n);
    return {
      round: rounds.pageInput,
      selected,
      sibling,
      versions: await readRecommendationVersions(database.client),
    };
  },
);

export const withRestrictedRecommendationRole = async (
  db: Database,
  operation: (tx: Transaction, role: string) => Promise<void>,
) => {
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
          `GRANT SELECT ON app_users, memberships, organizations, funding_rounds, application_cases, material_versions, material_drafts, criteria_versions, contacts, review_states, review_requests, assessments, assessment_versions, recommendation_versions, committee_decision_versions TO ${role}`,
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
      await operation(tx, role);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect((await db.execute(sql`SELECT 1 FROM pg_roles WHERE rolname = ${role}`)).rows).toEqual([]);
};

export const withRejectedRecommendationWrite = async (
  client: PgClient,
  table: "recommendation_versions" | "audit_events",
  save: () => Promise<unknown>,
) => {
  await client.query(
    `ALTER TABLE ${table} ADD CONSTRAINT reject_test_audit CHECK (false) NOT VALID`,
  );

  try {
    await expect(save()).rejects.toMatchObject({
      cause: { code: "23514", constraint: "reject_test_audit", table },
    });
  } finally {
    await client.query(`ALTER TABLE ${table} DROP CONSTRAINT reject_test_audit`);
  }
};
