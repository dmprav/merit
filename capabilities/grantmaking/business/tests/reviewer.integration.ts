import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { editFundingApplication } from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { createOrganizationService } from "@merit/organizations/server";
import { actor } from "@merit/organizations/testing/workspace";
import type { ReviewerMessage } from "@merit/reviews/api";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { createReviewerService, saveApplicationReview } from "@merit/reviews/server";
import { revokeMembershipReviews } from "@merit/reviews/server/integrations";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { editFundingRound } from "@merit/rounds/server";

import {
  createNavigationService,
  getFundingApplicationPage,
  listApplicationReviewSummaries,
  listWorkspaceApplications,
} from "../src/server";
import { fundingRoundContactUsage } from "../src/server/integrations";
import { applicationWork } from "../src/server/persistence/commands/application-work";
import { withAuditFailure, recordedEvents } from "./audit-events";
import { roundTest } from "./round-test";

const sam = { userId: "sam" };
const it = roundTest.extend("reviewerScenario", async ({ db, database, rounds }) => {
  await database.client.query(
    "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('sam','Sam Morgan','sam-account'), ('other','Other','other-account')",
  );
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'sam', 'sam@example.test', 'reviewer')",
  );
  const address = await rounds.createApplication("Community review");
  const created = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug: "alder",
      action: "create",
      contactId: randomUUID(),
      details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
    },
    fundingRoundContactUsage,
  );
  assert(created.status === "ok");
  const requestId = randomUUID();
  expect(
    await saveApplicationReview(db, actor, {
      ...address,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: {
        action: "request",
        id: requestId,
        contactId: created.contact.id,
        replacesId: null,
      },
    }),
  ).toMatchObject({ status: "ok" });
  const messages: ReviewerMessage[] = [];
  let failDelivery = false;
  const service = createReviewerService({
    database: async (operation) => operation(db),
    verifiedEmails: async (person) => [`${person.userId}@example.test`],
    send: async (message) => {
      if (failDelivery) {
        throw new Error("Sender unavailable");
      }
      messages.push(message);
    },
    reviewerUrl: (id) => `https://merit.test/reviews/${id}`,
    managerUrl: (slug, id) => `https://merit.test/app/${slug}/applications/${id}`,
  });
  const invitation = { ...address, requestId, commandId: randomUUID(), dueDate: "2020-01-01" };
  const invited = await service.invite(actor, invitation);
  assert(invited.status === "ok", JSON.stringify(invited));
  const assignmentId = invited.value.id;

  const read = async () => {
    const result = await service.read(sam, { assignmentId });
    assert(result.status === "ok");
    return result.value;
  };

  const respond = async (action: "accept" | "decline" | "report_conflict", note = "") =>
    service.respond(sam, {
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: (await read()).assignment.revision,
      action,
      note,
    });

  const manage = async (
    action: "cancel" | "reinstate" | "clear_conflict" | "resend" | "retry_notification",
    note = "",
  ) => {
    const list = await service.forApplication(actor, address);
    assert(list.status === "ok");
    const current = list.value.find((value) => value.id === assignmentId);
    assert.isDefined(current);
    return service.manage(actor, {
      ...address,
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: current.revision,
      action,
      note,
    });
  };

  const save = async (reasoning = "Evidence supports the proposed work", note = "") => {
    const page = await read();
    assert(page.draft);
    return service.saveDraft(sam, {
      assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: page.draft.revision,
      draft: { position: "Fund", amount: "40.00", reasoning, observations: [], note },
    });
  };

  const submit = async () => {
    const page = await read();
    assert(page.draft);
    return service.submit(sam, {
      assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: page.draft.revision,
    });
  };

  return {
    service,
    assignmentId,
    address,
    invitation,
    messages,
    read,
    respond,
    manage,
    save,
    submit,
    requestId,
    setDeliveryFailure: (value: boolean) => {
      failDelivery = value;
    },
  };
});

it("completes an independently authored review with reviewer membership and no staff or draft exposure", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  expect(s.messages).toHaveLength(1);
  expect(s.messages[0]).toMatchObject({ kind: "invitation", to: "sam@example.test" });
  expect(await s.service.invite(actor, s.invitation)).toMatchObject({
    status: "ok",
    value: { id: s.assignmentId },
  });
  expect(s.messages).toHaveLength(1);
  expect(await s.read()).toMatchObject({ material: null, draft: null, assessment: null });
  expect(await s.service.read({ userId: "other" }, { assignmentId: s.assignmentId })).toEqual({
    status: "not_found",
  });
  expect(await s.respond("accept")).toMatchObject({ status: "ok", value: { status: "accepted" } });
  expect(
    (await database.client.query("SELECT * FROM memberships WHERE user_id = 'sam'")).rows,
  ).toMatchObject([{ role: "reviewer", administration: "none" }]);
  expect(await getFundingApplicationPage(db, sam, s.address)).toBeNull();
  const page = await s.read();
  assert(page.draft);
  const input = {
    assignmentId: s.assignmentId,
    commandId: randomUUID(),
    expectedDraftRevision: page.draft.revision,
    draft: {
      ...page.draft.content,
      position: "Fund" as const,
      amount: "40.00",
      reasoning: "PRIVATE DRAFT: independent evidence",
    },
  };
  expect(await s.service.saveDraft(sam, input)).toEqual({ status: "ok", value: { revision: 1 } });
  expect(await s.service.saveDraft(sam, input)).toEqual({ status: "ok", value: { revision: 1 } });
  expect(
    await s.service.saveDraft(sam, {
      ...input,
      commandId: randomUUID(),
      draft: { ...input.draft, reasoning: "Overwrite from stale device" },
    }),
  ).toEqual({ status: "conflict" });
  expect(await s.service.read(actor, { assignmentId: s.assignmentId })).toEqual({
    status: "not_found",
  });
  expect(JSON.stringify(await s.service.forApplication(actor, s.address))).not.toContain(
    "PRIVATE DRAFT",
  );
  const managerBefore = await getFundingApplicationPage(db, actor, s.address);
  expect(managerBefore?.application).not.toHaveProperty("draft");
  expect(JSON.stringify(managerBefore?.application.reviews)).not.toContain("PRIVATE DRAFT");
  const submission = {
    assignmentId: s.assignmentId,
    commandId: randomUUID(),
    expectedDraftRevision: 1,
  };
  expect(await s.service.submit(sam, submission)).toEqual({ status: "ok", value: { revision: 2 } });
  expect(await s.service.submit(sam, submission)).toEqual({ status: "ok", value: { revision: 2 } });

  // The reviewer, not the manager, is the recorded person; a replay records nothing more.
  const submitted = () =>
    recordedEvents(database.client, "action IN ('assessment.submitted', 'assessment.amended')");

  expect(await submitted()).toEqual([`assessment.submitted assessment/${s.assignmentId}@1`]);
  expect(
    (
      await database.client.query(
        "SELECT * FROM audit_events WHERE action = 'assessment.submitted'",
      )
    ).rows,
  ).toMatchObject([
    {
      organization_id: "alder",
      actor_user_id: "sam",
      actor_name: "Sam Morgan",
      provenance: { interface: "web" },
      target_type: "assessment",
      target_revision: 1,
    },
  ]);
  expect(s.messages.filter((message) => message.kind === "submission")).toHaveLength(1);
  const manager = await getFundingApplicationPage(db, actor, s.address);
  assert(manager);
  expect(manager.application.reviews.assessments[0]).toMatchObject({
    authorUserId: "sam",
    versions: [{ recorder: { userId: "sam" }, content: { reasoning: input.draft.reasoning } }],
  });
  expect(manager.application.reviews.requests[0]?.status).toBe("received");
  expect(
    await saveApplicationReview(db, actor, {
      ...s.address,
      expectedRevision: manager.application.reviews.revision,
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: {
        action: "edit",
        id: s.assignmentId,
        content: manager.application.reviews.assessments[0]!.versions[0]!.content,
        note: "Manager correction",
      },
    }),
  ).toMatchObject({ status: "invalid", error: "reviewer_authored" });
  expect(await s.save("Amended independent reasoning")).toMatchObject({ status: "ok" });
  expect(await s.submit()).toEqual({ status: "invalid" });
  expect(await submitted()).toHaveLength(1);
  expect(await s.save("Amended independent reasoning", "Corrected interpretation")).toMatchObject({
    status: "ok",
  });
  expect(await s.submit()).toMatchObject({ status: "ok" });
  expect(await submitted()).toEqual(
    [
      `assessment.submitted assessment/${s.assignmentId}@1`,
      `assessment.amended assessment/${s.assignmentId}@2`,
    ].sort(),
  );
  // The manager's rejected edit of the reviewer's assessment recorded nothing.
  expect(await recordedEvents(database.client, "action = 'assessment.recorded'")).toEqual([]);
  expect((await s.read()).assessment?.versions).toHaveLength(2);
  expect(s.messages.filter((message) => message.kind === "submission")).toHaveLength(2);
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
  expect((await s.read()).assessment).toBeNull();
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
  expect(await s.manage("clear_conflict")).toEqual({ status: "invalid" });
  expect(
    await s.manage("clear_conflict", "No current relationship or financial interest"),
  ).toMatchObject({ status: "ok", value: { status: "invited" } });
  await s.respond("accept");
  await s.save("Retain this private writing");
  const before = await s.read();
  assert(before.draft);
  await s.manage("cancel");
  expect(await s.read()).toMatchObject({ material: null, draft: null });
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
  expect(await s.respond("decline")).toEqual({ status: "invalid" });
  expect(await s.respond("accept")).toMatchObject({ status: "ok", value: { status: "submitted" } });
});

it("keeps the assigned evidence and criteria when newer versions arrive", async ({
  db,
  rounds,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();

  const read = async () => {
    const page = await getFundingApplicationPage(db, actor, s.address);
    assert(page);
    return page;
  };

  const edit = async (change: Parameters<typeof editFundingApplication>[2]["change"]) =>
    editFundingApplication(
      db,
      actor,
      {
        ...s.address,
        expectedRevision: (await read()).intake.revision,
        change,
      },
      applicationWork,
    );

  await edit({ action: "mark_ready" });
  await edit({ action: "start_revision", kind: "revision" });
  await edit({
    action: "save_revision",
    draft: {
      kind: "revision",
      reason: "Changed plan",
      content: {
        title: "Updated title",
        applicant: "Community group",
        requested: "90",
        answers: [
          {
            questionId: "1a1e4fe2-aaed-5bf0-a340-41d4868a9a9b",
            question: "Purpose",
            response: "New material",
          },
        ],
      },
    },
  });
  expect(await edit({ action: "publish_revision" })).toMatchObject({ status: "ok" });
  expect(
    await editFundingRound(db, actor, {
      workspaceSlug: "alder",
      publicId: rounds.pageInput.publicId,
      expectedRevision: 0,
      change: {
        section: "criteria",
        criteria: [
          {
            id: "0ce46ffb-63fc-50b1-a4b8-72a16d15e288",
            title: "New criterion",
            description: "New emphasis",
          },
        ],
      },
    }),
  ).toMatchObject({ status: "ok" });
  const page = await s.read();
  expect(page).toMatchObject({
    assignment: { materialChanged: true, criteriaChanged: true },
    material: { title: "Community review", version: 1 },
    criteria: [],
  });
  expect(await s.submit()).toMatchObject({ status: "ok" });
  expect((await s.read()).assessment?.versions[0]?.content).toMatchObject({
    applicationVersion: 1,
    criteriaVersion: 1,
  });
});

it("preserves successful submission when delivery fails and retries only the notification", async ({
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  s.setDeliveryFailure(true);
  expect(await s.submit()).toMatchObject({ status: "ok" });
  expect((await s.read()).assignment.notification).toBe("failed");
  s.setDeliveryFailure(false);
  await s.manage("retry_notification");
  expect((await s.read()).assignment.notification).toBe("sent");
  expect((await s.read()).assessment?.versions).toHaveLength(1);
});

it("enforces invitation expiry, recipient identity, and manager permissions", async ({
  database,
  reviewerScenario: s,
}) => {
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
  expect(await s.manage("resend")).toEqual({ status: "limited" });
  await database.client.query(
    "UPDATE review_assignments SET expires_at = now() - interval '1 hour' WHERE id = $1",
    [s.assignmentId],
  );
  expect(await s.respond("accept")).toEqual({ status: "expired" });
  await database.client.query(
    "UPDATE reviewer_messages SET created_at = now() - interval '2 minutes' WHERE assignment_id = $1",
    [s.assignmentId],
  );
  expect(await s.manage("resend")).toMatchObject({ status: "ok" });
  await s.respond("decline");
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

it("rolls back a submission if its history write fails and preserves immutable authorship", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();
  await database.client.query(
    "CREATE FUNCTION fail_reviewer_submit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'assessment.submitted' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$",
  );
  await database.client.query(
    "CREATE TRIGGER fail_submit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_reviewer_submit()",
  );
  await expect(s.submit()).rejects.toThrow();
  expect((await s.read()).assignment.status).toBe("accepted");
  expect((await s.read()).assessment).toBeNull();
  await database.client.query("DROP TRIGGER fail_submit ON audit_events");
  await s.submit();
  await expect(
    database.client.query("UPDATE assessments SET author_user_id = 'other' WHERE id = $1", [
      s.assignmentId,
    ]),
  ).rejects.toThrow("authorship is immutable");
  await expect(
    database.client.query("DELETE FROM audit_events WHERE assignment_id = $1", [s.assignmentId]),
  ).rejects.toThrow("Recorded audit events cannot be changed");
});

it("pins only the person's own reviewer assignments, without granting staff access", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  const navigation = createNavigationService({
    database: (operation) => operation(db),
    verifiedEmails: async (person) => [`${person.userId}@example.test`],
  });
  const target = { kind: "review" as const, id: s.assignmentId };
  const saved = await navigation.change(sam, { action: "pin", target });
  assert(saved.status === "ok");
  expect(saved.pins).toMatchObject([
    { target, title: "Community review", workspaceSlug: "alder", context: "Alder Foundation" },
  ]);
  expect(await navigation.read(sam)).toEqual(saved);
  expect(await navigation.read(actor)).toEqual({ status: "ok", pins: [] });
  expect(await navigation.change(actor, { action: "pin", target })).toEqual({
    status: "not_found",
  });
  expect(await navigation.change({ userId: "other" }, { action: "pin", target })).toEqual({
    status: "not_found",
  });
  expect(
    await navigation.change(sam, {
      action: "pin",
      target: { kind: "application", id: s.address.publicId },
    }),
  ).toEqual({ status: "not_found" });
  await s.respond("accept");
  expect(await navigation.read(sam)).toEqual(saved);
  await database.client.query("DELETE FROM review_assignments WHERE id = $1", [s.assignmentId]);
  expect(await navigation.read(sam)).toEqual({ status: "ok", pins: [] });
});

it("uses one freshness policy for reviewer, manager, workspace and MCP reads after criteria revert", async ({
  db,
  rounds,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save();

  const check = async (
    criteriaChanged: boolean,
    freshness: "current" | "outdated",
    submitted: boolean,
  ) => {
    const basisComparison = {
      applicationVersion: "same",
      criteriaVersion: "different",
      criteriaContent: criteriaChanged ? "different" : "same",
    };
    expect((await s.read()).assignment).toMatchObject({ criteriaChanged, basisComparison });
    expect(await s.service.list(sam)).toMatchObject({
      status: "ok",
      value: [{ criteriaChanged, basisComparison }],
    });
    expect(await s.service.forApplication(actor, s.address)).toMatchObject({
      status: "ok",
      value: [{ criteriaChanged, basisComparison }],
    });
    const manager = await getFundingApplicationPage(db, actor, s.address);
    assert(manager);
    expect(manager.application.assessments).toMatchObject([
      {
        criteriaChanged,
        criteriaUnknown: false,
        basisComparison,
        status: submitted ? freshness : "outstanding",
      },
    ]);
    expect(
      await listApplicationReviewSummaries(db, actor, {
        workspaceSlug: "alder",
        applicationId: s.address.publicId,
      }),
    ).toMatchObject({
      status: "ok",
      reviews: [{ basisComparison, freshness: submitted ? freshness : "outstanding" }],
    });
    const overview = await listWorkspaceApplications(db, actor, "alder");
    assert(overview.status === "ok");
    expect(
      overview.applications.find((application) => application.id === s.address.publicId),
    ).toMatchObject({ criteriaChanged, reviews: { [submitted ? freshness : "outstanding"]: 1 } });
  };

  const changeCriteria = async (
    expectedRevision: number,
    criteria: { id: string; title: string; description: string }[],
  ) => {
    expect(
      await editFundingRound(db, actor, {
        workspaceSlug: "alder",
        publicId: rounds.pageInput.publicId,
        expectedRevision,
        change: { section: "criteria", criteria },
      }),
    ).toMatchObject({ status: "ok" });
  };

  await changeCriteria(0, [
    { id: "a517b073-299e-5834-a7fa-0355a810a959", title: "Feasibility", description: "" },
  ]);
  await check(true, "outdated", false);
  await changeCriteria(1, []);
  await check(false, "current", false);
  expect(await s.submit()).toMatchObject({ status: "ok" });
  await check(false, "current", true);
  await changeCriteria(2, [
    { id: "a517b073-299e-5834-a7fa-0355a810a959", title: "Feasibility", description: "" },
  ]);
  await check(true, "outdated", true);
  expect((await s.read()).assessment?.versions[0]?.content.criteriaVersion).toBe(1);
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
  });
  const assignments = await s.service.forApplication(actor, s.address);
  assert(assignments.status === "ok");
  expect(assignments.value[0]).not.toHaveProperty("history");
  await database.client.query(
    "UPDATE memberships SET role = 'member' WHERE organization_id='alder' AND user_id='dana'",
  );
  expect(await s.service.history(actor, input)).toEqual({ status: "not_found" });
});

it("requires qualifying workspace membership for legacy acceptance and scopes My work", async ({
  database,
  reviewerScenario: s,
}) => {
  await database.client.query("UPDATE review_assignments SET membership_id = NULL WHERE id = $1", [
    s.assignmentId,
  ]);
  await database.client.query("DELETE FROM memberships WHERE user_id = 'sam'");
  expect(await s.read()).toMatchObject({ membershipRequired: true, material: null, draft: null });
  expect(await s.respond("accept")).toEqual({
    status: "invalid",
    error: "workspace_membership_required",
  });
  expect(await s.service.list(sam, { workspaceSlug: "alder" })).toEqual({ status: "not_found" });
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role) VALUES ('alder', 'sam', 'member')",
  );
  expect(await s.respond("accept")).toEqual({
    status: "invalid",
    error: "workspace_membership_required",
  });
  expect(await s.service.list(sam, { workspaceSlug: "alder" })).toEqual({
    status: "ok",
    value: [],
  });
  await database.client.query("UPDATE memberships SET role = 'reviewer' WHERE user_id = 'sam'");
  expect(await s.respond("accept")).toMatchObject({ status: "ok" });
  expect(await s.service.list(sam, { workspaceSlug: "alder" })).toMatchObject({
    status: "ok",
    value: [{ id: s.assignmentId, workspaceSlug: "alder" }],
  });
  expect(await s.service.list(sam, { workspaceSlug: "birch" })).toEqual({ status: "not_found" });
  expect(
    await s.service.read(sam, { assignmentId: s.assignmentId, workspaceSlug: "birch" }),
  ).toEqual({ status: "not_found" });
});

it("permanently ends assignments on role loss, preserves private work, and attributes manager revocation", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  const organizations = createOrganizationService({
    database: (operation) => operation(db),
    revokeReviewAccess: revokeMembershipReviews,
    isOperator: () => false,
    verifiedEmails: async () => [],
    sendInvitation: async () => {},
    invitationUrl: (token) => token,
  });
  await database.client.query(
    "UPDATE memberships SET administration = 'owner' WHERE user_id = 'dana' AND organization_id = 'alder'",
  );
  await s.respond("accept");
  await s.save("Private work survives loss of responsibilities");
  const original = await s.read();
  expect(await organizations.team(sam, { workspaceSlug: "alder" })).toEqual({
    status: "forbidden",
  });

  const changeRole = async (role: "member" | "reviewer") => {
    const team = await organizations.team(actor, { workspaceSlug: "alder" });
    assert(team.status === "ok");
    const member = team.value.members.find((person) => person.userId === "sam")!;
    return organizations.changeMember(actor, {
      workspaceSlug: "alder",
      userId: "sam",
      expectedMembershipId: member.membershipId,
      expectedVersion: member.version,
      expectedInvitationIds: [],
      administration: "none",
      role,
    });
  };

  expect(await changeRole("member")).toMatchObject({ status: "ok" });
  expect(await s.service.read(sam, { assignmentId: s.assignmentId })).toEqual({
    status: "not_found",
  });
  expect(await s.manage("reinstate")).toEqual({
    status: "invalid",
    error: "workspace_membership_required",
  });
  expect(
    (
      await database.client.query(
        "SELECT actor_user_id, actor_name FROM audit_events WHERE action = 'review_assignment.access_ended'",
      )
    ).rows,
  ).toEqual([{ actor_user_id: "dana", actor_name: "Dana Reed" }]);
  expect(await changeRole("reviewer")).toMatchObject({ status: "ok" });
  expect(await s.read()).toMatchObject({
    assignment: { status: "cancelled" },
    material: null,
    draft: null,
  });
  expect(
    await s.service.saveDraft(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: original.draft!.revision,
      draft: original.draft!.content,
    }),
  ).toEqual({ status: "not_found" });
  expect(await s.manage("reinstate")).toMatchObject({ status: "ok" });
  expect((await s.read()).draft).toEqual(original.draft);
});

const reviewerMigration = readFileSync(
  new URL("../../../../foundation/db/database/migrations/0001_lyrical_tigra.sql", import.meta.url),
  "utf8",
);

it("migrates still-entitled submitted external reviews without changing authored work", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save("Preserve legacy independent reasoning");
  await s.submit();
  const before = await s.read();

  const assignmentSnapshot = async () =>
    (
      await database.client.query<{ assignment: unknown }>(
        "SELECT to_jsonb(a) - 'membership_id' AS assignment FROM review_assignments a WHERE id = $1",
        [s.assignmentId],
      )
    ).rows;

  const originalAssignment = await assignmentSnapshot();
  await database.client.query("UPDATE review_assignments SET membership_id = NULL WHERE id = $1", [
    s.assignmentId,
  ]);
  await database.client.query("DELETE FROM memberships WHERE user_id = 'sam'");
  await database.client.query(reviewerMigration);
  expect(await assignmentSnapshot()).toEqual(originalAssignment);
  expect(
    (
      await database.client.query(
        "SELECT role, administration, email FROM memberships WHERE user_id = 'sam'",
      )
    ).rows,
  ).toEqual([{ role: "reviewer", administration: "none", email: "sam@example.test" }]);
  expect(await s.read()).toEqual(before);
  await database.client.query(reviewerMigration);
  expect(await s.read()).toEqual(before);
});

for (const state of [
  "conflict",
  "cancelled",
  "declined",
  "disabled",
  "stale_membership",
  "ordinary_member",
  "recorded_removal",
] as const) {
  it(`does not migrate ended or ineligible legacy access: ${state}`, async ({
    database,
    reviewerScenario: s,
  }) => {
    await s.respond("accept");
    await database.client.query(
      "UPDATE review_assignments SET membership_id = NULL WHERE id = $1",
      [s.assignmentId],
    );
    if (["conflict", "cancelled", "declined"].includes(state)) {
      await database.client.query("UPDATE review_assignments SET status = $1 WHERE id = $2", [
        state,
        s.assignmentId,
      ]);
    }
    if (state === "recorded_removal") {
      await database.client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, action, target_type, target_id) VALUES ('alder', 'dana', 'membership.removed', 'membership', 'sam')",
      );
    }
    if (state === "disabled") {
      await database.client.query("UPDATE app_users SET active = false WHERE id = 'sam'");
    }
    if (state === "stale_membership") {
      await database.client.query(
        "UPDATE review_assignments SET membership_id = $1 WHERE id = $2",
        [randomUUID(), s.assignmentId],
      );
    }
    if (state === "ordinary_member") {
      await database.client.query("UPDATE memberships SET role = 'member' WHERE user_id = 'sam'");
    } else {
      await database.client.query("DELETE FROM memberships WHERE user_id = 'sam'");
    }
    await database.client.query(reviewerMigration);
    expect(
      (await database.client.query("SELECT role FROM memberships WHERE user_id = 'sam'")).rows,
    ).toEqual(state === "ordinary_member" ? [{ role: "member" }] : []);
    const read = await s.service.read(sam, { assignmentId: s.assignmentId });
    if (read.status === "ok") {
      expect(read.value).toMatchObject({ material: null, draft: null });
    } else {
      expect(read).toEqual({ status: "not_found" });
    }
  });
}

it("keeps legacy conflicts paused until workspace joining, explicit clearance and renewed acceptance", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await s.save("Private legacy draft");
  const draft = (await s.read()).draft;
  await s.respond("report_conflict", "Potential relationship");
  await database.client.query("UPDATE review_assignments SET membership_id = NULL WHERE id = $1", [
    s.assignmentId,
  ]);
  await database.client.query("DELETE FROM memberships WHERE user_id = 'sam'");
  await database.client.query(reviewerMigration);
  expect(await s.read()).toMatchObject({ membershipRequired: true, material: null, draft: null });
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role) VALUES ('alder', 'sam', 'reviewer')",
  );
  expect(await s.read()).toMatchObject({
    assignment: { status: "conflict" },
    material: null,
    draft: null,
  });
  expect(
    await s.manage("clear_conflict", "Reviewed relationship; participation is appropriate"),
  ).toMatchObject({ status: "ok" });
  expect(await s.respond("accept")).toMatchObject({ status: "ok" });
  expect((await s.read()).draft).toEqual(draft);
  expect(await s.save("Continued legacy draft")).toMatchObject({ status: "ok" });
});

it("binds legacy staff assignments without replacing staff membership responsibilities", async ({
  database,
  reviewerScenario: s,
}) => {
  await s.respond("accept");
  await database.client.query(
    "UPDATE memberships SET role = 'program_manager', administration = 'administrator' WHERE user_id = 'sam'",
  );
  const before = (await database.client.query("SELECT * FROM memberships WHERE user_id = 'sam'"))
    .rows;
  await database.client.query("UPDATE review_assignments SET membership_id = NULL WHERE id = $1", [
    s.assignmentId,
  ]);
  await database.client.query(reviewerMigration);
  expect(
    (await database.client.query("SELECT * FROM memberships WHERE user_id = 'sam'")).rows,
  ).toEqual(before);
  expect((await s.read()).material).not.toBeNull();
});
