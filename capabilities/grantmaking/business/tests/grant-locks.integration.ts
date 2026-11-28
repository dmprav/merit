import { randomUUID } from "node:crypto";

import type { Client } from "pg";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import type { Database } from "@merit/db";
import { getFundingApplicationPage, getFundingRoundPage } from "@merit/grantmaking/server";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { createInlineOrganizationService } from "@merit/organizations/server/testing";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { revokeMembershipReviews } from "@merit/reviews/server/integrations";
import { createInlineReviewerService } from "@merit/reviews/testing";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";
import { databaseTest } from "@merit/test-support/database";

import { applicationWork } from "./application-work";
import { roundCommitments } from "./application-work";
import { contactWork } from "./contact-work";

const actor = { userId: "dana" };
const workspaceSlug = "alder";
const it = databaseTest.extend("exampleRounds", { auto: true }, async ({ db }) =>
  seedExampleRounds(db),
);

const createRound = async (db: Database) => {
  const result = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Concurrent grant work",
  });

  if (result.status !== "ok") {
    throw new Error("Round creation failed");
  }

  return result.publicId;
};

const fixture = async (db: Database, email = "sam@example.test") => {
  const roundId = await createRound(db);
  const application = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: roundId,
    requestId: randomUUID(),
    title: "Community meals",
  });

  if (application.status !== "ok") {
    throw new Error("Application creation failed");
  }

  const contact = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug,
      contactId: randomUUID(),
      action: "create" as const,
      details: { name: "Sam", email, affiliation: "" },
    },
    contactWork,
  );

  if (contact.status !== "ok") {
    throw new Error("Contact creation failed");
  }

  return { roundId, applicationId: application.publicId, contact: contact.contact };
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

const roundEdit = (connection: Database, data: Fixture) =>
  editFundingRound(
    connection,
    actor,
    {
      workspaceSlug,
      publicId: data.roundId,
      expectedRevision: 0,
      change: { section: "details", title: "Updated round", purpose: "", meetingDate: null },
    },
    roundCommitments,
  );

const updateProfile = (connection: Database, data: Fixture) =>
  changeWorkspaceContact(
    connection,
    actor,
    {
      workspaceSlug,
      contactId: data.contact.id,
      action: "update",
      details: { name: "Updated contact", email: "sam@example.test", affiliation: "" },
    },
    contactWork,
  );

const edits = {
  application: (connection: Database, data: Fixture) =>
    editFundingApplication(
      connection,
      actor,
      {
        workspaceSlug,
        publicId: data.applicationId,
        expectedRevision: 0,
        change: { action: "save_content", content: { title: "Updated community meals" } },
      },
      applicationWork,
    ),
  intakeContact: (connection: Database, data: Fixture) =>
    editFundingApplication(
      connection,
      actor,
      {
        workspaceSlug,
        publicId: data.applicationId,
        expectedRevision: 0,
        change: {
          action: "save_content",
          content: { title: "Community meals" },
          contactId: data.contact.id,
        },
      },
      applicationWork,
    ),
  review: (connection: Database, data: Fixture) =>
    saveApplicationReview(connection, actor, {
      workspaceSlug,
      publicId: data.applicationId,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: {
        action: "request",
        id: randomUUID(),
        contactId: data.contact.id,
        replacesId: null,
      },
    }),
};

it.for(Object.entries({ contactProfile: updateProfile, ...edits }))(
  "allows editing %s while another round has an uncommitted edit",
  async ([, edit], { db, locks }) => {
    const a = await fixture(db);
    const b = await fixture(db);
    const commit = await locks.hold((tx) => roundEdit(tx, a));

    expect(await edit(locks.second, b)).toMatchObject({ status: "ok" });
    // The first round remains uncommitted while the independent edit finishes.
    expect(
      (
        await getFundingRoundPage(db, actor, {
          workspaceSlug,
          publicId: a.roundId,
          kind: "round",
        })
      )?.round.title,
    ).toBe("Concurrent grant work");

    await commit();
  },
);

const revoke = async (connection: Database, observer: Client) => {
  const member = (
    await observer.query<{ id: string; version: number }>(
      "SELECT id, version FROM memberships WHERE organization_id = 'alder' AND user_id = 'dana'",
    )
  ).rows[0];

  assert.isDefined(member);

  const service = createInlineOrganizationService({
    revokeReviewAccess: revokeMembershipReviews,
    database: async (operation) => operation(connection),
    isOperator: async () => false,
    verifiedEmails: async () => [],
    sendInvitation: async () => {
      throw new Error("No email expected");
    },
    invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.example.test").href,
  });

  return service.removeMember(
    { userId: "local-workspace-manager" },
    {
      workspaceSlug,
      userId: "dana",
      expectedMembershipId: member.id,
      expectedMembershipVersion: member.version,
      expectedInvitationIds: [],
    },
  );
};

it("finishes an authorized edit before a concurrent membership revocation", async ({
  db,
  locks,
  database,
}) => {
  const data = await fixture(db);
  const revocation = await locks.race(
    (tx) => roundEdit(tx, data),
    (second) => revoke(second, database.client),
  );

  expect(revocation).toMatchObject({ status: "ok" });
  expect(await roundEdit(db, data)).toEqual({ status: "not_found" });
  expect(
    (
      await database.client.query<{ action: string }>(
        "SELECT action FROM audit_events WHERE target_type='round' AND target_id = $1 ORDER BY target_revision",
        [data.roundId],
      )
    ).rows,
  ).toEqual([{ action: "round.created" }, { action: "round.details_changed" }]);
});

it("checks access again after waiting for membership revocation", async ({
  db,
  locks,
  database,
}) => {
  const data = await fixture(db);
  const edit = await locks.race(
    (tx) => revoke(tx, database.client),
    (second) => roundEdit(second, data),
  );

  expect(edit).toEqual({ status: "not_found" });
  expect(
    (
      await database.client.query(
        "SELECT target_revision AS revision FROM audit_events WHERE target_type='round' AND target_id = $1",
        [data.roundId],
      )
    ).rows,
  ).toEqual([{ revision: 0 }]);
});

const archive = (connection: Database, data: Fixture) =>
  changeWorkspaceContact(
    connection,
    actor,
    {
      workspaceSlug,
      contactId: data.contact.id,
      action: "archive",
      expectedContactRevision: data.contact.revision,
    },
    contactWork,
  );

it("rejects contact archival after waiting for an outstanding review request", async ({
  db,
  locks,
}) => {
  const data = await fixture(db);
  const archival = await locks.race(
    (tx) => edits.review(tx, data),
    (second) => archive(second, data),
  );

  expect(archival).toMatchObject({ status: "invalid", error: "outstanding_requests" });
});

it("rejects a review request after waiting for contact archival", async ({ db, locks }) => {
  const data = await fixture(db);
  const review = await locks.race(
    (tx) => archive(tx, data),
    (second) => edits.review(second, data),
  );

  expect(review).toEqual({ status: "invalid", error: "contact_unavailable" });
  expect(
    (
      await getFundingApplicationPage(db, actor, {
        workspaceSlug,
        publicId: data.applicationId,
      })
    )?.application.reviews.requests ?? [],
  ).toEqual([]);
});

const reviewerService = (connection: Database) =>
  createInlineReviewerService({
    database: async (operation) => operation(connection),
    send: async () => {},
    reviewerUrl: (_, id) => `https://merit.test/work/${id}`,
    managerUrl: (_, id) => `https://merit.test/applications/${id}`,
  });

const requestedReview = async (db: Database, observer: Client, email: string) => {
  const data = await fixture(db, email);
  await observer.query("INSERT INTO app_users (id, name) VALUES ($1, 'Reviewer')", [email]);
  await observer.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', $1, $1, 'reviewer')",
    [email],
  );
  const requestId = randomUUID();
  expect(
    await saveApplicationReview(db, actor, {
      workspaceSlug,
      publicId: data.applicationId,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: { action: "request", id: requestId, contactId: data.contact.id, replacesId: null },
    }),
  ).toMatchObject({ status: "ok" });
  return {
    workspaceSlug,
    publicId: data.applicationId,
    requestId,
    commandId: randomUUID(),
    dueDate: null,
  };
};

it.for(["invite", "resend"] as const)(
  "holds the last workspace invitation slot for a %s while an independent round edit commits",
  async (firstAction, { db, locks, database }) => {
    const original = await requestedReview(db, database.client, "sam@example.test");
    const next = await requestedReview(db, database.client, "robin@example.test");
    const independent = await fixture(db);
    expect(await reviewerService(db).invite(actor, original)).toMatchObject({ status: "ok" });
    // Nineteen prior invitations, outside the per-recipient cooldown.
    await database.client.query(
      "UPDATE reviewer_messages SET created_at = now() - interval '2 minutes'",
    );
    await database.client.query(
      `INSERT INTO reviewer_messages (id, assignment_id, kind, recipient, created_at)
     SELECT gen_random_uuid(), $1, 'invitation', 'sam@example.test', now() - interval '2 minutes'
     FROM generate_series(1,18)`,
      [original.commandId],
    );

    const invite = (connection: Database) => reviewerService(connection).invite(actor, next);

    const resend = (connection: Database) =>
      reviewerService(connection).manage(actor, {
        workspaceSlug,
        publicId: original.publicId,
        assignmentId: original.commandId,
        commandId: randomUUID(),
        expectedRevision: 0,
        action: "resend",
        note: "",
      });

    const commit = await locks.hold(firstAction === "invite" ? invite : resend);
    expect(await roundEdit(locks.second, independent)).toMatchObject({ status: "ok" });
    const competing = await locks.finishBlocked(
      (firstAction === "invite" ? resend : invite)(locks.second),
      commit,
    );
    expect(competing).toEqual({ status: "limited" });
    expect(
      (await database.client.query("SELECT id FROM reviewer_messages WHERE kind = 'invitation'"))
        .rowCount,
    ).toBe(20);
  },
);

it("commits an unrelated reviewer draft while a contact profile edit is open", async ({
  db,
  locks,
  database,
}) => {
  const email = "robin@example.test";
  const review = await requestedReview(db, database.client, email);
  const service = reviewerService(db);
  const invited = await service.invite(actor, review);
  assert(invited.status === "ok");
  const assignmentId = invited.value.id;
  const reviewer = { userId: email };
  expect(
    await service.respond(reviewer, {
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: 0,
      action: "accept",
      note: "",
    }),
  ).toMatchObject({ status: "ok" });
  const independent = await fixture(db);

  const commit = await locks.hold((tx) => updateProfile(tx, independent));
  expect(
    await reviewerService(locks.second).saveDraft(reviewer, {
      assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: 0,
      draft: {
        position: "Fund",
        amount: "40.00",
        reasoning: "Reviewed",
        observations: [],
        note: "",
      },
    }),
  ).toEqual({ status: "ok", value: { revision: 1 } });
  await commit();
});

it("records the updated reviewer name after waiting for a contact profile edit", async ({
  db,
  locks,
  database,
}) => {
  const data = await fixture(db);
  const request = await locks.race(
    (tx) => updateProfile(tx, data),
    (second) => edits.review(second, data),
  );
  expect(request).toMatchObject({ status: "ok" });
  expect(
    (
      await database.client.query("SELECT reviewer FROM review_requests WHERE case_id = $1", [
        data.applicationId,
      ])
    ).rows,
  ).toEqual([{ reviewer: "Updated contact" }]);
});
