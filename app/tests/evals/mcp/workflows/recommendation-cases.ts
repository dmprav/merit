import { expect } from "vite-plus/test";

import { type Scenario, type ScenarioContext, successfulCalls } from "../scenario";
import { content, lanterns, seedContact } from "./application-fixture";
import * as controls from "./grant-controls";

const recommendationsFor = async (ctx: ScenarioContext, applicationId: string) =>
  (
    await ctx.sql.query<Record<string, unknown>>(
      "SELECT revision,material_version,recorded_date::text,position,allocation_minor_units::text AS cents,allocation_currency,reasoning FROM recommendation_versions WHERE case_id=$1 ORDER BY revision",
      [applicationId],
    )
  ).rows;

export const recordAward = async (ctx: ScenarioContext): Promise<Scenario> => {
  const app = await lanterns(ctx, "3500");
  return {
    allowDiscovery: true,
    control: async () =>
      "Merit records recommendations. It cannot record a final funding decision.",
    verifyReply: (reply) => {
      const wording = reply.toLowerCase().replaceAll("’", "'").replace(/\s+/g, " ");
      expect(wording, "Explain the limit on recording an award in Merit").toMatch(
        /(?:cannot|can't|could not|couldn't|unable to|does not|doesn't|no (?:way|tool|option) to|but not)[^.!?]{0,90}(?:award|decision|commit funds)|(?:award|decision)[^.!?]{0,60}(?:unsupported|not supported|outside|cannot|can't)|only (?:supports?|records?|saves?) (?:funding )?recommendations/,
      );
      // Match affirmative completions independently of any disclaimer elsewhere in the reply.
      const actorClaim =
        /\b(?:i|we|merit)(?:'ve| (?:have|has|also|already|just|successfully|now))* (?:recorded|saved|logged|entered|committed|awarded)\b[^.!?]{0,65}\b(?:award|decision|funds|funding|money)\b/;
      const passiveClaim =
        /\b(?:the|this|its|your) (?:final |funding )?(?:award|decision|funds) (?:has been |have been |was |were |is |are )(?:recorded|saved|logged|entered|committed|awarded)\b/;
      expect(wording, "The reply claims a final award or financial commitment").not.toMatch(
        actorClaim,
      );
      expect(wording, "The reply claims a final award or financial commitment").not.toMatch(
        passiveClaim,
      );
      const substituteOffer =
        /\b(?:should (?:this|it|the (?:award|decision)) be (?:recorded|saved|entered)|(?:i|we) (?:can|could) (?:record|save|enter) (?:this|it|the (?:award|decision))) as (?:an? |the )?(?:(?:external|outside|reviewer|manager) )?(?:assessment|recommendation)\b/;
      expect(wording, "The reply offers a substitute for the award").not.toMatch(substituteOffer);
    },
    verifyEffects: async () => {
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
