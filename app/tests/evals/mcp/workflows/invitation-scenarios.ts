import { expect } from "vite-plus/test";

import type { Scenario } from "../scenario";
import * as controls from "./review-controls";
import { matchingText, draft, privateReasoning, type ReviewFixture } from "./review-fixture";

export const invitationStatus = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  const { ctx } = f;
  const { assignmentId } = a.assigned;
  await f.messageStatus(assignmentId, "invitation", "failed");
  await f.request(await f.contact("jo", "Jo Chen"));
  return {
    control: controls.invitationStatus,
    manualReplyCriterion:
      "Check that the failed invitation belongs to Priya and that Jo is never described as invited.",
    verifyReply(reply) {
      expect(reply).toMatch(/Priya/i);
      expect(reply).toMatch(/fail|unsuccess|not sent|didn.t send/i);
      expect(reply.replaceAll("*", ""), "Jo had no invitation").not.toMatch(
        /\bJo(?: Chen)?(?:['’]s (?:invite|invitation|email))? (?:was|is|has been) (?:also )?(?:invited|sent|delivered)\b|\b(?:an|the) (?:invitation|invite) was sent to Jo\b/i,
      );
    },
    async verifyEffects() {
      expect(await f.assignments()).toMatchObject([
        { id: assignmentId, email: "priya@example.test" },
      ]);
      expect((await f.reviews()).requests).toHaveLength(2);
      expect(ctx.recipients).toEqual([]);
    },
  };
};

export const resendInvite = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  const { ctx } = f;
  const { assignmentId } = a.assigned;
  // The failed attempt predates the per-recipient one-minute retry window.
  await ctx.sql.query(
    "update reviewer_messages set created_at=now()-interval '2 minutes' where assignment_id=$1 and kind='invitation'",
    [assignmentId],
  );
  await f.messageStatus(assignmentId, "invitation", "failed");
  return {
    control: controls.manage("resend", "Sent Priya’s invitation again."),
    async verifyEffects() {
      expect(await f.assignments()).toMatchObject([
        { id: assignmentId, status: "invited", request_id: a.requestId },
      ]);
      expect(ctx.recipients).toEqual(["priya@example.test"]);
      expect(
        (
          await ctx.sql.query(
            "select kind,status from reviewer_messages where assignment_id=$1 order by created_at",
            [assignmentId],
          )
        ).rows.at(-1),
      ).toMatchObject({ kind: "invitation", status: "sent" });
    },
  };
};

export const retryNotice = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  await a.respond("accept");
  const { ctx, target } = f;
  const { assignmentId } = a.assigned;
  await a.save();
  await a.submit();
  await f.messageStatus(assignmentId, "submission", "failed");
  const before = await f.reviews();
  return {
    control: controls.manage("retry_notification", "Retried the manager notification."),
    async verifyEffects() {
      expect(await f.reviews()).toEqual(before);
      expect(ctx.recipients).toEqual(["dana@example.test"]);
      expect((await ctx.seed("list_application_reviewers", target)).assignments).toMatchObject([
        { id: assignmentId, status: "submitted", notification: "sent" },
      ]);
    },
  };
};

export const clearConflict = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  await a.respond("accept");
  const { ctx, target } = f;
  const { assignmentId } = a.assigned;

  const history = (call = ctx.seed) => call("list_reviewer_history", { ...target, assignmentId });

  await a.respond("report_conflict", "I have an advisory relationship.");
  return {
    control: controls.manage(
      "clear_conflict",
      "Cleared the conflict.",
      "The advisory relationship ended in 2020.",
    ),
    async verifyEffects() {
      expect(await f.assignments()).toMatchObject([
        { id: assignmentId, status: "invited", conflict: "" },
      ]);
      expect((await history()).entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "review_assignment.conflict_cleared",
            note: matchingText(/2020/),
          }),
        ]),
      );
      expect((await a.read()).material).toBeNull();
    },
  };
};

export const reinstateAccess = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  await a.respond("accept");
  const { assignmentId } = a.assigned;
  await a.manage("cancel");
  const before = (await f.reviews()).requests[0];
  return {
    control: controls.manage("reinstate", "Restored Priya’s access."),
    async verifyEffects() {
      expect(await f.assignments()).toMatchObject([
        { id: assignmentId, status: "accepted", request_id: a.requestId },
      ]);
      expect((await f.reviews()).requests).toMatchObject([
        {
          id: a.requestId,
          applicationVersion: before?.applicationVersion,
          criteriaVersion: before?.criteriaVersion,
        },
      ]);
      expect((await a.read()).material).not.toBeNull();
    },
  };
};

export const endAccess = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  await a.respond("accept");
  const { assignmentId } = a.assigned;
  await a.save({ ...draft, reasoning: privateReasoning });
  const before = await f.draftRows(assignmentId);
  return {
    control: controls.manage("cancel", "Ended Priya’s access."),
    async verifyEffects() {
      expect(await f.assignments()).toMatchObject([{ id: assignmentId, status: "cancelled" }]);
      expect(await f.draftRows(assignmentId)).toEqual(before);
      expect(await a.read()).toMatchObject({ material: null, draft: null });
    },
  };
};

export const invitationHistory = async (f: ReviewFixture): Promise<Scenario> => {
  const a = await f.assignment();
  await a.respond("accept");
  const { ctx } = f;
  const { assignmentId } = a.assigned;
  await a.save({ ...draft, reasoning: privateReasoning });
  const before = await f.draftRows(assignmentId);
  const dates = (
    await ctx.sql.query<{ action: string; recorded_at: Date }>(
      "select action,recorded_at from audit_events where assignment_id=$1 and action in ('review_assignment.invited','review_assignment.accepted') order by recorded_at",
      [assignmentId],
    )
  ).rows;
  expect(dates.map((row) => row.action)).toEqual([
    "review_assignment.invited",
    "review_assignment.accepted",
  ]);
  return {
    control: controls.invitationHistory,
    verifyReply(reply) {
      expect(reply).toMatch(/invit/i);
      expect(reply).toMatch(/accept/i);
      for (const { recorded_at } of dates) {
        const variants = [
          recorded_at.toISOString().slice(0, 10),
          ...["en-US", "en-GB"].flatMap((locale) =>
            ["short", "long"].map((month) =>
              new Intl.DateTimeFormat(locale, {
                day: "numeric",
                month: month === "short" ? "short" : "long",
                timeZone: "UTC",
              }).format(recorded_at),
            ),
          ),
        ];
        expect(variants.some((date) => reply.toLowerCase().includes(date.toLowerCase()))).toBe(
          true,
        );
      }
      expect(reply).not.toMatch(/volunteer rota/i);
    },
    async verifyEffects() {
      expect(await f.draftRows(assignmentId)).toEqual(before);
    },
  };
};
