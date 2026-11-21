import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { assert, afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import {
  createFundingApplication,
  editFundingApplication,
  selectApplicationContact,
} from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import { changeWorkspaceContact } from "@merit/contacts/server";
import type { Database } from "@merit/db";
import { migrate } from "@merit/db/migrate";
import { getFundingApplicationPage, getFundingRoundPage } from "@merit/grantmaking/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { createOrganizationService } from "@merit/organizations/server";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { createReviewerService, saveApplicationReview } from "@merit/reviews/server";
import { revokeMembershipReviews } from "@merit/reviews/server/integrations";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound, deleteFundingRound, editFundingRound } from "@merit/rounds/server";
import { createTestDatabase } from "@merit/test-support/test-database";

import { applicationWork } from "./application-work";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let db: Database;
let first: Client;
let second: Client;
let firstPid: number;
let secondPid: number;
let releases: (() => void)[];
let pending: Promise<unknown>[];
const actor = { userId: "dana" };
const workspaceSlug = "alder";

beforeAll(async () => {
  database = await createTestDatabase();
  db = drizzle(database.client);
  await migrate(database.client);
});
beforeEach(async () => {
  releases = [];
  pending = [];
  await database.client.query("TRUNCATE organizations, app_users CASCADE");
  await seedExampleRounds(db);
  const options = { connectionString: database.connectionString, statement_timeout: 3000 };
  first = new Client(options);
  second = new Client(options);
  await Promise.all([first.connect(), second.connect()]);
  const firstBackend = (await first.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
    .rows[0];

  assert.isDefined(firstBackend);

  firstPid = firstBackend.pid;
  const secondBackend = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
    .rows[0];

  assert.isDefined(secondBackend);

  secondPid = secondBackend.pid;
});
afterEach(async () => {
  for (const release of releases) {
    release();
  }
  await Promise.allSettled(pending);
  await Promise.all([first?.end(), second?.end()]);
});
afterAll(async () => database?.dispose());

const barrier = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

const track = <T extends Promise<unknown>>(promise: T) => {
  // Attach rejection handling immediately, including when a blocking assertion fails.
  pending.push(promise.catch(() => undefined));
  return promise;
};

const hold = async (operation: (tx: Database) => Promise<{ status: string }>) => {
  const ready = barrier();
  const release = barrier();
  releases.push(release.open);
  const transaction = track(
    drizzle(first).transaction(async (tx) => {
      expect(await operation(tx)).toMatchObject({ status: "ok" });

      ready.open();
      await release.promise;
    }),
  );
  await Promise.race([ready.promise, transaction]);

  return async () => {
    release.open();
    await transaction;
  };
};

const expectBlocked = () =>
  expect
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

const createRound = async () => {
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

const fixture = async (email = "sam@example.test") => {
  const roundId = await createRound();
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
    fundingRoundContactUsage,
  );

  if (contact.status !== "ok") {
    throw new Error("Contact creation failed");
  }

  return { roundId, applicationId: application.publicId, contact: contact.contact };
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

const roundEdit = (connection: Database, data: Fixture) =>
  editFundingRound(connection, actor, {
    workspaceSlug,
    publicId: data.roundId,
    expectedRevision: 0,
    change: { section: "details", title: "Updated round", purpose: "", meetingDate: null },
  });

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
    fundingRoundContactUsage,
  );

const archiveContact = (connection: Database, data: Fixture) =>
  changeWorkspaceContact(
    connection,
    actor,
    {
      workspaceSlug,
      contactId: data.contact.id,
      action: "archive",
      expectedContactRevision: 0,
    },
    fundingRoundContactUsage,
  );

const revisionProtectedEdits = {
  round: roundEdit,
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

const edits = revisionProtectedEdits;

it.each(Object.entries({ contactProfile: updateProfile, ...revisionProtectedEdits }))(
  "allows editing %s while another round has an uncommitted edit",
  async (_, edit) => {
    const a = await fixture();
    const b = await fixture();
    const commit = await hold((tx) => roundEdit(tx, a));

    expect(await edit(drizzle(second), b)).toMatchObject({ status: "ok" });
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

it.each(Object.entries({ contactArchive: archiveContact, ...revisionProtectedEdits }))(
  "serializes competing %s edits and rejects the stale revision",
  async (_, edit) => {
    const data = await fixture();
    const commit = await hold((tx) => edit(tx, data));
    const competing = track(edit(drizzle(second), data));
    await expectBlocked();
    await commit();

    expect(await competing).toEqual({ status: "conflict" });
  },
);

it("serializes competing Tier 1 contact updates and applies the later details", async () => {
  const data = await fixture();
  const commit = await hold((tx) => updateProfile(tx, data));
  const competing = track(
    changeWorkspaceContact(
      drizzle(second),
      actor,
      {
        workspaceSlug,
        contactId: data.contact.id,
        action: "update",
        details: { name: "Later contact", email: "sam@example.test", affiliation: "" },
      },
      fundingRoundContactUsage,
    ),
  );
  await expectBlocked();
  await commit();

  expect(await competing).toMatchObject({
    status: "ok",
    contact: { name: "Later contact", revision: 2 },
  });
});

it("serializes competing Tier 1 contact selections and applies the later choice", async () => {
  const data = await fixture();
  const commit = await hold((tx) =>
    selectApplicationContact(tx, actor, {
      workspaceSlug,
      publicId: data.applicationId,
      contactId: data.contact.id,
    }),
  );
  const competing = track(
    selectApplicationContact(drizzle(second), actor, {
      workspaceSlug,
      publicId: data.applicationId,
      contactId: null,
    }),
  );
  await expectBlocked();
  await commit();

  expect(await competing).toMatchObject({ status: "ok" });
  expect(
    (
      await getFundingApplicationPage(db, actor, {
        workspaceSlug,
        publicId: data.applicationId,
      })
    )?.application.contactId,
  ).toBeNull();
});

it("deletes an empty round while another round has an uncommitted edit", async () => {
  const data = await fixture();
  const emptyRound = await createRound();
  const commit = await hold((tx) => roundEdit(tx, data));

  expect(
    await deleteFundingRound(
      drizzle(second),
      actor,
      {
        workspaceSlug,
        publicId: emptyRound,
        expectedRevision: 0,
      },
      roundHasApplications,
    ),
  ).toEqual({ status: "ok" });

  await commit();
});

const revoke = async (connection: Database) => {
  const member = (
    await database.client.query<{ id: string; version: number }>(
      "SELECT id, version FROM memberships WHERE organization_id = 'alder' AND user_id = 'dana'",
    )
  ).rows[0];

  assert.isDefined(member);

  const service = createOrganizationService({
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

it("finishes an authorized edit before a concurrent membership revocation", async () => {
  const data = await fixture();
  const commit = await hold((tx) => roundEdit(tx, data));
  const revocation = track(revoke(drizzle(second)));
  await expectBlocked();
  await commit();

  expect(await revocation).toMatchObject({ status: "ok" });
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

it("checks access again after waiting for membership revocation", async () => {
  const data = await fixture();
  const commit = await hold(revoke);
  const edit = track(roundEdit(drizzle(second), data));
  await expectBlocked();
  await commit();

  expect(await edit).toEqual({ status: "not_found" });
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
    fundingRoundContactUsage,
  );

it("rejects contact archival after waiting for an outstanding review request", async () => {
  const data = await fixture();
  const commit = await hold((tx) => edits.review(tx, data));
  const archival = track(archive(drizzle(second), data));
  await expectBlocked();
  await commit();

  expect(await archival).toMatchObject({ status: "invalid", error: "outstanding_requests" });
});

it("rejects a review request after waiting for contact archival", async () => {
  const data = await fixture();
  const commit = await hold((tx) => archive(tx, data));
  const review = track(edits.review(drizzle(second), data));
  await expectBlocked();
  await commit();

  expect(await review).toEqual({ status: "invalid", error: "contact_unavailable" });
  expect(
    (
      await getFundingApplicationPage(db, actor, {
        workspaceSlug,
        publicId: data.applicationId,
      })
    )?.application.reviews.requests ?? [],
  ).toEqual([]);
});

it.each(["round", "application"] as const)("keeps %s creation retries serialized", async (kind) => {
  const roundId = await createRound();
  const input = { workspaceSlug, requestId: randomUUID(), title: "Retried creation" };

  const create = async (connection: Database) =>
    kind === "round"
      ? createFundingRound(connection, actor, input)
      : createFundingApplication(connection, actor, { ...input, publicId: roundId });

  let publicId: string | undefined;
  const commit = await hold(async (tx) => {
    const result = await create(tx);
    if (result.status === "ok") {
      publicId = result.publicId;
    }
    return result;
  });
  const retry = track(create(drizzle(second)));
  await expectBlocked();
  await commit();

  expect(await retry).toEqual({ status: "ok", publicId });
});

it("allows independent application creates and rejects a competing cross-round receipt", async () => {
  const a = await createRound();
  const b = await createRound();

  const create = (connection: Database, publicId: string, requestId: string) =>
    createFundingApplication(connection, actor, {
      workspaceSlug,
      publicId,
      requestId,
      title: "Meals",
    });

  const sharedId = randomUUID();
  const commit = await hold((tx) => create(tx, a, sharedId));
  expect(await create(drizzle(second), b, randomUUID())).toMatchObject({ status: "ok" });
  const competing = track(create(drizzle(second), b, sharedId));
  await expectBlocked();
  await commit();
  expect(await competing).toEqual({ status: "invalid", error: "application_deleted" });
  expect(
    (await database.client.query("SELECT id FROM application_cases WHERE round_id = $1", [b]))
      .rowCount,
  ).toBe(1);
});

const reviewerService = (connection: Database) =>
  createReviewerService({
    database: async (operation) => operation(connection),
    send: async () => {},
    reviewerUrl: (_, id) => `https://merit.test/work/${id}`,
    managerUrl: (_, id) => `https://merit.test/applications/${id}`,
  });

const requestedReview = async (email: string) => {
  const data = await fixture(email);
  await database.client.query("INSERT INTO app_users (id, name) VALUES ($1, 'Reviewer')", [email]);
  await database.client.query(
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

it.each(["invite", "resend"] as const)(
  "holds the last workspace invitation slot for a %s while an independent round edit commits",
  async (firstAction) => {
    const original = await requestedReview("sam@example.test");
    const next = await requestedReview("robin@example.test");
    const independent = await fixture();
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

    const commit = await hold(firstAction === "invite" ? invite : resend);
    expect(await roundEdit(drizzle(second), independent)).toMatchObject({ status: "ok" });
    const competing = track((firstAction === "invite" ? resend : invite)(drizzle(second)));
    await expectBlocked();
    await commit();
    expect(await competing).toEqual({ status: "limited" });
    expect(
      (await database.client.query("SELECT id FROM reviewer_messages WHERE kind = 'invitation'"))
        .rowCount,
    ).toBe(20);
  },
);

it("commits an unrelated reviewer draft while a contact profile edit is open", async () => {
  const email = "robin@example.test";
  const review = await requestedReview(email);
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
  const independent = await fixture();

  const commit = await hold((tx) => updateProfile(tx, independent));
  expect(
    await reviewerService(drizzle(second)).saveDraft(reviewer, {
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

it("records the updated reviewer name after waiting for a contact profile edit", async () => {
  const data = await fixture();
  const commit = await hold((tx) => updateProfile(tx, data));
  const request = track(edits.review(drizzle(second), data));
  await expectBlocked();
  await commit();
  expect(await request).toMatchObject({ status: "ok" });
  expect(
    (
      await database.client.query("SELECT reviewer FROM review_requests WHERE case_id = $1", [
        data.applicationId,
      ])
    ).rows,
  ).toEqual([{ reviewer: "Updated contact" }]);
});
