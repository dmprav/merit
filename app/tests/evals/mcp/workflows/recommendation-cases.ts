import { expect } from "vite-plus/test";

import { type Scenario, type ScenarioContext, successfulCalls } from "../scenario";
import { content, lanterns, seedContact, workspace } from "./application-fixture";
import { checked } from "./client";
import * as controls from "./grant-controls";
import { numberAmounts } from "./reply-amounts";

const recommendationsFor = async (ctx: ScenarioContext, applicationId: string) =>
  (
    await ctx.sql.query<Record<string, unknown>>(
      "SELECT revision,material_version,recorded_date::text,position,allocation_minor_units::text AS cents,allocation_currency,reasoning FROM recommendation_versions WHERE case_id=$1 ORDER BY revision",
      [applicationId],
    )
  ).rows;

const decisionsFor = async (ctx: ScenarioContext, applicationId: string) =>
  (
    await ctx.sql.query<Record<string, unknown>>(
      "SELECT revision,outcome,amount_minor_units::text AS cents,amount_currency,decided_by,decision_date::text,reason,change_explanation FROM committee_decision_versions WHERE case_id=$1 ORDER BY revision",
      [applicationId],
    )
  ).rows;

/** An affirmative statement within one sentence that a decision was recorded. */
const recordedDecision =
  /\b(?:recorded|saved|logged|entered|made)\b[^.\n]{0,60}\bdecision\b|\bdecision\b[^.\n]{0,40}\b(?:recorded|saved|logged|entered)\b/i;
const deniedDecision = /\b(?:not|never|isn't|n't)\b[^.\n]{0,30}\bdecision\b/i;

export const recordDecision = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx, "3500");
  await app.write("mark_application_ready");
  // Funding commits against the round budget, which the fixture sets far below the award.
  const { rows } = await ctx.sql.query<{ revision: number }>(
    "SELECT revision FROM funding_rounds WHERE id=$1",
    [ctx.roundId],
  );
  await checked(ctx.seed, "edit_funding_round", {
    ...workspace,
    roundId: ctx.roundId,
    expectedPreparationRevision: rows[0]?.revision,
    change: { section: "budget", amount: "10000.00", reason: "Room for the decision." },
  });
  return {
    control: controls.recordDecision,
    verifyReply(reply) {
      expect(numberAmounts(reply), "State the recorded amount").toContain("245025");
      expect(reply, "Call it a decision, not a recommendation").toMatch(recordedDecision);
      expect(reply, "Call it a decision, not a recommendation").not.toMatch(deniedDecision);
    },
    async verifyEffects() {
      expect(await decisionsFor(ctx, app.address.applicationId)).toMatchObject([
        {
          revision: 1,
          outcome: "Fund",
          cents: "245025",
          amount_currency: "EUR",
          decision_date: "2026-01-15",
          change_explanation: null,
        },
      ]);
      const [saved] = await decisionsFor(ctx, app.address.applicationId);
      expect(saved?.decided_by).toEqual(expect.stringMatching(/funding committee/i));
      expect(saved?.reason).toEqual(expect.stringMatching(/venue/i));
      // A decision is not a recommendation.
      expect(await recommendationsFor(ctx, app.address.applicationId)).toEqual([]);
    },
  };
};

export const committeeBrief = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx, "50000");
  await app.write("mark_application_ready");
  await app.assessment(await seedContact(ctx), "3000000", "Supports local families");
  return {
    control: controls.committeeBrief,
    manualReplyCriterion:
      "Check the distinction between the applicant request, reviewer proposal, and final decision.",
    verifyReply(reply) {
      const amounts = reply.replace(/[, .\u00a0\u202f]/g, "");
      expect(amounts).toMatch(/50000|50k/i);
      expect(amounts).toMatch(/30000|30k/i);
      expect(reply).toMatch(/review|Jo|assess/i);
    },
    async verifyEffects() {
      expect(await recommendationsFor(ctx, app.address.applicationId)).toEqual([]);
    },
  };
};

export const saveProposal = async (ctx: ScenarioContext, evidence: boolean): Promise<Scenario> => {
  const app = await lanterns(ctx, "3500");
  let currentId: string | undefined;
  if (evidence) {
    const jo = await seedContact(ctx);
    const previous = await app.assessment(jo, "125000", "Original venue was too small.");
    await app.write("edit_application", {
      change: { action: "save_content", content: content("4000") },
    });
    currentId = await app.assessment(
      jo,
      "287523",
      "Free workshops reach isolated residents in the neighborhood.",
      previous,
    );
  }
  await app.write("mark_application_ready");

  const cents = evidence ? "287523" : "245025";
  const before = await app.read();
  return {
    control: controls.recommendation(evidence),
    verifyTrace: evidence
      ? (trace) => {
          const writes = successfulCalls(trace, "save_recommendation").filter(
            (call) => call.arguments?.applicationId === app.address.applicationId,
          );
          expect(writes.length).toBeGreaterThan(0);
          for (const write of writes) {
            expect(write.arguments?.expectedCurrentAssessment).toEqual({
              id: currentId,
              version: 1,
            });
          }
        }
      : undefined,
    manualReplyCriterion: evidence
      ? "Check that the reply attributes the finding to Jo and distinguishes the assessment date from the recording date."
      : undefined,
    async verifyEffects() {
      const saved = await recommendationsFor(ctx, app.address.applicationId);
      expect(saved).toMatchObject([
        {
          revision: 1,
          material_version: before.application.version,
          position: "Fund",
          cents,
          allocation_currency: "EUR",
        },
      ]);
      expect(saved[0]?.reasoning).toEqual(
        expect.stringMatching(evidence ? /isolated|isolation|reach.*resident/i : /venue/i),
      );
      expect((await app.read()).application.reviews).toEqual(before.application.reviews);
    },
    verifyReply: evidence
      ? async (reply) => {
          const date = (await recommendationsFor(ctx, app.address.applicationId))[0]?.recorded_date;
          expect(date, "No recommendation recording date to confirm").toBeTypeOf("string");
          if (typeof date !== "string") {
            return;
          }
          const dateFormats = [
            date,
            ...["en-GB", "en-US"].flatMap((locale) =>
              (["long", "medium"] as const).map((dateStyle) =>
                new Intl.DateTimeFormat(locale, { dateStyle, timeZone: "UTC" }).format(
                  new Date(date),
                ),
              ),
            ),
          ];
          expect(
            dateFormats.some((value) => reply.toLowerCase().includes(value.toLowerCase())),
            "Report the saved recommendation’s recording date",
          ).toBe(true);
        }
      : undefined,
  };
};
