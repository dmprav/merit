import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import type { IntakeChange } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import storedHistory from "@merit/applications/testing/history";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { encodeApplicationDetail } from "@merit/grantmaking/api";
import { getFundingApplicationPage, getFundingRoundPage } from "@merit/grantmaking/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { fromMinorUnits, toDecimal } from "@merit/money";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { encodeRecommendation } from "@merit/recommendations/api";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { createFundingRound, deleteFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

const setup = async (db: NodePgDatabase) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    title: "Intake round",
    requestId: randomUUID(),
  });

  if (round.status !== "ok") {
    throw new Error("Round creation failed");
  }

  const request = {
    workspaceSlug,
    publicId: round.publicId,
    title: "Community meals",
    requestId: randomUUID(),
  };
  const created = await createFundingApplication(db, actor, request);

  if (created.status !== "ok") {
    throw new Error("Application creation failed");
  }

  const address = { workspaceSlug, publicId: created.publicId };

  const read = async () => (await getFundingApplicationPage(db, actor, address))!;

  const change = async (change: IntakeChange) =>
    editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change,
      },
      applicationWork,
    );

  return { round, request, created, address, read, change };
};

const content = {
  title: "Community meals",
  applicant: "Neighbourhood Kitchen",
  requested: "24000.00",
  answers: [
    {
      questionId: "535419fe-0936-5505-9046-3d66510742c3",
      question: "Plan",
      response: "Weekly meals with local residents.",
    },
  ],
};

it("reads initial-format intake history without rewriting stored snapshots", async ({
  db,
  database,
}) => {
  const { created, read } = await setup(db);
  const original = (
    await database.client.query<{ before: unknown; after: unknown }>(
      "SELECT details->'before' AS before, details->'after' AS after FROM audit_events WHERE target_id = $1",
      [created.publicId],
    )
  ).rows;
  expect(original).toMatchObject([{ before: null, after: { formatVersion: 1 } }]);

  const snapshot = {
    ...storedHistory,
    application: { ...storedHistory.application, id: created.publicId },
  };
  await database.client.query(
    `INSERT INTO audit_events (target_type, target_id, target_revision, organization_id, actor_user_id, action, details)
     SELECT target_type, target_id, 1, organization_id, actor_user_id, 'application.summary_changed', jsonb_build_object('before', $2::jsonb, 'after', $2::jsonb)
     FROM audit_events WHERE target_id = $1 AND target_revision = 0`,
    [created.publicId, JSON.stringify(snapshot)],
  );
  const page = await read();
  expect(page.intake.history).toHaveLength(2);
  expect(page.intake.history[0]).toMatchObject({
    before: snapshot.application,
    after: snapshot.application,
  });
  expect(page.intake.history[1]).toMatchObject({ before: null, after: { id: created.publicId } });
  expect(
    (
      await database.client.query(
        "SELECT details->'before' AS before, details->'after' AS after FROM audit_events WHERE target_id = $1 ORDER BY target_revision",
        [created.publicId],
      )
    ).rows,
  ).toEqual([...original, { before: snapshot, after: snapshot }]);
});

const setupContact = async (db: NodePgDatabase) => {
  const saved = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug,
      contactId: randomUUID(),
      action: "create",
      details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
    },
    fundingRoundContactUsage,
  );
  assert(saved.status === "ok");
  return saved.contact;
};

it.for(["audit_events", "material_versions"])(
  "rolls back intake content, contact assignment and history when %s cannot be recorded",
  async (table, { db, database }) => {
    const { read, change } = await setup(db);
    const contact = await setupContact(db);
    const before = await read();
    await database.client.query(
      `ALTER TABLE ${table} ADD CONSTRAINT reject_intake_recording CHECK (false) NOT VALID`,
    );
    try {
      await expect(
        change({ action: "save_content", content, contactId: contact.id }),
      ).rejects.toThrow();
      expect(await read()).toEqual(before);
    } finally {
      await database.client.query(`ALTER TABLE ${table} DROP CONSTRAINT reject_intake_recording`);
    }
  },
);

it("leaves the revision and history unchanged when recorded intake is saved again", async ({
  db,
}) => {
  const { read, change } = await setup(db);
  await change({ action: "save_content", content });
  const before = await read();

  expect(await change({ action: "save_content", content })).toEqual({
    status: "ok",
    revision: before.intake.revision,
  });
  expect(await read()).toEqual(before);
  expect(await change({ action: "save_content", content, contactId: null })).toEqual({
    status: "ok",
    revision: before.intake.revision,
  });
  expect(await read()).toEqual(before);
});

it.for(["save_content", "save_revision"] as const)(
  "keeps the linked archived contact and history unchanged on an unchanged %s save",
  async (action, { db }) => {
    const { read, change } = await setup(db);
    const contact = await setupContact(db);
    assert(
      (await change({ action: "save_content", content, contactId: contact.id })).status === "ok",
    );
    if (action === "save_revision") {
      assert((await change({ action: "mark_ready" })).status === "ok");
      assert((await change({ action: "start_revision", kind: "revision" })).status === "ok");
    }
    expect(
      await changeWorkspaceContact(
        db,
        actor,
        {
          workspaceSlug,
          contactId: contact.id,
          action: "archive",
          expectedContactRevision: contact.revision,
        },
        fundingRoundContactUsage,
      ),
    ).toMatchObject({ status: "ok" });
    const before = await read();

    for (const contactId of [undefined, contact.id]) {
      expect(
        await change(
          action === "save_content"
            ? { action, content, contactId }
            : {
                action,
                draft: { ...before.intake.workingRevision!, content: { title: content.title } },
                contactId,
              },
        ),
      ).toEqual({ status: "ok", revision: before.intake.revision });
      expect(await read()).toEqual(before);
    }
  },
);

it.for([
  { action: "save_content", error: "revision_required" },
  { action: "save_revision", error: "revision_unavailable" },
] as const)(
  "checks stale revisions and contact eligibility before the %s state restriction",
  async ({ action, error }, { db }) => {
    const { address, read, change } = await setup(db);
    const contact = await setupContact(db);
    assert((await change({ action: "save_content", content })).status === "ok");
    assert((await change({ action: "mark_ready" })).status === "ok");
    const before = await read();
    const edit: IntakeChange =
      action === "save_content"
        ? { action, content: { title: "Changed" }, contactId: randomUUID() }
        : {
            action,
            draft: { kind: "revision", reason: "New request", content: { title: "Changed" } },
            contactId: randomUUID(),
          };

    expect(
      await editFundingApplication(
        db,
        actor,
        {
          ...address,
          expectedRevision: before.intake.revision - 1,
          change: edit,
        },
        applicationWork,
      ),
    ).toEqual({ status: "conflict" });
    expect(await change(edit)).toEqual({ status: "invalid", error: "contact_unavailable" });
    expect(await change({ ...edit, contactId: contact.id })).toEqual({ status: "invalid", error });
    expect(await read()).toEqual(before);
  },
);

const recommend = async (
  db: NodePgDatabase,
  scenario: Awaited<ReturnType<typeof setup>>,
  position: "Fund" | "Defer" = "Fund",
) => {
  const page = await scenario.read();
  return saveFundingRecommendation(db, actor, {
    ...scenario.address,
    expectedRevision: page.recommendationVersion,
    expectedApplicationVersion: page.application.version,
    recommendation: encodeRecommendation({
      position,
      allocation: fromMinorUnits(position === "Fund" ? 2400000n : 0n),
      reasoning: "Consider the current request.",
    }),
  });
};

const setupRecommended = async (db: NodePgDatabase) => {
  const scenario = await setup(db);
  assert((await scenario.change({ action: "save_content", content })).status === "ok");
  assert((await scenario.change({ action: "mark_ready" })).status === "ok");
  assert((await recommend(db, scenario)).status === "ok");
  return scenario;
};

const stageRevision = async (scenario: Awaited<ReturnType<typeof setup>>) => {
  assert((await scenario.change({ action: "start_revision", kind: "revision" })).status === "ok");
  assert(
    (
      await scenario.change({
        action: "save_revision",
        draft: {
          kind: "revision",
          reason: "New venue costs",
          content: { ...content, requested: "28000.00" },
        },
      })
    ).status === "ok",
  );
};

it("retries empty application creation without adding content or history", async ({ db }) => {
  const { request, created, read } = await setup(db);
  const before = await read();

  expect(await createFundingApplication(db, actor, request)).toEqual(created);
  expect(await read()).toEqual(before);
  expect(before.application).toMatchObject({
    requested: null,
    intakeStatus: "in_preparation",
    managerRecommendation: null,
  });
  expect(before.intake.history).toHaveLength(1);
});

it("rejects readiness for incomplete intake without changing the application or history", async ({
  db,
}) => {
  const { read, change } = await setup(db);
  const before = await read();

  expect(await change({ action: "mark_ready" })).toMatchObject({
    status: "invalid",
    error: "incomplete_application",
  });
  expect(await read()).toEqual(before);
});

it("rejects funding for an application still in preparation without recording a recommendation", async ({
  db,
}) => {
  const scenario = await setup(db);
  const before = await scenario.read();

  expect(await recommend(db, scenario)).toMatchObject({
    status: "invalid",
    error: "application_not_ready",
  });
  expect(await scenario.read()).toEqual(before);
});

it("allows deferral while intake is incomplete", async ({ db }) => {
  const scenario = await setup(db);

  expect(await recommend(db, scenario, "Defer")).toMatchObject({ status: "ok" });
  expect(encodeApplicationDetail(await scenario.read()).application).toMatchObject({
    intakeStatus: "in_preparation",
    managerRecommendation: { position: "Defer", allocation: { minorUnits: "0", currency: "EUR" } },
  });
});

it("funds ready intake before a round budget has been set", async ({ db }) => {
  const scenario = await setup(db);
  assert((await scenario.change({ action: "save_content", content })).status === "ok");
  assert((await scenario.change({ action: "mark_ready" })).status === "ok");

  expect(await recommend(db, scenario)).toMatchObject({ status: "ok", budget: null });
  const page = await scenario.read();
  expect(toDecimal(page.round.totals.proposed)).toBe("24000.00");
  expect(page.application.managerRecommendation).toMatchObject({
    position: "Fund",
    recorded: { applicationVersion: page.application.version },
  });
});

it("keeps staged applicant changes separate from published content and its recommendation", async ({
  db,
}) => {
  const scenario = await setupRecommended(db);
  const original = await scenario.read();

  await stageRevision(scenario);

  const staged = await scenario.read();
  expect(encodeApplicationDetail(staged).application).toEqual(
    encodeApplicationDetail(original).application,
  );
  expect(staged.intake.workingRevision).toMatchObject({
    reason: "New venue costs",
    content: { requested: "28000.00" },
  });
});

it("publishes a revision with authored history while preserving the recommendation's original basis and allocation", async ({
  db,
  database,
}) => {
  const scenario = await setupRecommended(db);
  const original = await scenario.read();
  await stageRevision(scenario);

  expect(await scenario.change({ action: "publish_revision" })).toMatchObject({ status: "ok" });

  const revised = await scenario.read();
  expect(revised.application.version).toBe(original.application.version + 1);
  expect(toDecimal(revised.application.requested!)).toBe("28000.00");
  expect(encodeRecommendation(revised.application.managerRecommendation!)).toEqual(
    encodeRecommendation(original.application.managerRecommendation!),
  );
  expect(toDecimal(revised.round.totals.proposed)).toBe("24000.00");
  expect(revised.intake.history[0]).toMatchObject({
    action: "application.revision_recorded",
    reason: "New venue costs",
    actor: "Dana Reed",
    before: {
      version: original.application.version,
    },
    after: {
      version: revised.application.version,
    },
  });
  for (const snapshot of [revised.intake.history[0]?.before, revised.intake.history[0]?.after]) {
    expect(snapshot).not.toHaveProperty("reviews");
    expect(snapshot).not.toHaveProperty("managerRecommendation");
  }
  const stored = await database.client.query<{ before: unknown; after: unknown }>(
    "SELECT details->'before' AS before, details->'after' AS after FROM audit_events WHERE target_id = $1 ORDER BY target_revision DESC LIMIT 1",
    [revised.application.id],
  );
  for (const snapshot of [stored.rows[0]?.before, stored.rows[0]?.after]) {
    expect(snapshot).not.toHaveProperty("application.reviews");
    expect(snapshot).not.toHaveProperty("application.managerRecommendation");
  }
  expect(revised.intake.workingRevision).toBeNull();
  const roundPage = await getFundingRoundPage(db, actor, {
    workspaceSlug,
    publicId: scenario.round.publicId,
    kind: "round",
  });
  assert.isNotNull(roundPage);
  const requested = roundPage.round.applications.find(
    ({ id }) => id === revised.application.id,
  )?.requested;
  assert.isOk(requested);
  expect(toDecimal(requested)).toBe("28000.00");
});

it("records a new recommendation against the published application version", async ({ db }) => {
  const scenario = await setupRecommended(db);
  await stageRevision(scenario);
  assert((await scenario.change({ action: "publish_revision" })).status === "ok");
  const revised = await scenario.read();

  expect(await recommend(db, scenario)).toMatchObject({
    status: "ok",
    recommendation: { recorded: { applicationVersion: revised.application.version } },
  });
  expect(
    (await scenario.read()).application.managerRecommendation?.recorded?.applicationVersion,
  ).toBe(revised.application.version);
});

it("rejects deletion of recommended work without changing its content or history", async ({
  db,
}) => {
  const scenario = await setupRecommended(db);
  const before = await scenario.read();

  expect(await scenario.change({ action: "delete" })).toMatchObject({
    status: "invalid",
    error: "application_in_use",
  });
  expect(await scenario.read()).toEqual(before);
});

it("rejects concurrent edits, preserves the winner, and checks current tenant and grant access", async ({
  db,
  database,
}) => {
  const { address, read, request } = await setup(db);
  const edit = {
    ...address,
    expectedRevision: 0,
    change: { action: "save_content" as const, content },
  };

  expect(await editFundingApplication(db, actor, edit, applicationWork)).toMatchObject({
    status: "ok",
  });
  const winner = await read();
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...edit,
        change: { action: "save_content", content: { title: "Stale title" } },
      },
      applicationWork,
    ),
  ).toEqual({ status: "conflict" });
  expect(await read()).toEqual(winner);

  const other = { userId: "birch-manager" };

  expect(await editFundingApplication(db, other, edit, applicationWork)).toEqual({
    status: "not_found",
  });
  expect(await createFundingApplication(db, other, request)).toEqual({
    status: "not_found",
  });
  expect(await getFundingApplicationPage(db, other, address)).toBeNull();

  await database.client.query("UPDATE memberships SET role = 'member' WHERE user_id = 'dana'");

  expect(
    await editFundingApplication(db, actor, { ...edit, expectedRevision: 1 }, applicationWork),
  ).toEqual({
    status: "not_found",
  });
  expect(await getFundingApplicationPage(db, actor, address)).toBeNull();
});

it("keeps contact and staff summary attribution separate from the source version and working revision", async ({
  db,
}) => {
  const { read, change } = await setup(db);
  const contactId = randomUUID();
  expect(
    await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug,
        contactId,
        action: "create",
        details: { name: "Leah Martin", email: "leah@example.test", affiliation: "" },
      },
      fundingRoundContactUsage,
    ),
  ).toMatchObject({ status: "ok" });
  await change({ action: "save_content", content, contactId });
  await change({ action: "mark_ready" });
  const version = (await read()).application.version;
  await change({ action: "start_revision", kind: "correction" });
  await change({
    action: "details",
    summary: "Staff reading of the proposal.",
  });
  let page = await read();

  expect(page.application).toMatchObject({
    version,
    summaryAuthor: { userId: "dana", name: "Dana Reed" },
    submission: { contact: "Leah Martin" },
  });

  await change({
    action: "save_revision",
    draft: {
      ...page.intake.workingRevision!,
      reason: "Correct transcription",
      content: { ...content, requested: "26000.00" },
    },
  });
  await change({ action: "publish_revision" });
  page = await read();

  expect(page.application.submission?.contact).toBe("Leah Martin");
  expect((page.intake.history[0] ?? assert.fail("Expected page.intake.history[0]")).action).toBe(
    "application.correction_recorded",
  );
  expect(page.application.summaryAuthor?.userId).toBe("dana");
});

it("deletes unused preparation only, keeps its receipt, and prevents deleting a nonempty round", async ({
  db,
  database,
}) => {
  const { round, address, request, change } = await setup(db);

  expect(
    await deleteFundingRound(
      db,
      actor,
      {
        workspaceSlug,
        publicId: round.publicId,
        expectedRevision: 0,
      },
      roundHasApplications,
    ),
  ).toMatchObject({ status: "invalid", error: "round_not_empty" });
  expect(await change({ action: "delete" })).toMatchObject({ status: "ok" });
  expect(await getFundingApplicationPage(db, actor, address)).toBeNull();
  expect(await createFundingApplication(db, actor, request)).toMatchObject({
    status: "invalid",
    error: "application_deleted",
  });

  const audit = await database.client.query<{ action: string }>(
    "SELECT action FROM audit_events WHERE target_id = $1 ORDER BY target_revision",
    [address.publicId],
  );

  expect(audit.rows).toEqual([
    { action: "application.created" },
    { action: "application.deleted" },
  ]);
  expect(
    await deleteFundingRound(
      db,
      actor,
      {
        workspaceSlug,
        publicId: round.publicId,
        expectedRevision: 0,
      },
      roundHasApplications,
    ),
  ).toEqual({ status: "ok" });
});

it("rejects a requested total that cannot be represented without committing content or history", async ({
  db,
}) => {
  const { round, address, change, read } = await setup(db);
  const largest = "9999999999999999999999999999.99";

  expect(
    await change({ action: "save_content", content: { ...content, requested: largest } }),
  ).toMatchObject({ status: "ok" });

  const second = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Second request",
  });

  if (second.status !== "ok") {
    throw new Error("Creation failed");
  }
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        workspaceSlug,
        publicId: second.publicId,
        expectedRevision: 0,
        change: { action: "save_content", content: { ...content, requested: "0.01" } },
      },
      applicationWork,
    ),
  ).toMatchObject({ status: "invalid", error: "request_total_too_large" });

  const unchanged = (await getFundingApplicationPage(db, actor, {
    workspaceSlug,
    publicId: second.publicId,
  }))!;

  expect(unchanged.application.requested).toBeNull();
  expect(unchanged.intake.history).toHaveLength(1);
  expect((await read()).application.id).toBe(address.publicId);
});

it("creates initial applicant material once and keeps it in preparation", async ({ db }) => {
  const { round } = await setup(db);
  const request = {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    ...content,
    requested: "0.00",
  };

  expect(
    await createFundingApplication(db, actor, { ...request, requested: "1.001" }),
  ).toMatchObject({ status: "invalid" });

  const created = await createFundingApplication(db, actor, request);

  if (created.status !== "ok") {
    throw new Error("Creation failed");
  }
  expect(await createFundingApplication(db, actor, request)).toEqual(created);

  const page = (await getFundingApplicationPage(db, actor, {
    workspaceSlug,
    publicId: created.publicId,
  }))!;

  expect(page.application).toMatchObject({
    title: content.title,
    version: 1,
    intakeStatus: "in_preparation",
    summary: "",
    submission: { organization: content.applicant, answers: content.answers },
  });
  expect(toDecimal(page.application.requested!)).toBe("0.00");
  expect(page.intake.revision).toBe(0);
  expect(page.intake.history).toHaveLength(1);
});

it("rejects creation that would overflow the round total without consuming its retry identity", async ({
  db,
}) => {
  const { round, change } = await setup(db);
  await change({
    action: "save_content",
    content: { ...content, requested: "9999999999999999999999999999.99" },
  });
  const request = {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Overflow",
    requested: "0.01",
  };

  expect(await createFundingApplication(db, actor, request)).toMatchObject({
    status: "invalid",
    error: "request_total_too_large",
  });

  const created = await createFundingApplication(db, actor, { ...request, requested: "" });

  if (created.status !== "ok") {
    throw new Error("Creation failed");
  }

  const page = (await getFundingApplicationPage(db, actor, {
    workspaceSlug,
    publicId: created.publicId,
  }))!;

  expect(page.application.requested).toBeNull();
  expect(page.intake.history).toHaveLength(1);
});

it("saves contact and project dates atomically and rejects unavailable contacts", async ({
  db,
}) => {
  const { read, change } = await setup(db);

  const createContact = async (workspace = workspaceSlug, archived = false) => {
    const id = randomUUID();
    const saved = await changeWorkspaceContact(
      db,
      workspace === workspaceSlug ? actor : { userId: "birch-manager" },
      {
        workspaceSlug: workspace,
        contactId: id,
        action: "create",
        details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
      },
      fundingRoundContactUsage,
    );

    expect(saved.status).toBe("ok");
    if (archived) {
      expect(
        await changeWorkspaceContact(
          db,
          workspace === workspaceSlug ? actor : { userId: "birch-manager" },
          {
            workspaceSlug: workspace,
            contactId: id,
            action: "archive",
            expectedContactRevision: 0,
          },
          fundingRoundContactUsage,
        ),
      ).toMatchObject({ status: "ok" });
    }

    return id;
  };

  const contactId = await createContact();

  expect(
    await change({
      action: "save_content",
      content: { ...content, projectPeriod: "March–August 2027" },
      contactId,
    }),
  ).toMatchObject({ status: "ok" });

  const saved = await read();

  expect(saved.application).toMatchObject({
    contactId,
    submission: { contact: "Sam Morgan", projectPeriod: "March–August 2027" },
  });

  for (const unavailable of [
    randomUUID(),
    await createContact("birch"),
    await createContact(workspaceSlug, true),
  ]) {
    expect(
      await change({
        action: "save_content",
        content: { ...content, requested: "30000", projectPeriod: "Changed" },
        contactId: unavailable,
      }),
    ).toMatchObject({ status: "invalid", error: "contact_unavailable" });
    expect((await read()).application).toEqual(saved.application);
    expect((await read()).intake.revision).toBe(saved.intake.revision);
  }

  // Older callers omit projectPeriod; they must preserve the recorded dates.
  expect(await change({ action: "save_content", content })).toMatchObject({ status: "ok" });
  expect((await read()).intake.revision).toBe(saved.intake.revision);

  await change({ action: "mark_ready" });
  await change({ action: "start_revision", kind: "revision" });
  const draft = (await read()).intake.workingRevision!;

  expect(
    await change({
      action: "save_revision",
      contactId: null,
      draft: {
        ...draft,
        reason: "Later delivery",
        content: { projectPeriod: "April–September 2027" },
      },
    }),
  ).toMatchObject({ status: "ok" });
  expect((await read()).application).toMatchObject({
    contactId: null,
    submission: { projectPeriod: "March–August 2027" },
  });
  expect(await change({ action: "publish_revision" })).toMatchObject({ status: "ok" });
  expect((await read()).application.submission?.projectPeriod).toBe("April–September 2027");
});

it("persists question identities across renamed duplicate headings and working revisions", async ({
  db,
}) => {
  const { change, read } = await setup(db);
  const first = { questionId: randomUUID(), question: "Plan", response: "Original" };
  const second = { questionId: randomUUID(), question: "Plan", response: "Another section" };
  expect(
    (await change({ action: "save_content", content: { ...content, answers: [first, second] } }))
      .status,
  ).toBe("ok");
  expect((await change({ action: "mark_ready" })).status).toBe("ok");
  expect((await change({ action: "start_revision", kind: "correction" })).status).toBe("ok");
  const started = await read();
  expect(started.intake.workingRevision?.content.answers).toEqual([first, second]);
  const renamed = { ...first, question: "Project plan" };
  expect(
    (
      await change({
        action: "save_revision",
        draft: {
          kind: "correction",
          reason: "Clarify the heading",
          content: { answers: [second, renamed] },
        },
      })
    ).status,
  ).toBe("ok");
  expect((await change({ action: "publish_revision" })).status).toBe("ok");
  const saved = await read();
  expect(saved.application.submission?.answers).toEqual([second, renamed]);
  expect(
    saved.intake.history.find((entry) => entry.action === "application.correction_recorded")?.before
      ?.submission?.answers,
  ).toEqual([first, second]);
  expect(
    saved.intake.history.find((entry) => entry.action === "application.correction_recorded")?.after
      ?.submission?.answers,
  ).toEqual([second, renamed]);
});

it.for(["save_content", "save_revision"] as const)(
  "records a contact-only %s save as a contact change",
  async (action, { db }) => {
    const { read, change } = await setup(db);
    const contact = await setupContact(db);
    await change({ action: "save_content", content });
    if (action === "save_revision") {
      await change({ action: "mark_ready" });
      await change({ action: "start_revision", kind: "revision" });
    }
    const before = await read();
    expect(
      await change(
        action === "save_content"
          ? { action, content, contactId: contact.id }
          : { action, draft: { kind: "revision", reason: "", content }, contactId: contact.id },
      ),
    ).toMatchObject({ status: "ok" });
    const after = await read();
    expect(after.application.version).toBe(before.application.version);
    expect(after.intake.history[0]).toMatchObject({
      action: "application.contact_changed",
      actor: "Dana Reed",
    });
  },
);
