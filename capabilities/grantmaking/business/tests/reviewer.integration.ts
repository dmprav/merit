import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { editFundingApplication } from "@merit/applications/server";
import { recordedEvents } from "@merit/audit/testing";
import { createInlineOrganizationService } from "@merit/organizations/server/testing";
import { actor } from "@merit/organizations/testing/workspace";
import { saveApplicationReview } from "@merit/reviews/server";
import { revokeMembershipReviews } from "@merit/reviews/server/integrations";
import { reviewerTest as it, sam } from "@merit/reviews/testing/reviewer";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { editFundingRound } from "@merit/rounds/server";

import {
  createNavigationService,
  getFundingApplicationPage,
  listApplicationReviewSummaries,
  listWorkspaceApplications,
} from "../src/server";
import { applicationWork } from "./application-work";
import { roundCommitments } from "./application-work";

it("completes an independently authored review with reviewer membership and no staff or draft exposure", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  expect(s.messages).toHaveLength(1);
  expect(s.messages[0]).toMatchObject({
    kind: "invitation",
    to: "sam@example.test",
    url: `https://merit.test/app/alder/work/${s.assignmentId}`,
  });
  expect(await s.service.invite(actor, s.invitation)).toMatchObject({
    status: "ok",
    value: { id: s.assignmentId },
  });
  expect(s.messages).toHaveLength(1);
  expect(await s.read()).toMatchObject({
    material: null,
    draft: null,
    assessment: null,
    work: { available: false, reason: "action_unavailable" },
  });
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
    commandId: "AA90F6BE-8026-4489-8EB5-5C05610807DA",
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
  expect(await s.submit()).toEqual({ status: "invalid", error: "submission_incomplete" });
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
  expect(s.messages.filter((message) => message.kind === "submission")).toHaveLength(1);
});

it.for(["report_conflict", "cancel", "decline"] as const)(
  "hides later evidence changes from a reviewer after %s while the manager retains them",
  async (action, { db, rounds, reviewerScenario: s }) => {
    await s.respond("accept");
    const ended =
      action === "cancel"
        ? await s.manage(action)
        : await s.respond(action, "Relationship disclosed");
    expect(ended.status).toBe("ok");
    expect(
      await editFundingRound(
        db,
        actor,
        {
          workspaceSlug: "alder",
          publicId: rounds.pageInput.publicId,
          expectedRevision: 0,
          change: {
            section: "criteria",
            criteria: [{ id: randomUUID(), title: "New criterion", description: "" }],
          },
        },
        roundCommitments,
      ),
    ).toMatchObject({ status: "ok" });
    const hidden = {
      basisComparison: {
        applicationVersion: "unknown",
        criteriaVersion: "unknown",
        criteriaContent: "unknown",
      },
      materialChanged: false,
      criteriaChanged: false,
    };
    expect(await s.read()).toMatchObject({ assignment: hidden, material: null });
    expect(await s.service.list(sam)).toMatchObject({ status: "ok", value: [hidden] });
    const visible = {
      basisComparison: {
        applicationVersion: "same",
        criteriaVersion: "different",
        criteriaContent: "different",
      },
      criteriaChanged: true,
    };
    expect(await s.service.forApplication(actor, s.address)).toMatchObject({
      status: "ok",
      value: [visible],
    });
    if (action === "cancel") {
      expect(await s.manage("reinstate")).toMatchObject({ status: "ok" });
      expect((await s.read()).assignment).toMatchObject(visible);
      expect(await s.service.list(sam)).toMatchObject({ status: "ok", value: [visible] });
    }
  },
);

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
    await editFundingRound(
      db,
      actor,
      {
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
      },
      roundCommitments,
    ),
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

it("pins only the person's own reviewer assignments, without granting staff access", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  const navigation = createNavigationService({ database: (operation) => operation(db) });
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
    const overview = await listWorkspaceApplications(db, actor, { workspaceSlug: "alder" });
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
      await editFundingRound(
        db,
        actor,
        {
          workspaceSlug: "alder",
          publicId: rounds.pageInput.publicId,
          expectedRevision,
          change: { section: "criteria", criteria },
        },
        roundCommitments,
      ),
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

it("keeps an unaccepted assignment ended after removal and rejoining until explicit reinstatement", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  const organizations = createInlineOrganizationService({
    database: (operation) => operation(db),
    revokeReviewAccess: revokeMembershipReviews,
    isOperator: async () => false,
    verifiedEmails: async () => [],
    sendInvitation: async () => {},
    invitationUrl: (token) => token,
  });
  await database.client.query(
    "UPDATE memberships SET administration = 'owner' WHERE user_id = 'dana' AND organization_id = 'alder'",
  );
  const team = await organizations.team(actor, { workspaceSlug: "alder" });
  assert(team.status === "ok");
  const member = team.value.members.find((person) => person.userId === "sam")!;
  expect(
    await organizations.removeMember(actor, {
      workspaceSlug: "alder",
      userId: "sam",
      expectedMembershipId: member.membershipId,
      expectedMembershipVersion: member.version,
      expectedInvitationIds: [],
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    (
      await database.client.query(
        "SELECT status, membership_id, reviewer_user_id FROM review_assignments WHERE id = $1",
        [s.assignmentId],
      )
    ).rows,
  ).toEqual([{ status: "cancelled", membership_id: member.membershipId, reviewer_user_id: null }]);
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'sam', 'sam@example.test', 'reviewer')",
  );
  expect(await s.service.list(sam, { workspaceSlug: "alder" })).toEqual({
    status: "ok",
    value: [],
  });
  expect(await s.service.read(sam, { assignmentId: s.assignmentId })).toEqual({
    status: "not_found",
  });
  expect(
    await s.service.respond(sam, {
      assignmentId: s.assignmentId,
      commandId: randomUUID(),
      expectedRevision: 1,
      action: "accept",
      note: "",
    }),
  ).toEqual({ status: "not_found" });
  expect(await s.manage("reinstate")).toMatchObject({ status: "ok" });
  expect(await s.read()).toMatchObject({ assignment: { status: "invited" }, material: null });
  expect(await s.respond("accept")).toMatchObject({ status: "ok" });
  expect((await s.read()).material).not.toBeNull();
});

it("permanently ends assignments on role loss, preserves private work, and attributes manager revocation", async ({
  db,
  database,
  reviewerScenario: s,
}) => {
  const organizations = createInlineOrganizationService({
    database: (operation) => operation(db),
    revokeReviewAccess: revokeMembershipReviews,
    isOperator: async () => false,
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

  const changeRole = async (role: "member" | "reviewer" | "program_manager") => {
    const team = await organizations.team(actor, { workspaceSlug: "alder" });
    assert(team.status === "ok");
    const member = team.value.members.find((person) => person.userId === "sam")!;
    return organizations.changeMember(actor, {
      workspaceSlug: "alder",
      userId: "sam",
      expectedMembershipId: member.membershipId,
      expectedMembershipVersion: member.version,
      expectedInvitationIds: [],
      administration: "none",
      role,
    });
  };

  expect(await changeRole("program_manager")).toMatchObject({ status: "ok" });
  expect((await s.read()).draft).toEqual(original.draft);
  expect(await changeRole("reviewer")).toMatchObject({ status: "ok" });
  expect((await s.read()).draft).toEqual(original.draft);
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
