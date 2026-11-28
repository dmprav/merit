import { expect } from "vite-plus/test";
import { z } from "zod";

import type { Scenario } from "../scenario";
import { checked, findApplication } from "./client";
import type { ReviewFixture } from "./review-fixture";

const application = "River Gardens";

const savedReviews = z.array(
  z.object({ id: z.string(), freshness: z.string(), position: z.string() }),
);

const consent = async (f: ReviewFixture) => {
  await f.ctx.sql.query("insert into assistant_consents (organization_id) values ('alder')");
};

/** The saved AI reviews and the application each belongs to. */
const rows = async (f: ReviewFixture) =>
  (
    await f.ctx.sql.query<{ case_id: string; position: string }>(
      "select case_id, position from ai_reviews order by recorded_at",
    )
  ).rows;

export const runAiReview = async (f: ReviewFixture): Promise<Scenario> => {
  await consent(f);
  return {
    async control(call) {
      const target = await findApplication(call, application);
      const saved = await checked(call, "run_ai_review", target);
      const review = z.object({ position: z.string() }).parse(saved.aiReview);
      return `Merit AI's review of River Gardens proposes: ${review.position}. This is an AI review, not an assessment by a reviewer.`;
    },
    async verifyEffects() {
      // The review is of the fixture's own application, not merely the only one saved.
      expect(await rows(f)).toEqual([
        { case_id: f.target.applicationId, position: "Fund with a condition" },
      ]);
      // An AI review is not an assessment and changes no review state.
      expect((await f.reviews()).assessments).toEqual([]);
    },
  };
};

export const readAiReviews = async (f: ReviewFixture): Promise<Scenario> => {
  await consent(f);
  await f.ctx.seed("run_ai_review", f.target);
  const before = await rows(f);
  return {
    async control(call) {
      const target = await findApplication(call, application);
      const read = await checked(call, "read_ai_reviews", target);
      const [latest] = savedReviews.parse(read.aiReviews);
      return `Merit AI's latest review of River Gardens proposes ${latest?.position} and is ${latest?.freshness}.`;
    },
    verifyReply(reply) {
      expect(reply).toMatch(/condition/i);
      expect(reply).toMatch(/current/i);
    },
    async verifyEffects() {
      expect(await rows(f)).toEqual(before);
    },
  };
};
