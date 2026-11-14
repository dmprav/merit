import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";

import { permits, type AccessAction, type OrganizationSubject } from "@merit/access";
import { accessScope } from "@merit/access/scope";
import { createTestDatabase } from "@merit/test-support/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  database = await createTestDatabase();
});
afterAll(async () => {
  await database?.dispose();
});

it("SQL filtering and in-memory decisions agree across attributes, tenants, and targets", async () => {
  const subjects: OrganizationSubject[] = [];
  for (const active of [true, false]) {
    for (const administration of ["none", "administrator", "owner"] as const) {
      for (const role of ["member", "program_manager", "reviewer", "committee_reader"] as const) {
        subjects.push({ userId: "actor", organizationId: "alder", active, administration, role });
      }
    }
  }

  const cases = subjects.flatMap((subject) =>
    ["alder", "birch"].flatMap((organizationId) =>
      ["actor", "other"].flatMap((userId) =>
        (["none", "administrator", "owner"] as const).map((administration) => ({
          subject,
          resource: { organizationId, userId, administration },
        })),
      ),
    ),
  );
  const actions: AccessAction[] = [
    "read_workspace",
    "read_team",
    "assess_grants",
    "manage_members",
    "manage_administrators",
    "work_on_grants",
    "remove_member",
    "change_administration",
    "manage_invitation",
    "administer_organizations",
  ];
  const attributes = {
    "subject.userId": sql`facts.user_id`,
    "subject.organizationId": sql`facts.organization_id`,
    "subject.active": sql`facts.active`,
    "subject.administration": sql`facts.administration`,
    "subject.role": sql`facts.role`,
    "resource.organizationId": sql`facts.target_organization_id`,
    "resource.userId": sql`facts.target_user_id`,
    "resource.administration": sql`facts.target_administration`,
  };
  const values = cases.map(
    ({ subject, resource }, index) => sql`(
    ${index}::integer, ${subject.userId}::text, ${subject.organizationId}::text,
    ${subject.active}::boolean, ${subject.administration}::text, ${subject.role}::text,
    ${resource.organizationId}::text, ${resource.userId}::text, ${resource.administration}::text
  )`,
  );
  const decisions = actions.map(
    (action) => sql`${accessScope(action, attributes)} AS ${sql.identifier(action)}`,
  );
  const result = await drizzle(database.client).execute(sql`
    SELECT facts.id, ${sql.join(decisions, sql`, `)} FROM (VALUES ${sql.join(values, sql`, `)})
    AS facts(id, user_id, organization_id, active, administration, role,
      target_organization_id, target_user_id, target_administration) ORDER BY facts.id
  `);

  expect(result.rows).toHaveLength(cases.length);

  for (const [index, { subject, resource }] of cases.entries()) {
    for (const action of actions) {
      expect(result.rows[index]![action], JSON.stringify({ subject, resource, action })).toBe(
        permits(subject, action, resource),
      );
    }
  }
});

it("SQL denies absent or null facts and unknown actions, and handles operator designation separately", async () => {
  const db = drizzle(database.client);
  for (const action of [
    "read_workspace",
    "read_team",
    "assess_grants",
    "remove_member",
    "missing",
    "constructor",
  ] as AccessAction[]) {
    const result = await db.execute(sql`SELECT ${accessScope(action, {})} AS allowed`);

    expect(result.rows[0]!.allowed).toBe(false);
  }

  const nulls = await db.execute(
    sql`SELECT ${accessScope("remove_member", {
      "subject.active": sql`true`,
      "subject.organizationId": sql`'alder'`,
      "subject.administration": sql`'owner'`,
      "subject.userId": sql`'actor'`,
      "resource.organizationId": sql`'alder'`,
      "resource.administration": sql`'none'`,
      "resource.userId": sql`null::text`,
    })} AS allowed`,
  );

  expect(nulls.rows[0]!.allowed).toBe(false);

  for (const operator of [true, false]) {
    const result = await db.execute(
      sql`SELECT ${accessScope("administer_organizations", {
        "subject.operator": sql`${operator}::boolean`,
      })} AS allowed`,
    );

    expect(result.rows[0]!.allowed).toBe(permits({ operator }, "administer_organizations"));
  }
});

it("agrees on reviewer identity, status, account activation, and membership lifetime", async () => {
  const db = drizzle(database.client);
  for (const active of [true, false]) {
    for (const reviewerUserId of ["sam", "other", null]) {
      for (const reviewStatus of [
        "invited",
        "accepted",
        "submitted",
        "conflict",
        "cancelled",
        "declined",
      ] as const) {
        for (const reviewMembershipCurrent of [true, false]) {
          const result = await db.execute(
            sql`SELECT ${accessScope("work_on_review", {
              "subject.userId": sql`'sam'::text`,
              "subject.active": sql`${active}::boolean`,
              "subject.organizationId": sql`'alder'::text`,
              "subject.role": sql`'reviewer'::text`,
              "resource.organizationId": sql`'alder'::text`,
              "resource.reviewerUserId": sql`${reviewerUserId}::text`,
              "resource.reviewStatus": sql`${reviewStatus}::text`,
              "resource.reviewMembershipCurrent": sql`${reviewMembershipCurrent}::boolean`,
            })} AS allowed`,
          );
          expect(result.rows[0]!.allowed).toBe(
            permits(
              { userId: "sam", active, organizationId: "alder", role: "reviewer" },
              "work_on_review",
              {
                organizationId: "alder",
                reviewerUserId,
                reviewStatus,
                reviewMembershipCurrent,
              },
            ),
          );
        }
      }
    }
  }
});
