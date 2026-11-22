import { expect } from "vite-plus/test";

import type { Scenario } from "../scenario";
import { euroAmounts } from "./reply-amounts";
import * as controls from "./review-controls";
import {
  matchingText,
  draft,
  privateReasoning,
  type Assignment,
  type ReviewFixture,
} from "./review-fixture";

const expectedVersion = {
  content: {
    applicationVersion: 1,
    criteriaVersion: 1,
    position: "Fund",
    amount: { currency: "EUR", minorUnits: "20050" },
    reasoning: matchingText(/meal/i),
  },
  recorder: { userId: "priya" },
};

const submitted = async (f: ReviewFixture, a: Assignment, versions: unknown[]) => {
  const { requests, assessments } = await f.reviews();
  expect(requests).toMatchObject([{ id: a.requestId, contactId: f.priya, status: "received" }]);
  expect(assessments).toMatchObject([
    { requestId: a.requestId, contactId: f.priya, authorUserId: "priya", versions },
  ]);
  expect(await f.assignments()).toMatchObject([
    { id: a.assigned.assignmentId, status: "submitted", reviewer_user_id: "priya" },
  ]);
  expect(f.ctx.recipients).toEqual(["dana@example.test"]);
};

export const myAssignments = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  const { assignmentId } = a.assigned;
  const { ctx } = f;
  const jo = await f.contact("jo", "Jo Chen");
  const otherApplication = await ctx.createApplication("Cedar Quilts");
  const otherTarget = { workspaceSlug: "alder", applicationId: otherApplication.publicId };
  const requestId = crypto.randomUUID();
  await ctx.seed("request_review", {
    ...otherTarget,
    expectedReviewRevision: 0,
    expectedApplicationVersion: 1,
    expectedCriteriaVersion: 1,
    id: requestId,
    contactId: jo,
    replacesId: null,
  });
  const invitation = await ctx.seed("invite_reviewer", {
    ...otherTarget,
    requestId,
    commandId: crypto.randomUUID(),
    dueDate: null,
  });
  expect(invitation.assignment).toMatchObject({
    requestId,
    email: "jo@example.test",
    status: "invited",
  });
  return {
    control: controls.listMine,
    verifyReply(reply) {
      expect(reply).toMatch(/River Gardens/i);
      expect(reply).not.toMatch(/Cedar Quilts|Jo Chen/i);
    },
    async verifyEffects() {
      expect(await f.assignments()).toMatchObject([{ id: assignmentId, status: "invited" }]);
    },
  };
};

export const respondToInvite = async (f: ReviewFixture, accept: boolean): Promise<Scenario> => {
  const a = await f.assignment();
  const { assignmentId } = a.assigned;
  const { ctx } = f;

  return {
    control: controls.response(
      accept ? "accept" : "decline",
      accept ? "Invitation accepted." : "Invitation declined.",
    ),
    async verifyEffects() {
      expect(await f.assignments()).toMatchObject([
        accept
          ? { id: assignmentId, status: "accepted", reviewer_user_id: "priya" }
          : { id: assignmentId, status: "declined" },
      ]);
      if (accept) {
        expect((await a.read()).material).not.toBeNull();
      } else {
        expect(await a.read()).toMatchObject({ material: null, draft: null });
      }
      expect(ctx.recipients).toEqual([]);
    },
  };
};

export const completeAssignment = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  return {
    control: controls.complete,
    verifyEffects: () => submitted(f, a, [expectedVersion]),
  };
};

export const assignedEvidence = async (f: ReviewFixture): Promise<Scenario> => {
  await f.changeCriteria("Neighbourhood benefit", 0);
  const a = await f.assignment();
  await a.respond("accept");
  await f.updateMaterial();
  await f.changeCriteria("Project sustainability", 1);
  return {
    control: controls.assignedEvidence,
    manualReplyCriterion:
      "Check that the reply describes the assigned evidence and distinguishes it from any later changes it mentions.",
    verifyReply(reply) {
      expect(reply).toMatch(/neighbou?rhood benefit/i);
      expect(
        euroAmounts(reply).map(({ cents }) => cents),
        "Report the €80 requested in the assigned material",
      ).toContain("8000");
      // The criterion title identifies the assigned version even when the reply omits version numbers.
      const statedCriteria = [...reply.matchAll(/criteria\s+(?:version\s*|v)(\d+)/gi)];
      if (statedCriteria.length) {
        expect(
          statedCriteria.map((match) => match[1]),
          "Assigned criteria version",
        ).toContain("2");
      }
      const statedMaterial = [
        ...reply.matchAll(
          /(?:material|application|evidence)\s+(?:(?:is|was)\s+)?(?:version\s*|v)(\d+)/gi,
        ),
      ];
      if (statedMaterial.length) {
        expect(
          statedMaterial.map((match) => match[1]),
          "Assigned material version",
        ).toContain("1");
      }
    },
    async verifyEffects() {
      expect(await a.read()).toMatchObject({
        assignment: { status: "accepted", materialChanged: true, criteriaChanged: true },
      });
    },
  };
};

export const declareConflict = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  await a.respond("accept");
  const { assignmentId } = a.assigned;
  await a.save({ ...draft, reasoning: privateReasoning });
  const before = await f.draftRows(assignmentId);
  return {
    control: controls.response(
      "report_conflict",
      "Recorded the conflict.",
      "I serve on its board.",
    ),
    async verifyEffects() {
      expect(await f.assignments()).toMatchObject([
        { id: assignmentId, status: "conflict", conflict: matchingText(/board/i) },
      ]);
      expect(await f.draftRows(assignmentId)).toEqual(before);
      expect((await a.read()).material).toBeNull();
    },
  };
};

export const privateDraft = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  await a.respond("accept");
  const { assignmentId } = a.assigned;
  const { ctx } = f;
  return {
    control: controls.privateDraft,
    async verifyEffects() {
      expect(await f.draftRows(assignmentId)).toMatchObject([
        { position: "Fund", reasoning: matchingText(/meal/i) },
      ]);
      expect(Number((await f.draftRows(assignmentId))[0]?.amount)).toBe(200.5);
      expect(await f.assignments()).toMatchObject([{ id: assignmentId, status: "accepted" }]);
      expect((await f.reviews()).assessments).toEqual([]);
      expect(ctx.recipients).toEqual([]);
    },
  };
};

export const submitReview = async (f: ReviewFixture, amend: boolean): Promise<Scenario> => {
  const a = await f.assignment();
  await a.respond("accept");
  await a.save();

  const control = controls.submit;
  if (!amend) {
    return { control, verifyEffects: () => submitted(f, a, [expectedVersion]) };
  }
  await a.submit();
  await f.ctx.sql.query(
    "update reviewer_messages set created_at=now()-interval '2 minutes' where assignment_id=$1 and kind='submission'",
    [a.assigned.assignmentId],
  );
  const previous = (await f.reviews()).assessments[0]?.versions[0];
  const note = "Updated the amount after correcting the budget.";
  await a.save({ ...draft, amount: "210.50", note });
  return {
    control,
    verifyEffects: () =>
      submitted(f, a, [
        previous,
        {
          ...expectedVersion,
          content: { ...expectedVersion.content, amount: { minorUnits: "21050", currency: "EUR" } },
          note,
        },
      ]),
  };
};
