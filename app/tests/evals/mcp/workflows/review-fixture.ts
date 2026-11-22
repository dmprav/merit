import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { actor } from "@merit/organizations/testing/workspace";

import type { Call, ScenarioContext } from "../scenario";

export const matchingText = (pattern: RegExp): unknown => expect.stringMatching(pattern);

export const reasoning = "Shared meals benefit the neighbourhood.";
export const draft = { position: "Fund", amount: "200.50", reasoning, observations: [], note: "" };
export const privateReasoning = "Private draft about volunteer rota capacity.";
export const paper = {
  applicationVersion: null,
  criteriaVersion: null,
  date: "2026-11-09",
  position: "Fund",
  amount: { currency: "EUR", minorUnits: "20050" },
  reasoning,
  observations: [],
};
const summary = z.object({ id: z.uuid(), revision: z.number(), status: z.string() });
const assignmentResult = z.object({ status: z.literal("ok"), assignment: summary });

export const createReviewFixture = async (ctx: ScenarioContext) => {
  const address = await ctx.createApplication("River Gardens");
  const target = { applicationId: address.publicId, workspaceSlug: address.workspaceSlug };

  const application = async () => {
    const page = await getFundingApplicationPage(ctx.db, actor, address);
    assert(page, "Target application is missing");
    return page;
  };

  const reviewArgs = async () => {
    const page = await application();
    return {
      ...target,
      expectedReviewRevision: page.application.reviews.revision,
      expectedApplicationVersion: page.application.version,
      expectedCriteriaVersion: page.round.criteriaVersion,
    };
  };

  const contact = async (userId: string, name: string) => {
    await ctx.sql.query("insert into app_users (id, name, clerk_user_id) values ($1,$2,$1)", [
      userId,
      name,
    ]);
    await ctx.sql.query(
      "insert into memberships (organization_id,user_id,email,role) values ('alder',$1,$2,'reviewer')",
      [userId, userId + "@example.test"],
    );
    const contactId = randomUUID();
    await ctx.seed("create_contact", {
      workspaceSlug: "alder",
      contactId,
      details: { name, email: userId + "@example.test", affiliation: "" },
    });
    return contactId;
  };

  const priya = await contact("priya", "Priya Rao");

  const request = async (contactId = priya) => {
    const id = randomUUID();
    await ctx.seed("request_review", { ...(await reviewArgs()), id, contactId, replacesId: null });
    return id;
  };

  const invite = async (requestId: string) =>
    assignmentResult.parse(
      await ctx.seed("invite_reviewer", {
        ...target,
        commandId: randomUUID(),
        requestId,
        dueDate: null,
      }),
    ).assignment;

  const assignments = async () =>
    (
      await ctx.sql.query<{
        id: string;
        status: string;
        revision: number;
        email: string;
        reviewer_user_id: string | null;
        request_id: string;
        conflict: string;
      }>(
        "select id,status,revision,email,reviewer_user_id,request_id,conflict from review_assignments where case_id=$1 order by email",
        [target.applicationId],
      )
    ).rows;

  const draftRows = async (id: string) =>
    (
      await ctx.sql.query<{
        position: string | null;
        amount: string | null;
        reasoning: string;
        note: string;
        revision: number;
      }>(
        "select position,amount,reasoning,note,revision from reviewer_drafts where assignment_id=$1",
        [id],
      )
    ).rows;

  const reviews = async () => (await application()).application.reviews;

  const messageStatus = async (id: string, kind: string, status: string) => {
    const result = await ctx.sql.query(
      "update reviewer_messages set status=$3 where assignment_id=$1 and kind=$2",
      [id, kind, status],
    );
    expect(result.rowCount).toBe(1);
  };

  const updateMaterial = async () => {
    await ctx.seed("edit_application", {
      ...target,
      expectedIntakeRevision: (await application()).intake.revision,
      change: { action: "save_content", content: { requested: "150.00" } },
    });
  };

  const changeCriteria = async (title: string, revision: number) => {
    await ctx.seed("edit_funding_round", {
      workspaceSlug: "alder",
      roundId: ctx.roundId,
      expectedPreparationRevision: revision,
      change: {
        section: "criteria",
        criteria: [
          { id: "10000000-0000-4000-8000-000000000011", title, description: "Community benefit" },
        ],
      },
    });
  };

  const assignment = async () => {
    const requestId = await request();
    const invited = await invite(requestId);
    const assigned = { assignmentId: invited.id, workspaceSlug: "alder" };

    const read = () => ctx.seed("get_reviewer_assignment", assigned, "priya");

    const respond = async (action: string, note = "") => {
      const { assignment: current } = assignmentResult.parse(await read());
      return asPriya("respond_to_review", {
        ...assigned,
        commandId: randomUUID(),
        expectedRevision: current.revision,
        action,
        note,
      });
    };

    const manage = async (action: string, note = "") => {
      const current = (await assignments()).find((row) => row.id === invited.id);
      assert(current);
      return ctx.seed("manage_reviewer_assignment", {
        ...target,
        ...assigned,
        commandId: randomUUID(),
        expectedRevision: current.revision,
        action,
        note,
      });
    };

    const draftArgs = async () => {
      const current = z.object({ draft: z.object({ revision: z.number() }) }).parse(await read());
      return {
        ...assigned,
        commandId: randomUUID(),
        expectedDraftRevision: current.draft.revision,
      };
    };

    const save = async (content = draft) =>
      asPriya("save_reviewer_draft", { ...(await draftArgs()), draft: content });

    const submit = async () => asPriya("submit_reviewer_assessment", await draftArgs());

    const asPriya: Call = (name, args) => ctx.seed(name, args, "priya");

    return { assigned, requestId, read, respond, manage, save, submit };
  };

  return {
    ctx,
    target,
    priya,
    contact,
    request,
    application,
    reviewArgs,
    assignments,
    reviews,
    assignment,
    draftRows,
    messageStatus,
    updateMaterial,
    changeCriteria,
  };
};

export type ReviewFixture = Awaited<ReturnType<typeof createReviewFixture>>;

export type Assignment = Awaited<ReturnType<ReviewFixture["assignment"]>>;
