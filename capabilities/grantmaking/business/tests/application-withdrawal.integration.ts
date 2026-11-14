import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { materialVersionSchema, type IntakeChange } from "@merit/applications/domain";
import { editFundingApplication, selectApplicationContact } from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { reviewRevisionSchema, type ReviewChange } from "@merit/reviews/domain";
import { createReviewerService, saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import {
  getFundingApplicationContent,
  getFundingApplicationPage,
  getFundingRoundOverview,
  getFundingRoundPage,
  listFundingApplicationHistory,
  listFundingApplications,
  listWorkspaceActivity,
  listWorkspaceApplications,
} from "../src/server";
import { fundingRoundContactUsage } from "../src/server/integrations";
import { applicationWork } from "../src/server/persistence/commands/application-work";
import { recordedEvents, withAuditFailure } from "./audit-events";
import { roundTest } from "./round-test";

const sam = { userId: "sam" };

const today = () => new Date().toISOString().slice(0, 10);

const withdrawal = (reason = "The applicant secured other funding.", withdrawnOn = today()) =>
  ({ action: "withdraw", withdrawnOn, reason }) as const;

/** A ready, recommended application with one received review and one outstanding, invited review. */
const it = roundTest.extend("scenario", async ({ db, database, rounds }) => {
  await database.client.query(
    "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('sam','Sam Morgan','sam-account')",
  );
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'sam', 'sam@example.test', 'reviewer')",
  );
  const address = await rounds.createApplication("Withdrawn meals");
  await rounds.recommendApplication(address, "4000");
  const sibling = await rounds.createApplication("Neighbouring project");
  await rounds.recommendApplication(sibling, "1000");
  const unknown = await rounds.createApplication("Amount not known", null);

  const contact = async (name: string, email: string) => {
    const created = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug: "alder",
        action: "create",
        contactId: randomUUID(),
        details: { name, email, affiliation: "" },
      },
      fundingRoundContactUsage,
    );
    assert(created.status === "ok");
    return created.contact;
  };

  const read = async (target = address) => (await getFundingApplicationPage(db, actor, target))!;

  const review = async (change: ReviewChange, target = address) => {
    const page = await read(target);
    return saveApplicationReview(db, actor, {
      ...target,
      expectedRevision: reviewRevisionSchema.parse(page.application.reviews.revision),
      expectedApplicationVersion: materialVersionSchema.parse(page.application.version),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change,
    });
  };

  const edit = async (change: IntakeChange, target = address, revision?: number) =>
    editFundingApplication(
      db,
      actor,
      {
        ...target,
        expectedRevision: revision ?? (await read(target)).intake.revision,
        change,
      },
      applicationWork,
    );

  const service = createReviewerService({
    database: async (operation) => operation(db),
    verifiedEmails: async (person) => [`${person.userId}@example.test`],
    send: async () => {},
    reviewerUrl: (slug, id) => `https://merit.test/app/${slug}/work/${id}`,
    managerUrl: (slug, id) => `https://merit.test/app/${slug}/applications/${id}`,
  });

  // A received request with a submitted assessment, so closure leaves finished work alone.
  const received = await contact("Rae Received", "rae@example.test");
  const receivedRequest = randomUUID();
  const assessmentId = randomUUID();
  expect(
    await review({
      action: "request",
      id: receivedRequest,
      contactId: received.id,
      replacesId: null,
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    await review({
      action: "record",
      id: assessmentId,
      contactId: received.id,
      requestId: receivedRequest,
      previousId: null,
      content: {
        applicationVersion: materialVersionSchema.parse(1),
        criteriaVersion: criteriaVersionSchema.parse(1),
        date: null,
        position: null,
        amount: null,
        reasoning: "Recorded before the withdrawal.",
        observations: [],
      },
    }),
  ).toMatchObject({ status: "ok" });

  // An outstanding request whose reviewer accepted and saved a private draft.
  const reviewer = await contact("Sam Morgan", "sam@example.test");
  const requestId = randomUUID();
  expect(
    await review({ action: "request", id: requestId, contactId: reviewer.id, replacesId: null }),
  ).toMatchObject({ status: "ok" });
  const invited = await service.invite(actor, {
    ...address,
    requestId,
    commandId: randomUUID(),
    dueDate: null,
  });
  assert(invited.status === "ok");
  const assignmentId = invited.value.id;

  const reviewerPage = async () => {
    const result = await service.read(sam, { assignmentId });
    assert(result.status === "ok");
    return result.value;
  };

  expect(
    await service.respond(sam, {
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: (await reviewerPage()).assignment.revision,
      action: "accept",
      note: "",
    }),
  ).toMatchObject({ status: "ok" });

  const draft = async (reasoning: string) => {
    const page = await reviewerPage();
    assert(page.draft);
    return service.saveDraft(sam, {
      assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: page.draft.revision,
      draft: { position: "Fund", amount: "40.00", reasoning, observations: [], note: "" },
    });
  };

  expect(await draft("Private draft kept through withdrawal")).toMatchObject({ status: "ok" });

  return {
    address,
    sibling,
    unknown,
    service,
    assignmentId,
    requestId,
    receivedRequest,
    assessmentId,
    reviewer,
    reviewerPage,
    draft,
    read,
    review,
    edit,
  };
});

it("records the withdrawal beside the retained case and keeps all of its work", async ({
  db,
  database,
  scenario: s,
}) => {
  const before = await s.read();
  expect(before.application.intakeStatus).toBe("ready");
  expect(
    await s.edit(withdrawal("  The applicant secured other funding.  ", "2020-05-06")),
  ).toEqual({
    status: "ok",
    revision: before.intake.revision + 1,
  });

  const page = await s.read();
  expect(page.intake.revision).toBe(before.intake.revision + 1);
  expect(page.application).toMatchObject({
    intakeStatus: "ready",
    version: before.application.version,
    withdrawal: {
      withdrawnOn: "2020-05-06",
      reason: "The applicant secured other funding.",
      recorder: { userId: "dana" },
    },
  });
  expect(page.application.withdrawal?.recorder.recordedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  expect(page.application.submission).toEqual(before.application.submission);
  expect(page.application.reviews.assessments).toEqual(before.application.reviews.assessments);
  expect(page.application.managerRecommendation).toEqual(before.application.managerRecommendation);
  expect(page.intake.materialVersions).toEqual(before.intake.materialVersions);

  // Reads expose the withdrawal, and the same transaction recorded history and audit.
  const details = await getFundingApplicationContent(db, actor, {
    workspaceSlug: "alder",
    applicationId: s.address.publicId,
    section: "details",
    offset: 0,
    length: 8000,
  });
  assert(details.status === "ok");
  expect(JSON.parse(details.content)).toMatchObject({
    withdrawal: { withdrawnOn: "2020-05-06", reason: "The applicant secured other funding." },
  });
  expect(page.intake.history[0]).toMatchObject({
    action: "application.withdraw",
    reason: "The applicant secured other funding.",
    before: { id: s.address.publicId },
    after: { withdrawal: { withdrawnOn: "2020-05-06" } },
  });
  expect(page.intake.history[0]!.before).not.toHaveProperty("withdrawal");
  expect(await recordedEvents(database.client, "action = 'application.withdraw'")).toEqual([
    `application.withdraw application/${s.address.publicId}@${page.intake.revision}`,
  ]);
});

it("keeps the intake state and the shared working revision exactly as they were", async ({
  scenario: s,
}) => {
  expect(await s.edit({ action: "start_revision", kind: "revision" })).toMatchObject({
    status: "ok",
  });
  const saved = await s.edit({
    action: "save_revision",
    draft: {
      kind: "revision",
      reason: "Clarify the venue",
      content: { title: "Retitled while withdrawn" },
    },
  });
  expect(saved).toMatchObject({ status: "ok" });
  const before = await s.read();

  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });
  const withdrawn = await s.read();
  expect(withdrawn.intake.workingRevision).toEqual(before.intake.workingRevision);
  expect(withdrawn.application.intakeStatus).toBe(before.application.intakeStatus);
  expect(withdrawn.application.version).toBe(before.application.version);

  expect(await s.edit({ action: "reinstate", reason: "The applicant returned." })).toMatchObject({
    status: "ok",
  });
  const reinstated = await s.read();
  expect(reinstated.intake.workingRevision).toEqual(before.intake.workingRevision);
  expect(reinstated.application).not.toHaveProperty("withdrawal");
});

it("can withdraw an application that is still in preparation", async ({ rounds, scenario: s }) => {
  const preparing = await rounds.createApplication("Still preparing");
  const page = await s.read(preparing);
  expect(page.application.intakeStatus).toBe("in_preparation");

  expect(await s.edit(withdrawal(), preparing)).toMatchObject({ status: "ok" });
  expect((await s.read(preparing)).application).toMatchObject({
    intakeStatus: "in_preparation",
    withdrawal: { reason: "The applicant secured other funding." },
  });
});

it("closes outstanding review requests and ends reviewer access without touching finished work", async ({
  database,
  scenario: s,
}) => {
  const before = await s.read();

  const draftContent = async () =>
    (
      await database.client.query<{ content: { reasoning: string } }>(
        "SELECT content FROM reviewer_drafts WHERE assignment_id = $1",
        [s.assignmentId],
      )
    ).rows[0]?.content.reasoning;

  expect(await draftContent()).toBe("Private draft kept through withdrawal");

  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });

  const { requests, assessments } = (await s.read()).application.reviews;
  expect(requests.find((request) => request.id === s.requestId)).toMatchObject({
    status: "cancelled",
    closedBy: { userId: "dana", cause: "application_withdrawn" },
  });
  expect(requests.find((request) => request.id === s.receivedRequest)).toMatchObject({
    status: "received",
  });
  expect(requests.find((request) => request.id === s.receivedRequest)?.closedBy).not.toHaveProperty(
    "cause",
  );
  expect(assessments).toEqual(before.application.reviews.assessments);
  expect((await s.read()).application.reviews.revision).toBeGreaterThan(
    before.application.reviews.revision,
  );

  const assignment = await s.reviewerPage();
  expect(assignment.assignment.status).toBe("cancelled");
  expect(await draftContent()).toBe("Private draft kept through withdrawal");
  expect(
    await recordedEvents(database.client, "action = 'review_assignment.access_ended'"),
  ).toEqual([
    `review_assignment.access_ended review_assignment/${s.assignmentId}@${assignment.assignment.revision}`,
  ]);
  // Ended access is not a withdrawal error: the reviewer can no longer see the work.
  expect(
    await s.service.saveDraft(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: 1,
      draft: { position: "Fund", amount: "40.00", reasoning: "Late", observations: [], note: "" },
    }),
  ).toEqual({ status: "not_found" });
});

it("rejects a submitted reviewer's amendment, draft, and response while the application is withdrawn", async ({
  scenario: s,
}) => {
  const submitted = await s.service.submit(sam, {
    assignmentId: s.assignmentId,
    commandId: randomUUID(),
    expectedDraftRevision: (await s.reviewerPage()).draft!.revision,
  });
  expect(submitted).toMatchObject({ status: "ok" });
  expect(await s.draft("Amendment drafted before the withdrawal")).toMatchObject({ status: "ok" });
  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });

  // The submitted review keeps its access, but nothing can be written to the withdrawn case.
  const page = await s.reviewerPage();
  expect(page.assignment.status).toBe("submitted");
  expect(page.assessment?.versions).toHaveLength(1);
  expect(await s.draft("Amendment after the withdrawal")).toEqual({
    status: "invalid",
    error: "application_withdrawn",
  });
  expect(
    await s.service.submit(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: page.draft!.revision,
    }),
  ).toEqual({ status: "invalid", error: "application_withdrawn" });
  expect(
    await s.service.respond(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedRevision: page.assignment.revision,
      action: "report_conflict",
      note: "Conflict",
    }),
  ).toEqual({ status: "invalid", error: "application_withdrawn" });
  expect((await s.reviewerPage()).assessment?.versions).toHaveLength(1);
});

it("closes every outstanding request, including those without a reviewer invitation", async ({
  db,
  database,
  scenario: s,
}) => {
  const other = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug: "alder",
      action: "create",
      contactId: randomUUID(),
      details: { name: "Uninvited", email: "uninvited@example.test", affiliation: "" },
    },
    fundingRoundContactUsage,
  );
  assert(other.status === "ok");
  const requestId = randomUUID();
  expect(
    await s.review({
      action: "request",
      id: requestId,
      contactId: other.contact.id,
      replacesId: null,
    }),
  ).toMatchObject({ status: "ok" });

  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });

  const requests = (await s.read()).application.reviews.requests;
  expect(requests.filter((request) => request.status === "outstanding")).toEqual([]);
  // Each closed request records the same event a manager's cancellation does, with its cause.
  const events = (
    await database.client.query<{ target_id: string; details: { cause?: string } }>(
      "SELECT target_id, details FROM audit_events WHERE action = 'review_request.cancelled'",
    )
  ).rows;
  expect(events.map((event) => event.target_id).sort((a, b) => a.localeCompare(b))).toEqual(
    [s.requestId, requestId].sort((a, b) => a.localeCompare(b)),
  );
  expect(events.every((event) => event.details.cause === "application_withdrawn")).toBe(true);
  expect(requests.find((request) => request.id === requestId)?.closedBy).toMatchObject({
    cause: "application_withdrawn",
  });
});

it("rolls back the withdrawal and its closures when any part cannot be recorded", async ({
  database,
  scenario: s,
}) => {
  const before = await s.read();
  const result = await withAuditFailure(database.client, () => s.edit(withdrawal())).catch(
    (error: unknown) => error,
  );
  expect(result).toBeInstanceOf(Error);

  const after = await s.read();
  expect(after.application).not.toHaveProperty("withdrawal");
  expect(after.intake.revision).toBe(before.intake.revision);
  expect(after.application.reviews).toEqual(before.application.reviews);
  expect((await s.reviewerPage()).assignment.status).toBe("accepted");
});

it("rejects a stale revision, a blank reason, a future date, and a repeated withdrawal", async ({
  scenario: s,
}) => {
  const before = await s.read();
  expect(await s.edit(withdrawal(), s.address, before.intake.revision - 1)).toEqual({
    status: "conflict",
  });
  expect(await s.edit(withdrawal("   "))).toEqual({
    status: "invalid",
    error: "invalid_application",
  });
  expect(await s.edit(withdrawal("x".repeat(2001)))).toEqual({
    status: "invalid",
    error: "invalid_application",
  });
  const tomorrow = new Date(Date.now() + 60 * 3_600_000).toISOString().slice(0, 10);
  expect(await s.edit(withdrawal("Too soon", tomorrow))).toEqual({
    status: "invalid",
    error: "withdrawal_date_in_future",
  });
  expect((await s.read()).intake.revision).toBe(before.intake.revision);
  expect((await s.read()).application).not.toHaveProperty("withdrawal");

  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });
  const withdrawn = await s.read();
  expect(await s.edit(withdrawal())).toEqual({ status: "invalid", error: "application_withdrawn" });
  expect((await s.read()).intake.revision).toBe(withdrawn.intake.revision);
});

it("rejects every write to a withdrawn case on every capability, while reads stay whole", async ({
  db,
  scenario: s,
}) => {
  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });
  const withdrawn = await s.read();
  const withdrawnError = { status: "invalid", error: "application_withdrawn" };

  for (const change of [
    { action: "save_content", content: { title: "Changed" } },
    { action: "details", summary: "Staff note" },
    { action: "mark_ready" },
    { action: "start_revision", kind: "correction" },
    {
      action: "save_revision",
      draft: { kind: "revision", reason: "", content: { title: "Changed" } },
    },
    { action: "publish_revision" },
    { action: "discard_revision" },
    { action: "delete" },
    { action: "save_content", content: { title: "Changed" }, contactId: randomUUID() },
  ] satisfies IntakeChange[]) {
    expect(await s.edit(change), JSON.stringify(change)).toEqual(withdrawnError);
  }
  expect(
    await selectApplicationContact(db, actor, {
      ...s.address,
      expectedRevision: withdrawn.intake.revision,
      contactId: s.reviewer.id,
    }),
  ).toEqual(withdrawnError);

  const newRequest = { action: "request", id: randomUUID(), contactId: s.reviewer.id };
  for (const change of [
    { ...newRequest, replacesId: null },
    { action: "cancel", id: s.receivedRequest },
    {
      action: "record",
      id: randomUUID(),
      contactId: s.reviewer.id,
      requestId: null,
      previousId: null,
      content: {
        applicationVersion: materialVersionSchema.parse(1),
        criteriaVersion: criteriaVersionSchema.parse(1),
        date: null,
        position: null,
        amount: null,
        reasoning: "After withdrawal",
        observations: [],
      },
    },
    {
      action: "edit",
      id: s.assessmentId,
      content: withdrawn.application.reviews.assessments[0]!.versions[0]!.content,
      note: "Correction",
    },
  ] as ReviewChange[]) {
    expect(await s.review(change), JSON.stringify(change)).toEqual(withdrawnError);
  }
  // A retry of a change recorded before the withdrawal is still answered with its saved result.
  expect(
    await s.review({
      action: "request",
      id: s.requestId,
      contactId: s.reviewer.id,
      replacesId: null,
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    await s.service.invite(actor, {
      ...s.address,
      requestId: randomUUID(),
      commandId: randomUUID(),
      dueDate: null,
    }),
  ).toEqual({ status: "invalid", error: "application_withdrawn" });
  const assignment = await s.reviewerPage();
  expect(
    await s.service.manage(actor, {
      ...s.address,
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedRevision: assignment.assignment.revision,
      action: "reinstate",
      note: "",
    }),
  ).toEqual({ status: "invalid", error: "application_withdrawn" });
  expect(
    await s.service.respond(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedRevision: assignment.assignment.revision,
      action: "decline",
      note: "",
    }),
  ).toEqual({ status: "invalid", error: "application_withdrawn" });
  expect(
    await saveFundingRecommendation(db, actor, {
      ...s.address,
      expectedRevision: withdrawn.recommendationVersion,
      expectedApplicationVersion: withdrawn.application.version,
      recommendation: {
        position: "Fund",
        allocation: { currency: "EUR", minorUnits: "100" },
        reasoning: "Changed after withdrawal",
      },
    }),
  ).toEqual(withdrawnError);

  // Nothing changed, and the whole case remains readable.
  const after = await s.read();
  expect(after.intake.revision).toBe(withdrawn.intake.revision);
  expect(after.application).toEqual(withdrawn.application);
  expect(after.application.managerRecommendation).not.toBeNull();
  expect(after.application.submission?.answers.length).toBeGreaterThan(0);
  expect(after.application.reviews.assessments).toHaveLength(1);
  expect(after.intake.history.map((entry) => entry.action)).toContain("application.withdraw");
});

it("reinstates with a reason, restoring active work but not the closed requests", async ({
  database,
  scenario: s,
}) => {
  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });
  const withdrawn = await s.read();

  expect(await s.edit({ action: "reinstate", reason: "   " })).toEqual({
    status: "invalid",
    error: "invalid_application",
  });
  expect(
    await s.edit({ action: "reinstate", reason: "Back" }, s.address, withdrawn.intake.revision - 1),
  ).toEqual({ status: "conflict" });
  expect(await s.edit({ action: "reinstate", reason: "  The applicant returned.  " })).toEqual({
    status: "ok",
    revision: withdrawn.intake.revision + 1,
  });

  const page = await s.read();
  expect(page.application).not.toHaveProperty("withdrawal");
  expect(page.application.intakeStatus).toBe("ready");
  expect(page.application.managerRecommendation).toEqual(
    withdrawn.application.managerRecommendation,
  );
  expect(
    page.application.reviews.requests.find((request) => request.id === s.requestId),
  ).toMatchObject({
    status: "cancelled",
    closedBy: { cause: "application_withdrawn" },
  });
  expect((await s.reviewerPage()).assignment.status).toBe("cancelled");
  expect(page.intake.history.map((entry) => [entry.action, entry.reason]).slice(0, 2)).toEqual([
    ["application.reinstate", "The applicant returned."],
    ["application.withdraw", "The applicant secured other funding."],
  ]);
  expect(page.intake.history[0]!.before).toMatchObject({ withdrawal: { withdrawnOn: today() } });
  expect(page.intake.history[0]!.after).not.toHaveProperty("withdrawal");
  expect(
    await recordedEvents(
      database.client,
      "action IN ('application.withdraw', 'application.reinstate')",
    ),
  ).toEqual(
    [
      `application.reinstate application/${s.address.publicId}@${page.intake.revision}`,
      `application.withdraw application/${s.address.publicId}@${withdrawn.intake.revision}`,
    ].sort(),
  );

  // Managers can restore access through the existing assignment action or by requesting again.
  expect(
    await s.service.manage(actor, {
      ...s.address,
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedRevision: (await s.reviewerPage()).assignment.revision,
      action: "reinstate",
      note: "",
    }),
  ).toMatchObject({ status: "ok" });
  expect(await s.edit({ action: "reinstate", reason: "Again" })).toEqual({
    status: "invalid",
    error: "application_not_withdrawn",
  });

  // Withdrawing again records a new event instead of editing the earlier one.
  expect(await s.edit(withdrawal("Withdrew a second time."))).toMatchObject({ status: "ok" });
  expect(
    (await s.read()).intake.history.filter((entry) => entry.action === "application.withdraw"),
  ).toHaveLength(2);
});

it("excludes withdrawn applications from every total and discloses how many", async ({
  db,
  scenario: s,
  rounds: { pageInput },
}) => {
  const overview = async () => {
    const result = await getFundingRoundOverview(db, actor, {
      workspaceSlug: "alder",
      roundId: pageInput.publicId,
    });
    assert(result.status === "ok");
    return result.round.totals;
  };

  const roundPage = async () =>
    (await getFundingRoundPage(db, actor, { ...pageInput, kind: "round" }))!.round;

  // Three applications: two request 80.00 (40.00 and 10.00 proposed) and one request no known amount.
  const [first, second] = [await overview(), await roundPage()];
  expect(first).toMatchObject({
    requested: encodeMoney(fromMinorUnits(16000n)),
    proposed: encodeMoney(fromMinorUnits(5000n)),
    unknownRequests: 1,
    withdrawnApplications: 0,
  });
  expect(second.totals.withdrawnApplications).toBe(0);

  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });
  expect(await s.edit(withdrawal(), s.unknown)).toMatchObject({ status: "ok" });

  const totals = await overview();
  expect(totals).toMatchObject({
    requested: encodeMoney(fromMinorUnits(8000n)),
    proposed: encodeMoney(fromMinorUnits(1000n)),
    remaining: encodeMoney(fromMinorUnits(9000n)),
    withdrawnApplications: 2,
  });
  expect(totals.unknownRequests).toBe(0);
  const page = await roundPage();
  expect(page.totals).toMatchObject({
    requested: fromMinorUnits(8000n),
    proposed: fromMinorUnits(1000n),
    withdrawnApplications: 2,
    reviews: { assigned: 0 },
  });
  expect(page.applications).toHaveLength(3);
  expect(page.applications.filter((application) => application.withdrawal)).toHaveLength(2);

  // The sibling's recommendation context ignores the withdrawn allocation.
  const siblingPage = await s.read(s.sibling);
  expect(siblingPage.round.totals).toMatchObject({
    proposed: fromMinorUnits(1000n),
    remaining: fromMinorUnits(9000n),
    withdrawnApplications: 2,
  });
  expect(
    await saveFundingRecommendation(db, actor, {
      ...s.sibling,
      expectedRevision: siblingPage.recommendationVersion,
      expectedApplicationVersion: siblingPage.application.version,
      recommendation: {
        position: "Fund",
        allocation: { currency: "EUR", minorUnits: "9500" },
        reasoning: "Uses the budget the withdrawn application released.",
      },
    }),
  ).toMatchObject({
    status: "ok",
    totals: { proposed: fromMinorUnits(9500n), withdrawnApplications: 2 },
  });

  // Reinstatement counts the case again.
  expect(await s.edit({ action: "reinstate", reason: "Returned" }, s.unknown)).toMatchObject({
    status: "ok",
  });
  expect(await overview()).toMatchObject({ unknownRequests: 1, withdrawnApplications: 1 });
  expect(await s.edit({ action: "reinstate", reason: "Returned" })).toMatchObject({ status: "ok" });
  expect(await overview()).toMatchObject({
    requested: encodeMoney(fromMinorUnits(16000n)),
    proposed: encodeMoney(fromMinorUnits(13500n)),
    withdrawnApplications: 0,
  });
});

it("excludes withdrawn applications from review progress and flags them in lists", async ({
  db,
  scenario: s,
  rounds: { pageInput },
}) => {
  const progress = async () =>
    (await getFundingRoundPage(db, actor, { ...pageInput, kind: "round" }))!.round.totals.reviews;

  expect(await progress()).toMatchObject({ assigned: 2, outstanding: 1 });

  expect(await s.edit(withdrawal())).toMatchObject({ status: "ok" });
  expect(await progress()).toMatchObject({ assigned: 0, outstanding: 0 });

  const overviews = await listWorkspaceApplications(db, actor, "alder");
  assert(overviews.status === "ok");
  expect(
    Object.fromEntries(
      overviews.applications.map((application) => [application.title, application.withdrawn]),
    ),
  ).toEqual({ "Amount not known": false, "Neighbouring project": false, "Withdrawn meals": true });

  const listed = await listFundingApplications(db, actor, {
    workspaceSlug: "alder",
    roundId: pageInput.publicId,
    limit: 10,
  });
  assert(listed.status === "ok");
  expect(
    listed.applications.map((application) => [application.applicationId, application.withdrawn]),
  ).toContainEqual([s.address.publicId, true]);
});

it("labels withdrawals in workspace activity with their reasons and keeps them out of nothing else", async ({
  db,
  scenario: s,
}) => {
  expect(await s.edit(withdrawal("Funding found elsewhere."))).toMatchObject({ status: "ok" });
  expect(await s.edit({ action: "reinstate", reason: "Funding fell through." })).toMatchObject({
    status: "ok",
  });

  const activity = await listWorkspaceActivity(db, actor, { workspaceSlug: "alder" });
  assert(activity.status === "ok");
  expect(
    activity.entries
      .filter((entry) => entry.action.startsWith("application.") && entry.reason !== null)
      .map((entry) => [entry.action, entry.reason]),
  ).toEqual([
    ["application.reinstate", "Funding fell through."],
    ["application.withdraw", "Funding found elsewhere."],
  ]);
  expect(
    activity.entries.filter((entry) => entry.action === "assessment.recorded").map((e) => e.reason),
  ).toEqual([null]);

  const history = await listFundingApplicationHistory(db, actor, {
    workspaceSlug: "alder",
    applicationId: s.address.publicId,
    history: "intake",
    limit: 50,
  });
  assert(history.status === "ok");
  expect(history.entries.map((entry) => entry.action)).toEqual(
    expect.arrayContaining(["application.withdraw", "application.reinstate"]),
  );
});
