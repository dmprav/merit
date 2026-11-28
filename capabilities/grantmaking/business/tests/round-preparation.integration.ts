import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, describe, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import { changeWorkspaceContact } from "@merit/contacts/server";
import {
  getFundingRoundPage,
  getFundingRoundOverview,
  getFundingApplicationPage,
  listFundingRounds,
} from "@merit/grantmaking/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { readWorkspace } from "@merit/organizations/transactions";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { isCurrentAssessment } from "@merit/reviews/server/integrations";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound, editFundingRound, deleteFundingRound } from "@merit/rounds/server";

import { applicationWork } from "./application-work";
import { roundCommitments } from "./application-work";
import { contactWork } from "./contact-work";

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

const createApplication = async (db: NodePgDatabase, roundId: string) => {
  const result = await createFundingApplication(db, actor, {
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
  });

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
            `GRANT SELECT ON app_users, memberships, organizations, funding_rounds, criteria_versions, criteria_version_items, application_cases, committee_decision_versions TO ${role}`,
          ),
        );
        await tx.execute(sql.raw(`GRANT UPDATE (name) ON organizations TO ${role}`));
        await tx.execute(sql.raw(`GRANT UPDATE (id) ON app_users TO ${role}`));
        await tx.execute(sql.raw(`GRANT UPDATE (user_id) ON memberships TO ${role}`));
        await tx.execute(sql.raw(`GRANT INSERT, DELETE, UPDATE ON funding_rounds TO ${role}`));
        await tx.execute(
          sql.raw(`GRANT SELECT, INSERT ON audit_events, round_creation_receipts TO ${role}`),
        );
        await tx.execute(
          sql.raw(`GRANT INSERT ON criteria_versions, criteria_version_items TO ${role}`),
        );
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));

        expect(
          (await tx.execute(sql`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`)).rows,
        ).toEqual([{ rolsuper: false }]);

        const request = { workspaceSlug, requestId: randomUUID(), title: "Runtime grants" };
        const created = await createFundingRound(tx, actor, request);

        expect(created.status).toBe("ok");
        if (created.status !== "ok") {
          throw new Error("Creation failed");
        }
        expect(await createFundingRound(tx, actor, request)).toEqual(created);

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
            roundCommitments,
          ),
        ).toEqual({ status: "ok", revision: 1 });

        // Editing needs only the round; the page also reads application content.
        await tx.execute(sql.raw(`RESET ROLE`));
        await tx.execute(
          sql.raw(
            `GRANT SELECT ON application_cases, contacts, material_versions, material_version_answers, material_version_evidence, material_drafts, material_draft_answers, review_states, review_requests, assessments, assessment_versions, assessment_version_observations, recommendation_versions, committee_decision_versions TO ${role}`,
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
          ),
        ).toEqual({
          status: "ok",
        });
        expect(await getFundingRoundPage(tx, actor, { ...address, kind: "round" })).toBeNull();
        expect(await createFundingRound(tx, actor, request)).toEqual({
          status: "invalid",
          error: "round_deleted",
        });
        expect(
          (
            await readWorkspace(tx, actor.userId, workspaceSlug, (scoped) =>
              scoped.execute(sql`SELECT action FROM audit_events ORDER BY target_revision`),
            )
          ).rows,
        ).toEqual([
          { action: "round.created" },
          { action: "round.budget_changed" },
          { action: "round.deleted" },
        ]);
        expect(
          (
            await tx.execute(
              sql`SELECT has_table_privilege(current_user, 'audit_events', 'UPDATE') AS update, has_table_privilege(current_user, 'audit_events', 'DELETE') AS delete`,
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

  it("reads a new round's undecided preparation through its page, overview, and list", async ({
    db,
  }) => {
    const created = await createFundingRound(db, actor, {
      workspaceSlug,
      requestId: randomUUID(),
      title: "  New round  ",
    });
    assert(created.status === "ok");

    const page = await getFundingRoundPage(db, actor, {
      workspaceSlug,
      publicId: created.publicId,
      kind: "round",
    });

    expect(page?.round).toMatchObject({
      id: created.publicId,
      title: "New round",
      budget: null,
      meetingDate: null,
      decisionStatus: "Preparing",
      managerUserId: "dana",
      managerNeedsReassignment: false,
      applicationCount: 0,
      totals: { remaining: null },
    });
    expect(
      await getFundingRoundOverview(db, actor, { workspaceSlug, roundId: created.publicId }),
    ).toMatchObject({ status: "ok", round: { roundId: created.publicId, budget: null } });
    const listed = await listFundingRounds(db, actor, workspaceSlug);
    assert(listed.status === "ok");
    expect(listed.rounds.find((round) => round.publicId === created.publicId)).toMatchObject({
      budget: null,
      manager: "Dana Reed",
      managerNeedsReassignment: false,
    });
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
      roundCommitments,
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
      contactWork,
    );
    assert(contact.status === "ok");
    const recorded = await saveApplicationReview(db, actor, {
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
    });
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
        roundCommitments,
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
      ),
    ).toEqual({
      status: "invalid",
      error: "round_not_empty",
    });

    expect(await getFundingRoundPage(db, actor, { ...address, kind: "round" })).toMatchObject({
      preparation: { revision: 0 },
      round: { applicationCount: 1 },
    });
    expect(await getFundingApplicationPage(db, actor, applicationAddress)).toMatchObject({
      application: { title: "Community meals" },
    });
  });

  it("checks for applications without decoding their content when deleting a round", async ({
    db,
    database,
  }) => {
    const address = await create(db);
    const application = await createApplication(db, address.publicId);
    await database.client.query(
      "UPDATE application_cases SET attention = ARRAY['unrelated']::text[] WHERE id = $1",
      [application.publicId],
    );

    expect(
      await deleteFundingRound(
        db,
        actor,
        { ...address, expectedRevision: 0 },
        roundHasApplications,
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
          "SELECT action FROM audit_events WHERE target_type='round' AND target_id = $1 ORDER BY target_revision",
          [address.publicId],
        )
      ).rows,
    ).toEqual([{ action: "round.created" }]);
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
      isCurrentAssessment,
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
        roundCommitments,
      ),
    ).toEqual({ status: "ok", revision: 1 });

    const page = await getFundingRoundPage(db, actor, { ...address, kind: "round" });
    const application = await getFundingApplicationPage(db, actor, applicationAddress);

    expect(page?.round).toMatchObject({
      managerUserId: "pat",
      manager: "Pat Taylor",
    });
    expect(application?.application.managerRecommendation?.author).toMatchObject({
      userId: "dana",
      name: "Dana Reed",
    });
    expect(application?.application.managerRecommendation).toEqual(saved.recommendation);
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

  it("lists manager and reassignment state for active, former, and unassigned round managers", async ({
    db,
    database,
  }) => {
    const active = await create(db);
    const former = await create(db);
    const unassigned = await create(db);
    await addManager(db);

    const assigned = await editFundingRound(
      db,
      actor,
      {
        ...active,
        expectedRevision: 0,
        change: { section: "manager", userId: "pat" },
      },
      roundCommitments,
    );
    assert(assigned.status === "ok");

    await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");
    await database.client.query(
      "UPDATE funding_rounds SET manager_user_id = NULL, manager_name = '' WHERE id = $1",
      [unassigned.publicId],
    );

    const listed = await listFundingRounds(db, { userId: "pat" }, workspaceSlug);
    assert(listed.status === "ok");

    expect(listed.rounds.find((round) => round.publicId === active.publicId)).toMatchObject({
      manager: "Pat Taylor",
      managerNeedsReassignment: false,
    });
    expect(listed.rounds.find((round) => round.publicId === former.publicId)).toMatchObject({
      manager: "Dana Reed",
      managerNeedsReassignment: true,
    });
    expect(listed.rounds.find((round) => round.publicId === unassigned.publicId)).toMatchObject({
      manager: "",
      managerNeedsReassignment: true,
    });
  });
});
