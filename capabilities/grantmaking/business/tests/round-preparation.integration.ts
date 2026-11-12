import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, describe, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import { recordAuditEvent } from "@merit/audit/server/record";
import { changeWorkspaceContact } from "@merit/contacts/server";
import {
  getFundingRoundPage,
  getFundingRoundOverview,
  getFundingApplicationPage,
  listFundingRounds,
} from "@merit/grantmaking/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { toDecimal } from "@merit/money";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import type { RoundChange } from "@merit/rounds/domain";
import { createFundingRound, editFundingRound, deleteFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

const create = async (db: NodePgDatabase) => {
  const result = await createFundingRound(
    db,
    actor,
    {
      workspaceSlug,
      requestId: randomUUID(),
      title: "Neighbourhood grants",
    },
    recordAuditEvent,
  );

  if (result.status !== "ok") {
    throw new Error("Creation failed");
  }

  return { workspaceSlug, publicId: result.publicId };
};

const createApplication = async (db: NodePgDatabase, roundId: string) => {
  const result = await createFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: roundId,
      requestId: randomUUID(),
      title: "Community meals",
      applicant: "Neighbourhood Kitchen",
      requested: "100.00",
      answers: [
        {
          questionId: "874c0657-ef06-5758-b59b-66279007d89e",
          question: "Plan",
          response: "Weekly shared meals.",
        },
      ],
    },
    recordAuditEvent,
  );

  assert(result.status === "ok");
  return { workspaceSlug, publicId: result.publicId };
};

const addManager = async (db: NodePgDatabase) => {
  await db.execute(sql`INSERT INTO app_users (id, name) VALUES ('pat', 'Pat Taylor')`);
  await db.execute(sql`INSERT INTO memberships (organization_id, user_id, role)
    VALUES ('alder', 'pat', 'program_manager')`);
};

const recommendation = {
  position: "Fund" as const,
  allocation: { minorUnits: "10000", currency: "EUR" as const },
  reasoning: "Support the proposed meals.",
};

const createReadyApplication = async (db: NodePgDatabase, roundId: string) => {
  const address = await createApplication(db, roundId);
  const result = await editFundingApplication(
    db,
    actor,
    {
      ...address,
      expectedRevision: 0,
      change: { action: "mark_ready" },
    },
    applicationWork,
    recordAuditEvent,
  );

  assert(result.status === "ok");
  return address;
};

describe("funding-round preparation", () => {
  it("supports preparation with the documented restricted runtime privileges", async ({
    db,
    database,
  }) => {
    const role = `round_runtime_${randomUUID().replaceAll("-", "")}`;
    const rollback = new Error("Remove the temporary role and its grants");

    await expect(
      db.transaction(async (tx) => {
        // Rollback removes the cluster-scoped role even when an assertion fails.
        await tx.execute(
          sql.raw(
            `CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
          ),
        );
        await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
        await tx.execute(
          sql.raw(
            `GRANT SELECT ON app_users, memberships, organizations, funding_rounds, criteria_versions TO ${role}`,
          ),
        );
        await tx.execute(sql.raw(`GRANT UPDATE (name) ON organizations TO ${role}`));
        await tx.execute(sql.raw(`GRANT UPDATE (id) ON app_users TO ${role}`));
        await tx.execute(sql.raw(`GRANT UPDATE (user_id) ON memberships TO ${role}`));
        await tx.execute(sql.raw(`GRANT INSERT, DELETE, UPDATE ON funding_rounds TO ${role}`));
        await tx.execute(sql.raw(`GRANT SELECT, INSERT ON round_changes TO ${role}`));
        await tx.execute(sql.raw(`GRANT SELECT, INSERT ON audit_events TO ${role}`));
        await tx.execute(sql.raw(`GRANT INSERT ON criteria_versions TO ${role}`));
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));

        expect(
          (await tx.execute(sql`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`)).rows,
        ).toEqual([{ rolsuper: false }]);

        const request = { workspaceSlug, requestId: randomUUID(), title: "Runtime grants" };
        const created = await createFundingRound(tx, actor, request, recordAuditEvent);

        expect(created.status).toBe("ok");
        if (created.status !== "ok") {
          throw new Error("Creation failed");
        }
        expect(await createFundingRound(tx, actor, request, recordAuditEvent)).toEqual(created);

        const address = { workspaceSlug, publicId: created.publicId };

        expect(
          await editFundingRound(
            tx,
            actor,
            {
              ...address,
              expectedRevision: 0,
              change: { section: "budget", amount: "100.25", reason: "" },
            },
            recordAuditEvent,
          ),
        ).toEqual({ status: "ok", revision: 1 });

        // Editing needs only the round; the page also reads application content.
        await tx.execute(sql.raw(`RESET ROLE`));
        await tx.execute(
          sql.raw(
            `GRANT SELECT ON application_cases, contacts, material_versions, material_drafts, review_states, review_requests, assessments, assessment_versions, recommendation_versions TO ${role}`,
          ),
        );
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        const page = await getFundingRoundPage(tx, actor, { ...address, kind: "round" });

        expect(page?.preparation.budgetHistory[0]).toMatchObject({
          after: { minorUnits: "10025", currency: "EUR" },
        });
        expect(
          await deleteFundingRound(
            tx,
            actor,
            { ...address, expectedRevision: 1 },
            roundHasApplications,
            recordAuditEvent,
          ),
        ).toEqual({
          status: "ok",
        });
        expect(await getFundingRoundPage(tx, actor, { ...address, kind: "round" })).toBeNull();
        expect(await createFundingRound(tx, actor, request, recordAuditEvent)).toEqual({
          status: "invalid",
          error: "round_deleted",
        });
        expect(
          (await tx.execute(sql`SELECT action FROM round_changes ORDER BY revision`)).rows,
        ).toEqual([{ action: "create" }, { action: "budget" }, { action: "delete" }]);
        expect(
          (
            await tx.execute(
              sql`SELECT has_table_privilege(current_user, 'round_changes', 'UPDATE') AS update, has_table_privilege(current_user, 'round_changes', 'DELETE') AS delete`,
            )
          ).rows,
        ).toEqual([{ update: false, delete: false }]);

        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      (await database.client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rows,
    ).toEqual([]);
  });

  it("creates once, reads incomplete content through both interfaces, and retains a deleted receipt", async ({
    db,
    database,
  }) => {
    const request = { workspaceSlug, requestId: randomUUID(), title: "  New round  " };
    const first = await createFundingRound(db, actor, request, recordAuditEvent);

    expect(first.status).toBe("ok");
    expect(await createFundingRound(db, actor, request, recordAuditEvent)).toEqual(first);
    if (first.status !== "ok") {
      throw new Error("Creation failed");
    }

    const page = (await getFundingRoundPage(db, actor, {
      workspaceSlug,
      publicId: first.publicId,
      kind: "round",
    }))!;

    expect(page.round).toMatchObject({
      id: first.publicId,
      title: "New round",
      budget: null,
      meetingDate: null,
      decisionStatus: "Preparing",
      managerUserId: "dana",
      managerNeedsReassignment: false,
      applications: [],
      totals: { remaining: null },
    });
    expect(
      await getFundingRoundOverview(db, actor, { workspaceSlug, roundId: first.publicId }),
    ).toMatchObject({ status: "ok", round: { roundId: first.publicId, budget: null } });
    const listed = await listFundingRounds(db, actor, workspaceSlug);
    assert(listed.status === "ok");
    expect(listed.rounds.find((round) => round.publicId === first.publicId)?.budget).toBeNull();
    expect(
      await deleteFundingRound(
        db,
        actor,
        {
          workspaceSlug,
          publicId: first.publicId,
          expectedRevision: 0,
        },
        roundHasApplications,
        recordAuditEvent,
      ),
    ).toEqual({ status: "ok" });
    expect(await createFundingRound(db, actor, request, recordAuditEvent)).toEqual({
      status: "invalid",
      error: "round_deleted",
    });
    expect(
      (
        await database.client.query<{ action: string }>(
          "SELECT action FROM round_changes ORDER BY revision",
        )
      ).rows,
    ).toEqual([{ action: "create" }, { action: "delete" }]);
  });

  it("enforces current workspace access, including owner without grant access", async ({
    db,
    database,
  }) => {
    const request = { workspaceSlug, requestId: randomUUID(), title: "New round" };

    expect(
      await createFundingRound(db, { userId: "birch-manager" }, request, recordAuditEvent),
    ).toEqual({
      status: "not_found",
    });

    const address = await create(db);

    expect(
      await editFundingRound(
        db,
        { userId: "birch-manager" },
        { ...address, expectedRevision: 0, change: { section: "budget", amount: "1", reason: "" } },
        recordAuditEvent,
      ),
    ).toEqual({ status: "not_found" });
    expect(
      await deleteFundingRound(
        db,
        { userId: "birch-manager" },
        { ...address, expectedRevision: 0 },
        roundHasApplications,
        recordAuditEvent,
      ),
    ).toEqual({ status: "not_found" });

    await database.client.query(
      "UPDATE memberships SET role = 'member', administration = 'administrator' WHERE user_id = 'dana'",
    );

    expect(await createFundingRound(db, actor, request, recordAuditEvent)).toEqual({
      status: "not_found",
    });
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { section: "budget", amount: "1", reason: "" },
        },
        recordAuditEvent,
      ),
    ).toEqual({ status: "not_found" });
  });

  it("rejects stale edits and records budget reasons and exact cents", async ({ db }) => {
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
        recordAuditEvent,
      ),
    ).toEqual({ status: "ok", revision: 1 });
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { section: "details", title: "Stale", purpose: "", meetingDate: null },
        },
        recordAuditEvent,
      ),
    ).toEqual({ status: "conflict" });
    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 1,
          change: { section: "budget", amount: "200", reason: "" },
        },
        recordAuditEvent,
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
        recordAuditEvent,
      ),
    ).toEqual({ status: "ok", revision: 2 });

    const page = (await getFundingRoundPage(db, actor, { ...address, kind: "round" }))!;

    expect(page.preparation.budgetHistory[0]).toMatchObject({
      actor: "Dana Reed",
      reason: "Additional allocation",
      before: { minorUnits: "10025" },
      after: { minorUnits: "20000" },
    });
    expect(
      await deleteFundingRound(
        db,
        actor,
        { ...address, expectedRevision: 1 },
        roundHasApplications,
        recordAuditEvent,
      ),
    ).toEqual({
      status: "conflict",
    });
  });

  it("requires a reason after clearing budgets established during creation or later editing", async ({
    db,
  }) => {
    for (const budget of [undefined, "0"]) {
      const created = await createFundingRound(
        db,
        actor,
        {
          workspaceSlug,
          requestId: randomUUID(),
          title: "Budget recovery",
          budget,
        },
        recordAuditEvent,
      );

      if (created.status !== "ok") {
        throw new Error("Creation failed");
      }

      const address = { workspaceSlug, publicId: created.publicId };
      let revision = 0;

      if (budget === undefined) {
        expect(
          await editFundingRound(
            db,
            actor,
            {
              ...address,
              expectedRevision: revision++,
              change: { section: "budget", amount: "100", reason: "" },
            },
            recordAuditEvent,
          ),
        ).toEqual({ status: "ok", revision });
      }
      expect(
        await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: revision++,
            change: { section: "budget", amount: "", reason: "Awaiting allocation" },
          },
          recordAuditEvent,
        ),
      ).toEqual({ status: "ok", revision });
      expect(
        await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: revision,
            change: { section: "budget", amount: "250", reason: "" },
          },
          recordAuditEvent,
        ),
      ).toEqual({ status: "invalid", error: "budget_reason_required" });
      expect(
        await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: revision,
            change: { section: "budget", amount: "", reason: "" },
          },
          recordAuditEvent,
        ),
      ).toEqual({ status: "ok", revision });
      expect(
        await editFundingRound(
          db,
          actor,
          {
            ...address,
            expectedRevision: revision++,
            change: { section: "budget", amount: "250", reason: "Replacement approved" },
          },
          recordAuditEvent,
        ),
      ).toEqual({ status: "ok", revision });

      const page = await getFundingRoundPage(db, actor, { ...address, kind: "round" });

      expect(page?.preparation.budgetHistory[0]).toMatchObject({
        reason: "Replacement approved",
        before: null,
        after: { minorUnits: "25000" },
      });
    }
  });

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
          recordAuditEvent,
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
      recordAuditEvent,
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
        recordAuditEvent,
      ),
    ).toEqual({ status: "ok", revision: 1 });
    expect(
      (
        await database.client.query<{ action: string }>(
          "SELECT action FROM round_changes ORDER BY revision",
        )
      ).rows,
    ).toEqual([{ action: "create" }, { action: "budget" }]);
  });

  it("preserves the criteria used by an earlier assessment when the round's criteria change", async ({
    db,
  }) => {
    const address = await create(db);
    const criteria = [
      {
        id: "6efcf58d-9f20-5247-b614-658b7c5b6fad",
        title: "Fit",
        description: "Connection to the round's purpose",
      },
    ];
    const prepared = await editFundingRound(
      db,
      actor,
      {
        ...address,
        expectedRevision: 0,
        change: { section: "criteria", criteria },
      },
      recordAuditEvent,
    );
    assert(prepared.status === "ok");
    const applicationAddress = await createApplication(db, address.publicId);
    const contact = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug,
        contactId: randomUUID(),
        action: "create" as const,
        details: { name: "Sam", email: "", affiliation: "" },
      },
      fundingRoundContactUsage,
    );
    assert(contact.status === "ok");
    const recorded = await saveApplicationReview(
      db,
      actor,
      {
        ...applicationAddress,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(2),
        change: {
          action: "record",
          id: randomUUID(),
          contactId: contact.contact.id,
          requestId: null,
          previousId: null,
          content: {
            applicationVersion: materialVersionSchema.parse(1),
            criteriaVersion: criteriaVersionSchema.parse(2),
            date: null,
            position: null,
            amount: null,
            reasoning: "The meals support the round's purpose.",
            observations: [
              {
                criterionId: criteria[0]!.id,
                criterion: criteria[0]!.title,
                text: "Strong connection.",
              },
            ],
          },
        },
      },
      recordAuditEvent,
    );
    assert(recorded.status === "ok");

    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 1,
          change: { section: "criteria", criteria: [] },
        },
        recordAuditEvent,
      ),
    ).toEqual({ status: "ok", revision: 2 });

    const page = await getFundingApplicationPage(db, actor, applicationAddress);

    assert.isNotNull(page);
    expect(page.round).toMatchObject({
      criteria: [],
      criteriaVersion: 3,
      criteriaHistory: [
        { version: 1, criteria: [] },
        { version: 2, criteria },
        { version: 3, criteria: [] },
      ],
    });
    expect(page.application.reviews.assessments).toMatchObject([
      {
        versions: [
          {
            content: {
              criteriaVersion: 2,
              observations: [
                { criterionId: criteria[0]!.id, criterion: "Fit", text: "Strong connection." },
              ],
            },
            criteria,
          },
        ],
      },
    ]);
    expect(page.application.assessments).toMatchObject([{ criteriaChanged: true }]);
  });

  it("keeps a round containing an application when deletion is requested", async ({ db }) => {
    const address = await create(db);
    const applicationAddress = await createApplication(db, address.publicId);

    expect(
      await deleteFundingRound(
        db,
        actor,
        { ...address, expectedRevision: 0 },
        roundHasApplications,
        recordAuditEvent,
      ),
    ).toEqual({
      status: "invalid",
      error: "round_not_empty",
    });

    expect(await getFundingRoundPage(db, actor, { ...address, kind: "round" })).toMatchObject({
      preparation: { revision: 0 },
      round: { applications: [{ title: "Community meals" }] },
    });
    expect(await getFundingApplicationPage(db, actor, applicationAddress)).not.toBeNull();
  });

  it("checks for applications without decoding their content when deleting a round", async ({
    db,
    database,
  }) => {
    const address = await create(db);
    const application = await createApplication(db, address.publicId);
    await database.client.query(
      "UPDATE application_cases SET attention = '{}'::jsonb WHERE id = $1",
      [application.publicId],
    );

    expect(
      await deleteFundingRound(
        db,
        actor,
        { ...address, expectedRevision: 0 },
        roundHasApplications,
        recordAuditEvent,
      ),
    ).toEqual({
      status: "invalid",
      error: "round_not_empty",
    });
    expect(
      (
        await database.client.query("SELECT id FROM funding_rounds WHERE id = $1", [
          address.publicId,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await database.client.query(
          "SELECT action FROM round_changes WHERE round_id = $1 ORDER BY revision",
          [address.publicId],
        )
      ).rows,
    ).toEqual([{ action: "create" }]);
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
        recordAuditEvent,
      ),
    ).toEqual({ status: "invalid", error: "manager_unavailable" });

    expect(await getFundingRoundPage(db, actor, { ...address, kind: "round" })).toMatchObject({
      preparation: { revision: 0 },
      round: { managerUserId: "dana", manager: "Dana Reed" },
    });
  });

  it("preserves the recommendation's author when responsibility moves to another manager", async ({
    db,
  }) => {
    const address = await create(db);
    const applicationAddress = await createReadyApplication(db, address.publicId);
    await addManager(db);
    const saved = await saveFundingRecommendation(
      db,
      actor,
      {
        ...applicationAddress,
        expectedRevision: 0,
        expectedApplicationVersion: 1,
        recommendation,
      },
      recordAuditEvent,
    );
    assert(saved.status === "ok");

    expect(
      await editFundingRound(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { section: "manager", userId: "pat" },
        },
        recordAuditEvent,
      ),
    ).toEqual({ status: "ok", revision: 1 });

    const page = await getFundingRoundPage(db, actor, { ...address, kind: "round" });
    const application = await getFundingApplicationPage(db, actor, applicationAddress);

    expect(page?.round).toMatchObject({
      managerUserId: "pat",
      manager: "Pat Taylor",
      applications: [{ managerRecommendation: { author: { userId: "dana", name: "Dana Reed" } } }],
    });
    expect(application?.application.managerRecommendation).toEqual(saved.recommendation);
  });

  it("attributes a recommendation to its authenticated recorder despite a supplied author", async ({
    db,
  }) => {
    const address = await create(db);
    const applicationAddress = await createReadyApplication(db, address.publicId);
    const saved = await saveFundingRecommendation(
      db,
      actor,
      {
        ...applicationAddress,
        expectedRevision: 0,
        expectedApplicationVersion: 1,
        recommendation: {
          ...recommendation,
          author: { userId: "pat", name: "Forged author" },
        },
      },
      recordAuditEvent,
    );

    assert(saved.status === "ok");
    const application = await getFundingApplicationPage(db, actor, applicationAddress);

    const author = {
      userId: "dana",
      name: "Dana Reed",
      provenance: { interface: "web" },
    };

    expect(saved.recommendation.author).toEqual(author);
    expect(application?.application.managerRecommendation?.author).toEqual(author);
  });

  it("retains the responsible manager's name and requests reassignment after grant access is lost", async ({
    db,
    database,
  }) => {
    const address = await create(db);
    await addManager(db);

    await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");

    expect(
      (await getFundingRoundPage(db, { userId: "pat" }, { ...address, kind: "round" }))?.round,
    ).toMatchObject({ manager: "Dana Reed", managerNeedsReassignment: true });
  });
});

it("creates optional round details atomically and validates dates and budgets before writing", async ({
  db,
}) => {
  const request = {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Composer round",
    purpose: "Shared local work",
    budget: "0.00",
    meetingDate: "2027-03-15",
  };

  expect(
    await createFundingRound(
      db,
      actor,
      { ...request, meetingDate: "2027-02-30" },
      recordAuditEvent,
    ),
  ).toMatchObject({ status: "invalid" });
  expect(
    await createFundingRound(db, actor, { ...request, budget: "-1" }, recordAuditEvent),
  ).toMatchObject({
    status: "invalid",
  });

  const created = await createFundingRound(db, actor, request, recordAuditEvent);

  if (created.status !== "ok") {
    throw new Error("Creation failed");
  }
  expect(
    await createFundingRound(db, actor, { ...request, purpose: "Changed retry" }, recordAuditEvent),
  ).toEqual(created);

  const page = (await getFundingRoundPage(db, actor, {
    workspaceSlug,
    publicId: created.publicId,
    kind: "round",
  }))!;

  expect(page.round).toMatchObject({
    title: "Composer round",
    purpose: request.purpose,
    meetingDate: request.meetingDate,
    managerUserId: "dana",
    decisionStatus: "Preparing",
  });
  expect(toDecimal(page.round.budget!)).toBe("0.00");
  expect(page.preparation.revision).toBe(0);
});

it("retains IDs through renaming and reordering criteria with duplicate titles", async ({ db }) => {
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
      recordAuditEvent,
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
      recordAuditEvent,
    ),
  ).toEqual({ status: "ok", revision: 2 });
  const page = await getFundingRoundPage(db, actor, { ...address, kind: "round" });
  expect(page?.round).toMatchObject({
    criteria: [second, renamed],
    criteriaHistory: [
      { version: 1, criteria: [] },
      { version: 2, criteria: [first, second] },
      { version: 3, criteria: [second, renamed] },
    ],
  });
});
