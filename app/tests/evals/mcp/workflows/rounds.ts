import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { roundListPageSchema, roundOverviewSchema } from "@merit/grantmaking/api";
import { roundBudgetHistory } from "@merit/grantmaking/server";
import { actor } from "@merit/organizations/testing/workspace";
import { encodeRound, newPreparedRound } from "@merit/rounds/domain";
import { insertPreparedRound } from "@merit/rounds/server/demo";

import {
  successfulCalls,
  type Call,
  type ObservedCall,
  type Scenario,
  type ScenarioContext,
} from "../scenario";
import * as client from "./client";
import * as controls from "./grant-controls";
import { addMember, alder, createRound, listRoundRows } from "./round-fixtures";

const setBudget = (call: Call, roundId: string, revision: number, amount: string, reason: string) =>
  call("edit_funding_round", {
    ...alder,
    roundId,
    expectedPreparationRevision: revision,
    change: { section: "budget", amount, reason },
  });

const exactRound = async (ctx: ScenarioContext, title: string) => {
  const matches = (await listRoundRows(ctx)).filter((round) => round.title === title);
  assert(matches.length === 1 && matches[0], `Expected one round named ${title}`);
  return matches[0];
};

const roundActions = async (ctx: ScenarioContext, roundId: string) =>
  (
    await ctx.sql.query<{ action: string; reason: string | null }>(
      "SELECT action, details->>'reason' AS reason FROM audit_events WHERE organization_id = 'alder' AND target_type='round' AND target_id=$1 ORDER BY target_revision",
      [roundId],
    )
  ).rows;

export const newRound = async (ctx: ScenarioContext, assign: boolean): Promise<Scenario> => {
  if (assign) {
    await addMember(ctx, "mina", "Mina Shaw", "program_manager");
  }
  return {
    control: controls.createRound(assign),
    verifyEffects: async () => {
      const round = await exactRound(ctx, "Harbour Access");
      expect(round).toMatchObject({
        manager: assign ? "mina" : "dana",
        budget: assign ? "1200000" : null,
      });
      expect(await listRoundRows(ctx)).toHaveLength(2);
      if (assign) {
        const history = await roundBudgetHistory(ctx.db, actor, { ...alder, roundId: round.id });
        assert(history.status === "ok");
        const funded = history.entries.find(
          ({ after, reason }) =>
            after?.currency === "EUR" &&
            after.minorUnits === "1200000" &&
            reason &&
            /donor/i.test(reason),
        );
        expect(
          funded,
          "Expected a recorded budget reason for the donor contribution",
        ).toBeDefined();
      }
    },
  };
};

export const budgetChange = async (
  ctx: ScenarioContext,
  competingEdit: boolean,
): Promise<Scenario> => {
  const roundId = await createRound(ctx.seed, "Community Arts", "10000");
  if (competingEdit) {
    await addMember(ctx, "mina", "Mina Shaw", "program_manager");
  }

  const isBudgetConflict = (call: ObservedCall) =>
    competingEdit &&
    call.name === "edit_funding_round" &&
    call.arguments?.workspaceSlug === alder.workspaceSlug &&
    call.arguments.roundId === roundId &&
    call.outcome.kind === "error" &&
    call.outcome.content?.status === "conflict";

  let colleagueSaved = false;
  return {
    acceptsError: isBudgetConflict,
    beforeCall: async (name) => {
      if (competingEdit && name === "edit_funding_round" && !colleagueSaved) {
        const updated = await ctx.seed(
          "edit_funding_round",
          {
            ...alder,
            roundId,
            expectedPreparationRevision: 0,
            change: { section: "budget", amount: "11000", reason: "Revised funding agreement" },
          },
          "mina",
        );
        expect(updated.status).toBe("ok");
        colleagueSaved = true;
      }
    },
    control: controls.changeBudget,
    verifyTrace(trace) {
      if (competingEdit) {
        expect(trace.some(isBudgetConflict), "Expected a conflict saving the requested round").toBe(
          true,
        );
      }
    },
    async verifyEffects() {
      expect(await exactRound(ctx, "Community Arts")).toMatchObject({
        id: roundId,
        budget: competingEdit ? "1100000" : "1200000",
        revision: 1,
      });
      const history = await roundActions(ctx, roundId);
      expect(history.map((x) => x.action)).toEqual(["round.created", "round.budget_changed"]);
      expect(history[1]?.reason).toEqual(
        expect.stringMatching(competingEdit ? /Revised funding agreement/ : /donor/i),
      );
    },
  };
};

export const emptyRound = async (ctx: ScenarioContext): Promise<Scenario> => {
  const dryRun = await createRound(ctx.seed, "Dry Run");
  const before = (await listRoundRows(ctx)).filter((r) => r.id !== dryRun);
  return {
    control: controls.deleteRound,
    verifyEffects: async () => {
      expect(await listRoundRows(ctx)).toEqual(before);
      expect(await roundActions(ctx, dryRun)).toContainEqual({
        action: "round.deleted",
        reason: null,
      });
    },
  };
};

export const allRounds = async (ctx: ScenarioContext): Promise<Scenario> => {
  for (let i = 1; i <= 20; i++) {
    await createRound(ctx.seed, `Alder project ${String(i).padStart(2, "0")}`);
  }
  await ctx
    .seed(
      "create_funding_round",
      { workspaceSlug: "birch", requestId: randomUUID(), title: "Birch travel awards" },
      "birch-manager",
    )
    .then((result) => expect(result.status).toBe("ok"));
  const expected = await listRoundRows(ctx);
  return {
    control: async (call) =>
      controls.listTitles(call, "list_funding_rounds", await client.alderWorkspace(call), "rounds"),
    verifyTrace(trace) {
      const rows = successfulCalls(trace, "list_funding_rounds")
        .filter((call) => call.arguments?.workspaceSlug === alder.workspaceSlug)
        .flatMap((call) => roundListPageSchema.shape.rounds.parse(call.outcome.content.rounds));
      expect(new Set(rows.map((r) => r.roundId))).toEqual(new Set(expected.map((r) => r.id)));
    },
    verifyReply(reply) {
      for (const r of expected) {
        expect(reply.toLowerCase()).toContain(r.title.toLowerCase());
      }
      expect(reply).not.toMatch(/Birch travel awards/i);
    },
    async verifyEffects() {
      expect(await listRoundRows(ctx)).toEqual(expected);
    },
  };
};

export const demand = async (ctx: ScenarioContext): Promise<Scenario> => {
  const address = { ...alder, roundId: ctx.roundId };
  expect(
    await ctx.seed("edit_funding_round", {
      ...address,
      change: { section: "details", title: "Community Arts" },
    }),
  ).toMatchObject({ status: "ok" });
  for (let i = 0; i < 23; i++) {
    await ctx.createApplication(
      `Community project ${i + 1}`,
      i < 2 ? null : i === 2 ? "0.00" : "12.50",
    );
  }
  return {
    control: controls.demand,
    verifyTrace(trace) {
      const overview = successfulCalls(trace, "get_funding_round")
        .map((call) => roundOverviewSchema.parse(call.outcome.content.round))
        .find((round) => round.roundId === address.roundId);
      expect(overview?.totals).toMatchObject({
        requested: { minorUnits: "25000", currency: "EUR" },
        unknownRequests: 2,
      });
    },
    verifyReply(reply) {
      expect(reply).toMatch(/\b250\b/);
      expect(reply).toMatch(/\b(?:2|two)\b/i);
    },
  };
};

const originalGuidance = "Describe how residents will benefit within one year.";

export const historicalCriteria = async (ctx: ScenarioContext): Promise<Scenario> => {
  // The prompt relies on the active round. Leave exactly one accessible round.
  expect(
    await ctx.seed("delete_funding_round", {
      ...alder,
      roundId: ctx.roundId,
      expectedPreparationRevision: 0,
    }),
  ).toMatchObject({ deleted: true });
  const criterionId = randomUUID();
  const criteria = [{ id: criterionId, title: "Impact", description: originalGuidance }];
  const initial = newPreparedRound(
    { title: "Community Arts" },
    {
      id: "c0mmarts0001",
      foundation: "Alder Foundation",
      manager: { name: "Dana Reed", email: "dana@example.test" },
      snapshotDate: "2027-02-01",
    },
  );
  const { id: roundId } = await ctx.db.transaction((tx) =>
    insertPreparedRound(tx, {
      organizationId: "alder",
      managerUserId: "dana",
      snapshot: encodeRound({
        ...initial,
        criteria,
        criteriaHistory: [{ version: initial.criteriaVersion, criteria }],
      }),
    }),
  );
  expect(
    await ctx.seed("edit_funding_round", {
      ...alder,
      roundId,
      expectedPreparationRevision: 0,
      change: {
        section: "criteria",
        criteria: [
          {
            id: criterionId,
            title: "Impact",
            description: "Report regional outcomes over three years.",
          },
        ],
      },
    }),
  ).toMatchObject({ status: "ok" });
  return {
    control: controls.originalCriteria,
    verifyTrace(trace) {
      const fragments = successfulCalls(trace, "get_funding_round_content")
        .filter((call) => call.arguments?.roundId === roundId)
        .map((call) => z.string().parse(call.outcome.content.content))
        .join("");
      expect(fragments).toContain(originalGuidance);
    },
    verifyReply(reply) {
      expect(reply.toLowerCase()).toContain(originalGuidance.slice(0, -1).toLowerCase());
    },
  };
};

export const roundChanges = async (ctx: ScenarioContext): Promise<Scenario> => {
  const roundId = await createRound(ctx.seed, "Community Arts", "1000");
  for (let i = 0; i < 21; i++) {
    expect(
      await setBudget(ctx.seed, roundId, i, String(1001 + i), `Donor installment ${i + 1}`),
    ).toMatchObject({ status: "ok" });
  }
  const history = await roundActions(ctx, roundId);
  return {
    control: controls.roundHistory,
    verifyTrace(trace) {
      const revisions = successfulCalls(trace, "list_funding_round_history")
        .filter(
          (call) =>
            call.arguments?.roundId === roundId &&
            call.arguments.workspaceSlug === alder.workspaceSlug,
        )
        .flatMap((call) =>
          z
            .array(z.object({ revision: z.number() }))
            .parse(call.outcome.content.entries)
            .map((entry) => entry.revision),
        );
      expect(new Set(revisions), "Read all preparation history pages").toEqual(
        new Set(history.keys()),
      );
    },
    async verifyEffects() {
      expect(await roundActions(ctx, roundId)).toEqual(history);
    },
  };
};
