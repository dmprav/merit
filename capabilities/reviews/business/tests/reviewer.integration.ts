import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { withAuditFailure, recordedEvents } from "@merit/audit/testing";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { noContactGrantWork } from "@merit/contacts/testing";
import { withDatabase } from "@merit/db";
import { actor } from "@merit/organizations/testing/workspace";
import { assignmentScope, writeScoped } from "@merit/organizations/transactions";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import {
  createReviewerService,
  listPendingReviewerMessageWork,
  saveApplicationReview,
} from "@merit/reviews/server";
import { createInlineReviewerService } from "@merit/reviews/testing";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { reviewerTest as it, sam } from "./reviewer-test";

it("refuses new invitations without a qualifying workspace membership and sends no email", async ({
  db,
  database,
  applications,
  reviewerScenario: s,
}) => {
  const address = await applications.createApplication("Membership prerequisite");
  const contact = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug: "alder",
      action: "create",
      contactId: randomUUID(),
      details: { name: "Other Reviewer", email: "other@example.test", affiliation: "" },
    },
    noContactGrantWork,
  );
  assert(contact.status === "ok");
  const requestId = randomUUID();
  expect(
    await saveApplicationReview(db, actor, {
      ...address,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: { action: "request", id: requestId, contactId: contact.contact.id, replacesId: null },
    }),
  ).toMatchObject({ status: "ok" });

  for (const membership of ["absent", "member"]) {
    if (membership === "member") {
      await database.client.query(
        "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'other', 'other@example.test', 'member')",
      );
    }
    const commandId = randomUUID();
    expect(
      await s.service.invite(actor, { ...address, requestId, commandId, dueDate: null }),
    ).toEqual({ status: "invalid", error: "workspace_membership_required" });
    expect(
      (
        await database.client.query("SELECT id FROM review_assignments WHERE request_id = $1", [
          requestId,
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (
        await database.client.query("SELECT id FROM reviewer_messages WHERE assignment_id = $1", [
          commandId,
        ])
      ).rows,
    ).toEqual([]);
    expect(s.messages).toHaveLength(1);
  }
});

it("rejects a draft amount with more than two decimal places and leaves the draft unchanged", async ({
  reviewerScenario: s,
}) => {
  expect(await s.respond("accept")).toMatchObject({ status: "ok", value: { status: "accepted" } });
  const page = await s.read();
  assert(page.draft);

  expect(
    await s.service.saveDraft(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: page.draft.revision,
      draft: { ...page.draft.content, position: "Fund", amount: "40.005", reasoning: "Evidence" },
    }),
  ).toEqual({ status: "invalid", error: "invalid_input" });
  expect((await s.read()).draft).toEqual(page.draft);
});

it("rolls back a reviewer's submission when its audit event cannot be recorded", async ({
  database,
  reviewerScenario: s,
}) => {
  expect(await s.respond("accept")).toMatchObject({ status: "ok" });
  expect(await s.save()).toMatchObject({ status: "ok" });
  await expect(withAuditFailure(database.client, () => s.submit())).rejects.toMatchObject({
    cause: { message: "Audit recording failed" },
  });
  expect(await s.read()).toMatchObject({ assignment: { status: "accepted" }, assessment: null });
  expect((await database.client.query("SELECT id FROM assessments")).rows).toEqual([]);
  expect(await recordedEvents(database.client, "target_type = 'assessment'")).toEqual([]);
  expect(await s.submit()).toMatchObject({ status: "ok" });
  expect(await recordedEvents(database.client, "target_type = 'assessment'")).toHaveLength(1);
});

it("records a submission under the name the assessment carries when the profile has none", async ({
  database,
  reviewerScenario: s,
}) => {
  await database.client.query("UPDATE app_users SET name = NULL WHERE id = 'sam'");
  expect(await s.respond("accept")).toMatchObject({ status: "ok" });
  expect(await s.save()).toMatchObject({ status: "ok" });
  expect(await s.submit()).toMatchObject({ status: "ok" });

  expect(
    (
      await database.client.query(
        "SELECT actor_name FROM audit_events WHERE action = 'assessment.submitted'",
      )
    ).rows,
  ).toEqual([{ actor_name: "Sam Morgan" }]);
});

it("pauses conflicts and revokes immediately while preserving private drafts for explicit reinstatement", async ({
  database,
  reviewerScenario: s,
}) => {
  expect(await s.respond("report_conflict", "Applicant is a former colleague")).toMatchObject({
    status: "ok",
    value: { status: "conflict" },
  });
  expect(await s.manage("clear_conflict")).toEqual({ status: "invalid", error: "note_required" });
  expect(
    await s.manage("clear_conflict", "No current relationship or financial interest"),
  ).toMatchObject({ status: "ok", value: { status: "invited" } });
  await s.respond("accept");
  await s.save("Retain this private writing");
  const before = await s.read();
  assert(before.draft);
  expect(before.work).toEqual({ available: true });
  await s.manage("cancel");
  // Ended access reports no work, so the screen keeps unsent writing to copy.
  expect(await s.read()).toMatchObject({
    material: null,
    draft: null,
    work: { available: false, reason: "action_unavailable" },
  });
  expect(
    await s.service.saveDraft(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: before.draft.revision,
      draft: before.draft.content,
    }),
  ).toEqual({ status: "not_found" });
  expect(
    await s.service.submit(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: before.draft.revision,
    }),
  ).toEqual({ status: "not_found" });
  await s.manage("reinstate");
  expect((await s.read()).draft).toEqual(before.draft);
  await database.client.query("UPDATE app_users SET active = false WHERE id = 'sam'");
  expect(await s.service.read(sam, { assignmentId: s.assignmentId })).toEqual({
    status: "not_found",
  });
  await database.client.query("UPDATE app_users SET active = true WHERE id = 'sam'");
  await s.submit();
  expect(await s.respond("report_conflict", "A new relationship has emerged")).toMatchObject({
    status: "ok",
    value: { status: "conflict" },
  });
  const manager = await s.service.forApplication(actor, s.address);
  expect(manager).toMatchObject({
    status: "ok",
    value: [{ conflict: "A new relationship has emerged" }],
  });
  expect(
    (
      await database.client.query("SELECT * FROM assessments WHERE case_id = $1", [
        s.address.publicId,
      ])
    ).rows,
  ).toHaveLength(1);
  await s.manage("clear_conflict", "Relationship assessed; reviewer can proceed");
  expect((await s.read()).assignment).toMatchObject({ status: "invited", hasSubmitted: true });
  expect(await s.respond("decline")).toEqual({ status: "invalid", error: "action_unavailable" });
  expect(await s.respond("accept")).toMatchObject({ status: "ok", value: { status: "submitted" } });
});

it("sends an amendment notice after the assignment cooldown expires", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  await s.submit();
  await database.client.query(
    "UPDATE reviewer_messages SET created_at = now() - interval '61 seconds' WHERE assignment_id = $1 AND kind = 'submission'",
    [s.assignmentId],
  );

  await s.save("Updated assessment", "Corrected reasoning");
  expect(await s.submit()).toMatchObject({ status: "ok" });
  expect(s.messages.filter((message) => message.kind === "submission")).toHaveLength(2);
});

it.for([
  { kind: "submission", count: 99, age: "5 minutes", expected: 1 },
  { kind: "submission", count: 100, age: "5 minutes", expected: 0 },
  { kind: "submission", count: 499, age: "2 hours", expected: 1 },
  { kind: "submission", count: 500, age: "2 hours", expected: 0 },
  { kind: "submission", count: 500, age: "25 hours", expected: 1 },
  { kind: "invitation", count: 500, age: "5 minutes", expected: 1 },
])(
  "saves the assessment and queues $expected notices with $count $kind emails aged $age on another assignment",
  async ({ kind, count, age, expected }, { database, reviewerScenario: s, applications }) => {
    await database.client.query(
      "UPDATE reviewer_messages SET created_at = now() - interval '2 minutes' WHERE id = $1",
      [s.invitation.commandId],
    );
    const other = await applications.createApplication("Another review");
    const requestId = await s.requestReview(other);
    const invite = await s.service.invite(actor, {
      ...other,
      requestId,
      commandId: randomUUID(),
      dueDate: null,
    });
    assert(invite.status === "ok");
    await database.client.query(
      `INSERT INTO reviewer_messages (id, assignment_id, kind, recipient, status, created_at)
     SELECT gen_random_uuid(), $1, $2, 'manager@example.test', 'sent', now() - $3::interval
     FROM generate_series(1, $4::int)`,
      [invite.value.id, kind, age, count],
    );

    await s.respond("accept");
    await s.save();
    expect(await s.submit()).toMatchObject({ status: "ok" });
    expect((await s.read()).assessment?.versions).toHaveLength(1);
    expect(s.messages.filter((message) => message.kind === "submission")).toHaveLength(expected);
    expect(
      (
        await database.client.query(
          "SELECT id FROM reviewer_messages WHERE assignment_id = $1 AND kind = 'submission'",
          [s.assignmentId],
        )
      ).rows,
    ).toHaveLength(expected);
  },
);

it("preserves successful submission when delivery fails and retries only the notification", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  s.setDeliveryFailure(true);
  expect(await s.submit()).toMatchObject({ status: "ok" });
  expect((await s.read()).assignment.notification).toBe("failed");
  const failed = await database.client.query<{ id: string; delivery_token: string }>(
    "SELECT id, delivery_token FROM reviewer_messages WHERE assignment_id = $1 AND kind = 'submission'",
    [s.assignmentId],
  );
  expect(failed.rows).toHaveLength(1);
  s.setDeliveryFailure(false);
  await s.manage("retry_notification");
  expect((await s.read()).assignment.notification).toBe("sent");
  expect((await s.read()).assessment?.versions).toHaveLength(1);

  // The retry reset the same message with a fresh delivery token, so its ID and idempotency key held.
  const retried = await database.client.query<{ id: string; delivery_token: string }>(
    "SELECT id, delivery_token FROM reviewer_messages WHERE assignment_id = $1 AND kind = 'submission'",
    [s.assignmentId],
  );
  expect(retried.rows[0]?.id).toBe(failed.rows[0]?.id);
  expect(retried.rows[0]?.delivery_token).not.toBe(failed.rows[0]?.delivery_token);
});

it("resets a failed message only in the workspace scope of its own workspace", async ({
  runtimeUrl,
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  s.setDeliveryFailure(true);
  expect(await s.submit()).toMatchObject({ status: "ok" });
  const noticeId = (
    await database.client.query<{ id: string }>(
      "SELECT id FROM reviewer_messages WHERE assignment_id = $1 AND kind = 'submission'",
      [s.assignmentId],
    )
  ).rows[0]!.id;

  const stored = async () =>
    (
      await database.client.query<{ status: string; delivery_token: string }>(
        "SELECT status, delivery_token FROM reviewer_messages WHERE id = $1",
        [noticeId],
      )
    ).rows[0]!;

  const before = await stored();
  expect(before.status).toBe("failed");

  const reset = (scope: Parameters<typeof writeScoped>[1]) =>
    withDatabase(runtimeUrl, (db) =>
      writeScoped(db, scope, async (tx) => {
        const [row] = (
          await tx.execute<{ reset: boolean }>(
            sql`select merit_retry_reviewer_message(${noticeId}) as reset`,
          )
        ).rows;
        return row?.reset;
      }),
    );

  // Another workspace's manager, and the reviewer's assignment scope, cannot reset it.
  expect(await reset({ kind: "workspace", userId: "birch-manager", slug: "birch" })).toBe(false);
  expect(await reset(assignmentScope(sam.userId, s.assignmentId))).toBe(false);
  expect(await stored()).toEqual(before);

  expect(await reset({ kind: "workspace", userId: actor.userId, slug: "alder" })).toBe(true);
  const after = await stored();
  expect(after.status).toBe("pending");
  expect(after.delivery_token).not.toBe(before.delivery_token);
});

it("revives only the newest failed message of its kind", async ({
  database,
  runtimeUrl,
  reviewerScenario: s,
}) => {
  const first = s.invitation.commandId;
  await database.client.query(
    "UPDATE reviewer_messages SET status = 'failed', created_at = now() - interval '2 minutes' WHERE id = $1",
    [first],
  );
  // A resend queues a newer message, which fails too.
  expect(await s.manage("resend")).toMatchObject({ status: "ok" });
  const newer = (
    await database.client.query<{ id: string }>(
      "SELECT id FROM reviewer_messages WHERE assignment_id = $1 AND id <> $2",
      [s.assignmentId, first],
    )
  ).rows[0]!.id;
  await database.client.query("UPDATE reviewer_messages SET status = 'failed' WHERE id = $1", [
    newer,
  ]);

  const reset = (id: string) =>
    withDatabase(runtimeUrl, (db) =>
      writeScoped(db, { kind: "workspace", userId: actor.userId, slug: "alder" }, async (tx) => {
        const [row] = (
          await tx.execute<{ reset: boolean }>(
            sql`select merit_retry_reviewer_message(${id}) as reset`,
          )
        ).rows;
        return row?.reset;
      }),
    );

  const status = async (id: string) =>
    (
      await database.client.query<{ status: string }>(
        "SELECT status FROM reviewer_messages WHERE id = $1",
        [id],
      )
    ).rows[0]?.status;

  expect(await reset(first)).toBe(false);
  expect(await status(first)).toBe("failed");
  expect(await reset(newer)).toBe(true);
  expect(await status(newer)).toBe("pending");
  // Pending is not failed: a second reset finds nothing to revive.
  expect(await reset(newer)).toBe(false);
});

it.for([
  ["expired", "UPDATE review_assignments SET expires_at = now() - interval '1 hour' WHERE id = $1"],
  ["revoked", "UPDATE review_assignments SET status = 'cancelled' WHERE id = $1"],
] as const)(
  "does not revive a failed invitation that is %s",
  async ([, change], { database, runtimeUrl, reviewerScenario: s }) => {
    const id = s.invitation.commandId;
    await database.client.query("UPDATE reviewer_messages SET status = 'failed' WHERE id = $1", [
      id,
    ]);

    const stored = async () =>
      (
        await database.client.query<{ status: string; delivery_token: string }>(
          "SELECT status, delivery_token FROM reviewer_messages WHERE id = $1",
          [id],
        )
      ).rows[0]!;

    const reset = () =>
      withDatabase(runtimeUrl, (db) =>
        writeScoped(db, { kind: "workspace", userId: actor.userId, slug: "alder" }, async (tx) => {
          const [row] = (
            await tx.execute<{ reset: boolean }>(
              sql`select merit_retry_reviewer_message(${id}) as reset`,
            )
          ).rows;
          return row?.reset;
        }),
      );

    const before = await stored();
    await database.client.query(change, [s.assignmentId]);
    expect(await reset()).toBe(false);
    expect(await stored()).toEqual(before);
  },
);

it("keeps a failed notice available for the manager when an amendment email is suppressed", async ({
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  s.setDeliveryFailure(true);
  expect(await s.submit()).toMatchObject({ status: "ok" });

  s.setDeliveryFailure(false);
  await s.save("Updated reasoning", "Clarified the evidence");
  expect(await s.submit()).toMatchObject({ status: "ok" });
  expect((await s.read()).assignment.notification).toBe("failed");
  expect(s.messages.filter((message) => message.kind === "submission")).toHaveLength(0);

  await s.manage("retry_notification");
  expect(s.messages.filter((message) => message.kind === "submission")).toHaveLength(1);
  expect((await s.read()).assessment?.versions).toHaveLength(2);
});

it("records an accepted reviewer message after the sender loses workspace access", async ({
  runtimeUrl,
  database,
  reviewerScenario: s,
}) => {
  // Replay the committed invitation with its original message still awaiting acknowledgement.
  await database.client.query("UPDATE reviewer_messages SET status = 'pending' WHERE id = $1", [
    s.invitation.commandId,
  ]);
  const service = createInlineReviewerService({
    database: (operation) => withDatabase(runtimeUrl, operation),
    send: async () => {
      await database.client.query(
        "DELETE FROM memberships WHERE user_id = $1 AND organization_id = 'alder'",
        [actor.userId],
      );
    },
    reviewerUrl: () => "https://merit.test/review",
    managerUrl: () => "https://merit.test/manage",
  });
  expect(await service.invite(actor, s.invitation)).toEqual({ status: "not_found" });

  const message = async () =>
    (
      await database.client.query<{ status: string; delivery_token: string }>(
        "SELECT status, delivery_token FROM reviewer_messages WHERE id = $1",
        [s.invitation.commandId],
      )
    ).rows[0]!;

  const receipt = await message();
  expect(receipt.status).toBe("sent");
  await withDatabase(runtimeUrl, async (db) => {
    await expect(
      db.execute(
        sql`UPDATE reviewer_messages SET status = 'failed' WHERE id = ${s.invitation.commandId}`,
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    const acknowledge = (token: string) =>
      db.execute(
        sql`select merit_finish_reviewer_message(${s.invitation.commandId}, ${token}, 'failed')`,
      );

    await expect(acknowledge(randomUUID())).rejects.toMatchObject({
      cause: { message: "Reviewer delivery acknowledgement did not match a message" },
    });
    await acknowledge(receipt.delivery_token);
  });
  expect((await message()).status).toBe("sent");
});

it("hides an assignment from a manager in another workspace", async ({ reviewerScenario: s }) => {
  expect(
    await s.service.manage(
      { userId: "birch-manager" },
      {
        ...s.address,
        assignmentId: s.assignmentId,
        commandId: randomUUID(),
        expectedRevision: 0,
        action: "cancel",
        note: "",
      },
    ),
  ).toEqual({ status: "not_found" });
  expect(await s.read()).toMatchObject({ assignment: { status: "invited" } });
});

it("limits invitation resends to one per recipient each minute", async ({
  database,
  reviewerScenario: s,
}) => {
  expect(await s.manage("resend")).toEqual({ status: "limited" });

  await database.client.query(
    "UPDATE reviewer_messages SET created_at = now() - interval '2 minutes' WHERE assignment_id = $1",
    [s.assignmentId],
  );

  expect(await s.manage("resend")).toMatchObject({ status: "ok" });
});

it("rejects a response to an expired invitation", async ({ database, reviewerScenario: s }) => {
  await database.client.query(
    "UPDATE review_assignments SET expires_at = now() - interval '1 hour' WHERE id = $1",
    [s.assignmentId],
  );

  expect(await s.respond("accept")).toEqual({ status: "expired" });
  expect(await s.read()).toMatchObject({ assignment: { status: "invited" }, material: null });
});

it("lets the reviewer answer an expired invitation after the manager resends it", async ({
  database,
  reviewerScenario: s,
}) => {
  await database.client.query(
    "UPDATE review_assignments SET expires_at = now() - interval '1 hour' WHERE id = $1",
    [s.assignmentId],
  );
  await database.client.query(
    "UPDATE reviewer_messages SET created_at = now() - interval '2 minutes' WHERE assignment_id = $1",
    [s.assignmentId],
  );
  expect(await s.manage("resend")).toMatchObject({ status: "ok" });

  expect(await s.respond("decline")).toMatchObject({ status: "ok" });
  expect(await s.read()).toMatchObject({
    assignment: { status: "declined" },
    material: null,
    draft: null,
  });
});

it("ends staff review access when their membership is removed and requires explicit reinstatement", async ({
  database,
  reviewerScenario: s,
}) => {
  const organization = (
    await database.client.query<{ id: string }>("SELECT id FROM organizations WHERE slug = 'alder'")
  ).rows[0]!.id;
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, 'sam', 'program_manager') ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'program_manager'",
    [organization],
  );
  await s.respond("accept");
  await s.save("Staff private draft");
  const page = await s.read();
  assert(page.draft);
  await database.client.query("DELETE FROM memberships WHERE user_id = 'sam'");
  expect(await s.service.list(sam)).toEqual({ status: "ok", value: [] });
  expect(await s.service.read(sam, { assignmentId: s.assignmentId })).toEqual({
    status: "not_found",
  });
  expect(
    await s.service.respond(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedRevision: page.assignment.revision,
      action: "report_conflict",
      note: "Old membership",
    }),
  ).toEqual({ status: "not_found" });
  expect(
    await s.service.submit(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: page.draft.revision,
    }),
  ).toEqual({ status: "not_found" });
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, 'sam', 'program_manager') ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'program_manager'",
    [organization],
  );
  expect(await s.service.read(sam, { assignmentId: s.assignmentId })).toEqual({
    status: "not_found",
  });
  await s.manage("cancel");
  await s.manage("reinstate");
  expect((await s.read()).draft).toEqual(page.draft);
});

it("rejects changing a submitted assessment's author", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  expect(await s.submit()).toMatchObject({ status: "ok" });

  await expect(
    database.client.query("UPDATE assessments SET author_user_id = 'other' WHERE id = $1", [
      s.assignmentId,
    ]),
  ).rejects.toThrow("authorship is immutable");
});

it("rejects deleting a submitted assessment's audit history", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  expect(await s.submit()).toMatchObject({ status: "ok" });

  await expect(
    database.client.query("DELETE FROM audit_events WHERE assignment_id = $1", [s.assignmentId]),
  ).rejects.toThrow("Recorded audit events cannot be changed");
});

it("reads assignment history separately with paging and current manager access", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  await s.submit();
  const input = { ...s.address, assignmentId: s.assignmentId, limit: 1 };
  const first = await s.service.history(actor, input);
  assert(first.status === "ok" && first.value.nextCursor);
  expect(first.value.entries[0]?.action).toBe("assessment.submitted");
  const second = await s.service.history(actor, { ...input, after: first.value.nextCursor });
  assert(second.status === "ok");
  expect(second.value.entries[0]?.action).toBe("review_assignment.accepted");
  expect(await s.service.history({ userId: "birch-manager" }, input)).toEqual({
    status: "not_found",
  });
  expect(await s.service.history(actor, { ...input, after: "invalid" })).toEqual({
    status: "invalid",
    error: "invalid_input",
  });
  const assignments = await s.service.forApplication(actor, s.address);
  assert(assignments.status === "ok");
  expect(assignments.value[0]).not.toHaveProperty("history");
  await database.client.query(
    "UPDATE memberships SET role = 'member' WHERE organization_id='alder' AND user_id='dana'",
  );
  expect(await s.service.history(actor, input)).toEqual({ status: "not_found" });
});

it("requires an assignment membership and scopes My work to its workspace", async ({
  database,
  reviewerScenario: s,
}) => {
  await expect(
    database.client.query("UPDATE review_assignments SET membership_id = NULL WHERE id = $1", [
      s.assignmentId,
    ]),
  ).rejects.toMatchObject({ code: "23502" });
  expect(await s.service.list(sam, { workspaceSlug: "alder" })).toMatchObject({
    status: "ok",
    value: [{ id: s.assignmentId, workspaceSlug: "alder" }],
  });
  expect(await s.service.list(sam, { workspaceSlug: "birch" })).toEqual({ status: "not_found" });
  expect(
    await s.service.read(sam, { assignmentId: s.assignmentId, workspaceSlug: "birch" }),
  ).toEqual({ status: "not_found" });
});

it("requires the invited membership even before acceptance", async ({
  database,
  reviewerScenario: s,
}) => {
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'other', 'sam@example.test', 'reviewer')",
  );
  const other = { userId: "other" };
  expect(await s.service.list(other, { workspaceSlug: "alder" })).toEqual({
    status: "ok",
    value: [],
  });
  expect(await s.service.read(other, { assignmentId: s.assignmentId })).toEqual({
    status: "not_found",
  });
  expect(
    await s.service.respond(other, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedRevision: 0,
      action: "accept",
      note: "",
    }),
  ).toEqual({ status: "not_found" });
  expect(await s.respond("accept")).toMatchObject({ status: "ok" });
});

it("lists unfinished reviewer messages across workspaces for reconciliation, newest and deliverable only", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  const pending = () => listPendingReviewerMessageWork((operation) => operation(db), 100);

  const status = (id: string, value: string) =>
    database.client.query("UPDATE reviewer_messages SET status = $2 WHERE id = $1", [id, value]);

  const invitationId = s.invitation.commandId;

  expect(await pending()).toEqual([]);

  // A message acknowledged by nobody is listed with the member it acts for: the manager.
  await status(invitationId, "pending");
  expect(await pending()).toEqual([
    {
      messageId: invitationId,
      assignmentId: s.assignmentId,
      kind: "invitation",
      userId: actor.userId,
    },
  ]);

  // A newer invitation replaces it.
  await database.client.query(
    "UPDATE reviewer_messages SET created_at = now() - interval '2 minutes' WHERE assignment_id = $1",
    [s.assignmentId],
  );
  expect(await s.manage("resend")).toMatchObject({ status: "ok" });
  const newer = (
    await database.client.query<{ id: string }>(
      "SELECT id FROM reviewer_messages WHERE assignment_id = $1 AND id <> $2",
      [s.assignmentId, invitationId],
    )
  ).rows[0]!.id;
  await status(newer, "pending");
  expect((await pending()).map((work) => work.messageId)).toEqual([newer]);

  // A failed or sent message is finished, and an expired invitation cannot be delivered.
  await status(newer, "failed");
  expect(await pending()).toEqual([]);
  await status(newer, "pending");
  await database.client.query(
    "UPDATE review_assignments SET expires_at = now() - interval '1 minute' WHERE id = $1",
    [s.assignmentId],
  );
  expect(await pending()).toEqual([]);
});

it("lists a pending message only while its actor could still deliver it", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  const listed = async () =>
    (await listPendingReviewerMessageWork((operation) => operation(db), 100)).map(
      ({ messageId }) => messageId,
    );

  const invitationId = s.invitation.commandId;
  await database.client.query("UPDATE reviewer_messages SET status = 'pending' WHERE id = $1", [
    invitationId,
  ]);
  expect(await listed()).toEqual([invitationId]);

  await database.client.query("UPDATE app_users SET active = false WHERE id = $1", [actor.userId]);
  expect(await listed()).toEqual([]);
  await database.client.query("UPDATE app_users SET active = true WHERE id = $1", [actor.userId]);
  expect(await listed()).toEqual([invitationId]);

  // The acting manager must still belong to the workspace.
  await database.client.query(
    "CREATE TEMP TABLE removed AS SELECT * FROM memberships WHERE organization_id = 'alder' AND user_id = $1",
    [actor.userId],
  );
  await database.client.query(
    "DELETE FROM memberships WHERE organization_id = 'alder' AND user_id = $1",
    [actor.userId],
  );
  expect(await listed()).toEqual([]);
  await database.client.query("INSERT INTO memberships SELECT * FROM removed");
  await database.client.query("DROP TABLE removed");
  expect(await listed()).toEqual([invitationId]);

  await database.client.query(
    "UPDATE organizations SET kind = 'demo', demo_expires_at = now() - interval '1 hour', demo_seed_version = 1 WHERE id = 'alder'",
  );
  expect(await listed()).toEqual([]);
});

it("lists a pending submission notice for the manager once the reviewer cannot act", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  expect(await s.submit()).toMatchObject({ status: "ok" });
  await database.client.query(
    "UPDATE reviewer_messages SET status = 'pending' WHERE assignment_id = $1 AND kind = 'submission'",
    [s.assignmentId],
  );

  const actors = async () =>
    (await listPendingReviewerMessageWork((operation) => operation(db), 100)).map(
      ({ userId }) => userId,
    );

  expect(await actors()).toEqual([sam.userId]);

  // The notice goes to the requesting manager, who can deliver it without the reviewer.
  await database.client.query("UPDATE app_users SET active = false WHERE id = $1", [sam.userId]);
  expect(await actors()).toEqual([actor.userId]);
  await database.client.query("UPDATE app_users SET active = true WHERE id = $1", [sam.userId]);
  expect(await actors()).toEqual([sam.userId]);

  // With neither the reviewer nor the manager able to act, nobody is left to deliver it.
  await database.client.query("UPDATE app_users SET active = false WHERE id IN ($1, $2)", [
    sam.userId,
    actor.userId,
  ]);
  expect(await actors()).toEqual([]);
});

it("lists a pending submission notice under the submitting reviewer", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  expect(await s.submit()).toMatchObject({ status: "ok" });
  await database.client.query(
    "UPDATE reviewer_messages SET status = 'pending' WHERE assignment_id = $1 AND kind = 'submission'",
    [s.assignmentId],
  );

  const work = await listPendingReviewerMessageWork((operation) => operation(db), 100);

  expect(work).toEqual([
    expect.objectContaining({
      assignmentId: s.assignmentId,
      kind: "submission",
      userId: sam.userId,
    }),
  ]);
  const page = await listPendingReviewerMessageWork(
    (operation) => operation(db),
    100,
    work[0]?.messageId,
  );
  expect(page).toEqual([]);
});

it("answers a committed reviewer message when only the reads that wait for its outcome fail", async ({
  runtimeUrl,
  database,
  reviewerScenario: s,
}) => {
  await database.client.query("UPDATE reviewer_messages SET status = 'pending' WHERE id = $1", [
    s.invitation.commandId,
  ]);
  let readsFail = false;
  let reported = 0;
  const service = createReviewerService({
    database: (operation) =>
      readsFail ? Promise.reject(new Error("database down")) : withDatabase(runtimeUrl, operation),
    // The workflow starts after the commit; from here on the request's outcome reads fail.
    start: async () => {
      readsFail = true;
      return true;
    },
    wait: { timeoutMs: 50, intervalMs: 1 },
    onOutcomeError: () => {
      reported += 1;
      readsFail = false;
    },
  });

  expect(await service.invite(actor, s.invitation)).toMatchObject({
    status: "ok",
    value: { id: s.assignmentId },
  });
  expect(reported).toBe(1);
  const message = await database.client.query<{ status: string }>(
    "SELECT status FROM reviewer_messages WHERE id = $1",
    [s.invitation.commandId],
  );
  expect(message.rows[0]?.status).toBe("pending");
});
it("keeps a committed reviewer message and fails the response, not the commit, while the database stays down", async ({
  runtimeUrl,
  database,
  reviewerScenario: s,
}) => {
  await database.client.query("UPDATE reviewer_messages SET status = 'pending' WHERE id = $1", [
    s.invitation.commandId,
  ]);
  let readsFail = false;
  let reported = 0;
  const service = createReviewerService({
    database: (operation) =>
      readsFail ? Promise.reject(new Error("database down")) : withDatabase(runtimeUrl, operation),
    start: async () => {
      readsFail = true;
      return true;
    },
    wait: { timeoutMs: 50, intervalMs: 1 },
    // Only reports: the database stays down, so the response itself cannot be read either.
    onOutcomeError: () => {
      reported += 1;
    },
  });

  // The response is the manager's assignment row, which needs a read; no data is invented.
  await expect(service.invite(actor, s.invitation)).rejects.toThrow("database down");
  expect(reported).toBe(1);
  readsFail = false;
  const message = await database.client.query<{ status: string }>(
    "SELECT status FROM reviewer_messages WHERE id = $1",
    [s.invitation.commandId],
  );
  expect(message.rows[0]?.status).toBe("pending");
});
