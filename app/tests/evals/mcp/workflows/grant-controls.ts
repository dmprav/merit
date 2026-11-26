import { randomUUID } from "node:crypto";

import { assert } from "vite-plus/test";
import { z } from "zod";

import { roundOverviewSchema } from "@merit/grantmaking/api";
import { decodeMoney, formatMoney, moneyDataSchema } from "@merit/money";

import type { Call } from "../scenario";
import {
  checked,
  alderWorkspace,
  pages,
  findRound,
  findApplication,
  readApplication,
  readContent,
  workspaces,
  findReview,
} from "./client";

const money = (data: z.infer<typeof moneyDataSchema>) => formatMoney(decodeMoney(data), "en-IE");

export const openDemo = (withBudget: boolean) => async (call: Call) => {
  const demo = (await workspaces(call)).find((row) => row.kind === "demo");
  assert(demo);
  if (!withBudget) {
    return "[Open your sample workspace](" + demo.url + ")";
  }
  const rows = z
    .array(z.object({ roundId: z.string() }))
    .parse((await checked(call, "list_funding_rounds", { workspaceSlug: demo.slug })).rounds);
  const [round] = rows;
  assert(round);
  const budget = roundOverviewSchema.parse(
    (await checked(call, "get_funding_round", { workspaceSlug: demo.slug, roundId: round.roundId }))
      .round,
  ).totals.remaining;
  assert(budget);
  return "Your sample workspace is open. The example round has " + money(budget) + " left.";
};

export const createRound = (assign: boolean) => async (call: Call) => {
  const workspace = await alderWorkspace(call);
  const result = await checked(call, "create_funding_round", {
    ...workspace,
    requestId: randomUUID(),
    title: "Harbour Access",
    ...(assign && { budget: "12000", budgetReason: "New donor contribution" }),
  });
  if (assign) {
    const members = await pages(call, "list_team_members", workspace, "members");
    const member = z
      .array(
        z.object({
          name: z.string().nullable(),
          userId: z.string(),
          role: z.string(),
          active: z.boolean(),
        }),
      )
      .parse(members)
      .find((row) => row.name === "Mina Shaw" && row.active && row.role === "program_manager");
    assert(member);
    await checked(call, "edit_funding_round", {
      ...workspace,
      roundId: result.roundId,
      change: { section: "manager", userId: member.userId },
    });
  }
  return assign
    ? "Harbour Access is assigned to Mina with a €12,000 budget for the new donor contribution."
    : "Created Harbour Access with an unknown budget.";
};

export const changeBudget = async (call: Call) => {
  const target = await findRound(call, "Community Arts");
  const round = roundOverviewSchema.parse((await checked(call, "get_funding_round", target)).round);
  if (round.budget?.minorUnits !== "1000000") {
    return "The budget changed. I left it unchanged.";
  }
  const result = await call("edit_funding_round", {
    ...target,
    expectedPreparationRevision: round.preparationRevision,
    change: { section: "budget", amount: "12000", reason: "Additional donor contribution" },
  });
  assert(result.status === "conflict" || result.status === "ok");
  return result.status === "conflict"
    ? "The budget changed while saving. I left it unchanged."
    : "I increased the budget to €12,000 for the additional donor contribution.";
};

export const deleteRound = async (call: Call) => {
  const target = await findRound(call, "Dry Run");
  const round = roundOverviewSchema.parse((await checked(call, "get_funding_round", target)).round);
  assert(round.applicationCount === 0);
  await checked(call, "delete_funding_round", {
    ...target,
    expectedPreparationRevision: round.preparationRevision,
  });
  return "Deleted Dry Run.";
};

export const demand = async (call: Call) => {
  const target = await findRound(call, "Community Arts");
  const round = roundOverviewSchema.parse((await checked(call, "get_funding_round", target)).round);
  return `Applicants requested ${money(round.totals.requested)} in total. ${round.totals.unknownRequests} applications left the amount blank.`;
};

export const originalCriteria = async (call: Call) => {
  const workspace = await alderWorkspace(call);
  const rounds = z
    .array(z.object({ roundId: z.string() }))
    .length(1)
    .parse(await pages(call, "list_funding_rounds", workspace, "rounds"));
  const [round] = rounds;
  assert(round);
  const result = await checked(call, "get_funding_round_content", {
    ...workspace,
    roundId: round.roundId,
    section: "criteria",
    criteriaVersion: 1,
  });
  const criteria = z
    .array(z.object({ title: z.string(), description: z.string() }))
    .parse(JSON.parse(z.string().parse(result.content)));
  const criterion = criteria.find((row) => row.title === "Impact");
  assert(criterion);
  return criterion.description;
};

export const listTitles = async (
  call: Call,
  name: string,
  input: Record<string, unknown>,
  field: string,
) =>
  z
    .array(z.object({ title: z.string() }))
    .parse(await pages(call, name, input, field))
    .map((row) => row.title)
    .join("\n");

export const roundHistory = async (call: Call) => {
  const target = await findRound(call, "Community Arts");
  return z
    .array(
      z.object({ revision: z.number(), action: z.string(), budgetChange: z.unknown().optional() }),
    )
    .parse(await pages(call, "list_funding_round_history", target, "entries"))
    .map(
      (entry) =>
        `Revision ${entry.revision}: ${entry.action}${entry.budgetChange ? " " + JSON.stringify(entry.budgetChange) : ""}`,
    )
    .join("\n");
};

export const material = async (call: Call) => {
  const target = await findApplication(call, "Lanterns");
  const app = await readApplication(call, target);
  return `Lanterns is ${app.intakeStatus} for review on version ${app.applicationVersion}. Working draft: ${app.hasWorkingRevision}.`;
};

export const quoteEvidence = async (call: Call) => {
  const target = await findApplication(call, "Lanterns");
  const { applicationVersion } = await readApplication(call, target);
  for (let version = 1; version <= applicationVersion; version++) {
    const snapshot = z
      .object({
        source: z.object({ kind: z.string() }),
        content: z.object({
          submission: z.object({ answers: z.array(z.object({ response: z.string() })) }).nullish(),
        }),
      })
      .parse(
        JSON.parse(
          await readContent(call, { ...target, section: "material", materialVersion: version }),
        ),
      );
    for (const { response } of snapshot.content.submission?.answers ?? []) {
      const sentence = response.match(/[^.!?]*workshops[^.!?]*[.!?]/i)?.[0]?.trim();
      if (sentence) {
        return `Version ${version}, ${snapshot.source.kind}: “${sentence}”`;
      }
    }
  }
  return "I found no recorded workshop commitment.";
};

export const recommendation = (fromReview: boolean) => async (call: Call) => {
  const target = await findApplication(call, "Lanterns");
  const app = await readApplication(call, target);
  let allocation = { currency: "EUR", minorUnits: "245025" };
  let reasoning = "The venue is secured.";
  let expectedCurrentAssessment;
  if (fromReview) {
    const review = await findReview(call, target, "assessment", "Jo Bell");
    assert(review.freshness === "current" && typeof review.assessmentVersion === "number");
    const record = z
      .object({
        versions: z.array(
          z.object({ content: z.object({ amount: moneyDataSchema, reasoning: z.string() }) }),
        ),
      })
      .parse(
        JSON.parse(
          await readContent(call, { ...target, section: "assessment", entryId: review.id }),
        ),
      );
    const version = record.versions[review.assessmentVersion - 1];
    assert(version);
    allocation = version.content.amount;
    reasoning = review.reviewer + " found: " + version.content.reasoning;
    expectedCurrentAssessment = { id: review.id, version: review.assessmentVersion };
  }
  const result = await checked(call, "save_recommendation", {
    ...target,
    expectedRecommendationRevision: app.recommendationRevision,
    expectedApplicationVersion: app.applicationVersion,
    ...(expectedCurrentAssessment && { expectedCurrentAssessment }),
    recommendation: { position: "Fund", allocation, reasoning },
  });
  const { recorded } = z
    .object({ recorded: z.object({ date: z.iso.date() }) })
    .parse(result.recommendation);
  return `Recorded the funding recommendation on ${recorded.date}. ${reasoning}`;
};

export const recordDecision = async (call: Call) => {
  const target = await findApplication(call, "Lanterns");
  const app = await readApplication(call, target);
  await checked(call, "record_committee_decision", {
    ...target,
    outcome: "Fund",
    amount: { currency: "EUR", minorUnits: "245025" },
    reason: "The venue is secured.",
    decidedBy: "Funding committee",
    decisionDate: "2026-01-15",
    expectedDecisionRevision: app.decisionRevision,
  });
  return "Recorded the Funding committee's decision to fund Lanterns for €2,450.25, decided on 15 January 2026.";
};

export const committeeBrief = async (call: Call) => {
  const target = await findApplication(call, "Lanterns");
  const app = await readApplication(call, target);
  const review = await findReview(call, target, "assessment", "Jo Bell");
  const record = z
    .object({ versions: z.array(z.object({ content: z.object({ amount: moneyDataSchema }) })) })
    .parse(
      JSON.parse(await readContent(call, { ...target, section: "assessment", entryId: review.id })),
    );
  const latest = record.versions.at(-1);
  assert(app.requested && latest);
  return `The applicant requested ${money(app.requested)}. ${review.reviewer} proposed ${money(latest.content.amount)} in her assessment. No committee decision is recorded for it yet.`;
};
