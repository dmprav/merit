import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import type { IntakeChange } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { contactApplicationWork } from "@merit/applications/server/integrations";
import { changeWorkspaceContact } from "@merit/contacts/server";
import type { ContactGrantWork } from "@merit/contacts/server/grant-work";
import { toDecimal } from "@merit/money";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

import { noApplicationWork } from "./application-test";
import { readPersistedApplication } from "./persisted-application";

const contactWork: ContactGrantWork = {
  applications: contactApplicationWork,
  reviews: { applicationLinks: async () => [], outstandingRequests: async () => [] },
};

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

  const read = async () => (await readPersistedApplication(db, address.publicId))!;

  const change = async (change: IntakeChange) =>
    editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).revision,
        change,
      },
      noApplicationWork,
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
    contactWork,
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
    revision: before.revision,
  });
  expect(await read()).toEqual(before);
  expect(await change({ action: "save_content", content, contactId: null })).toEqual({
    status: "ok",
    revision: before.revision,
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
        contactWork,
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
                draft: { ...before.workingRevision!, content: { title: content.title } },
                contactId,
              },
        ),
      ).toEqual({ status: "ok", revision: before.revision });
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
          expectedRevision: before.revision - 1,
          change: edit,
        },
        noApplicationWork,
      ),
    ).toEqual({ status: "conflict" });
    expect(await change(edit)).toEqual({ status: "invalid", error: "contact_unavailable" });
    expect(await change({ ...edit, contactId: contact.id })).toEqual({ status: "invalid", error });
    expect(await read()).toEqual(before);
  },
);

it("retries empty application creation without adding content or history", async ({ db }) => {
  const { request, created, read } = await setup(db);
  const before = await read();

  expect(await createFundingApplication(db, actor, request)).toEqual(created);
  expect(await read()).toEqual(before);
  expect(before.application).toMatchObject({
    requested: null,
    intakeStatus: "in_preparation",
  });
  expect(before.history).toHaveLength(1);
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

const firstEdit = (address: { workspaceSlug: string; publicId: string }) => ({
  ...address,
  expectedRevision: 0,
  change: { action: "save_content" as const, content },
});

it("rejects a concurrent edit at a stale revision and preserves the winner", async ({ db }) => {
  const { address, read } = await setup(db);
  const edit = firstEdit(address);

  expect(await editFundingApplication(db, actor, edit, noApplicationWork)).toMatchObject({
    status: "ok",
  });
  const winner = await read();
  expect(
    await editFundingApplication(
      db,
      actor,
      { ...edit, change: { action: "save_content", content: { title: "Stale title" } } },
      noApplicationWork,
    ),
  ).toEqual({ status: "conflict" });
  expect(await read()).toEqual(winner);
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
      contactWork,
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
      ...page.workingRevision!,
      reason: "Correct transcription",
      content: { ...content, requested: "26000.00" },
    },
  });
  await change({ action: "publish_revision" });
  page = await read();

  expect(page.application.submission?.contact).toBe("Leah Martin");
  expect((page.history[0] ?? assert.fail("Expected page.history[0]")).action).toBe(
    "application.correction_recorded",
  );
  expect(page.application.summaryAuthor?.userId).toBe("dana");
});

it("deletes unused preparation, keeps its audit receipt, and refuses to recreate it on retry", async ({
  db,
  database,
}) => {
  const { address, request, change } = await setup(db);

  expect(await change({ action: "delete" })).toMatchObject({ status: "ok" });
  expect(await readPersistedApplication(db, address.publicId)).toBeUndefined();
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
      noApplicationWork,
    ),
  ).toMatchObject({ status: "invalid", error: "request_total_too_large" });

  const unchanged = (await readPersistedApplication(db, second.publicId))!;

  expect(unchanged.application.requested).toBeNull();
  expect(unchanged.history).toHaveLength(1);
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

  const page = (await readPersistedApplication(db, created.publicId))!;

  expect(page.application).toMatchObject({
    title: content.title,
    version: 1,
    intakeStatus: "in_preparation",
    summary: "",
    submission: { organization: content.applicant, answers: content.answers },
  });
  expect(toDecimal(page.application.requested!)).toBe("0.00");
  expect(page.revision).toBe(0);
  expect(page.history).toHaveLength(1);
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

  const page = (await readPersistedApplication(db, created.publicId))!;

  expect(page.application.requested).toBeNull();
  expect(page.history).toHaveLength(1);
});

const unavailableContacts = {
  unknown: async () => randomUUID(),
  "in another workspace": async (db: NodePgDatabase) => {
    const created = await changeWorkspaceContact(
      db,
      { userId: "birch-manager" },
      {
        workspaceSlug: "birch",
        contactId: randomUUID(),
        action: "create",
        details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
      },
      contactWork,
    );
    assert(created.status === "ok");
    return created.contact.id;
  },
  archived: async (db: NodePgDatabase) => {
    const contact = await setupContact(db);
    const archived = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug,
        contactId: contact.id,
        action: "archive",
        expectedContactRevision: contact.revision,
      },
      contactWork,
    );
    assert(archived.status === "ok");
    return contact.id;
  },
};

it("saves the contact and project period with the applicant material", async ({ db }) => {
  const { read, change } = await setup(db);
  const contactId = (await setupContact(db)).id;

  expect(
    await change({
      action: "save_content",
      content: { ...content, projectPeriod: "March–August 2027" },
      contactId,
    }),
  ).toMatchObject({ status: "ok" });
  expect((await read()).application).toMatchObject({
    contactId,
    submission: { contact: "Sam Morgan", projectPeriod: "March–August 2027" },
  });
});

it.for(Object.entries(unavailableContacts))(
  "rejects a contact that is %s without saving the accompanying content",
  async ([, unavailable], { db }) => {
    const { read, change } = await setup(db);
    const contact = await setupContact(db);
    assert(
      (await change({ action: "save_content", content, contactId: contact.id })).status === "ok",
    );
    const before = await read();
    expect(before.application.contactId).toBe(contact.id);

    expect(
      await change({
        action: "save_content",
        content: { ...content, requested: "30000", projectPeriod: "Changed" },
        contactId: await unavailable(db),
      }),
    ).toEqual({ status: "invalid", error: "contact_unavailable" });
    expect(await read()).toEqual(before);
  },
);

it("keeps the recorded project period when a save omits it", async ({ db }) => {
  const { read, change } = await setup(db);
  assert(
    (
      await change({
        action: "save_content",
        content: { ...content, projectPeriod: "March–August 2027" },
      })
    ).status === "ok",
  );
  const saved = await read();

  // Older callers omit projectPeriod; they must preserve the recorded dates.
  expect(await change({ action: "save_content", content })).toEqual({
    status: "ok",
    revision: saved.revision,
  });
  expect(await read()).toEqual(saved);
});

it("applies a contact change at once but stages a project period change until the revision is published", async ({
  db,
}) => {
  const { read, change } = await setup(db);
  const contactId = (await setupContact(db)).id;
  for (const step of [
    {
      action: "save_content",
      content: { ...content, projectPeriod: "March–August 2027" },
      contactId,
    },
    { action: "mark_ready" },
    { action: "start_revision", kind: "revision" },
  ] satisfies IntakeChange[]) {
    assert((await change(step)).status === "ok");
  }
  const draft = (await read()).workingRevision!;

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
  expect(started.workingRevision?.content.answers).toEqual([first, second]);
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
  const correction = saved.history.find(
    (entry) => entry.action === "application.correction_recorded",
  );
  expect(correction?.details).toMatchObject({
    before: { application: { submission: { answers: [first, second] } } },
    after: { application: { submission: { answers: [second, renamed] } } },
  });
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
    expect(after.history[0]).toMatchObject({
      action: "application.contact_changed",
      actorName: "Dana Reed",
    });
  },
);
