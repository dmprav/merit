import { randomUUID } from "node:crypto";

import { expect } from "vite-plus/test";

import type { Scenario } from "../scenario";
import * as controls from "./review-controls";
import { matchingText, paper, type ReviewFixture } from "./review-fixture";

export const cancelRequest = async (f: ReviewFixture): Promise<Scenario> => {
  const requestId = await f.request();
  const { ctx, priya, reviews } = f;
  return {
    control: controls.cancel,
    async verifyEffects() {
      expect((await reviews()).requests).toMatchObject([
        { id: requestId, contactId: priya, status: "cancelled", closedBy: { userId: "dana" } },
      ]);
      expect(await f.assignments()).toEqual([]);
      expect(ctx.recipients).toEqual([]);
    },
  };
};

export const reviewOverview = async (f: ReviewFixture): Promise<Scenario> => {
  await f.request();
  const { ctx, reviews, reviewArgs } = f;
  const jo = await f.contact("jo", "Jo Chen");
  await ctx.seed("record_assessment", {
    ...(await reviewArgs()),
    id: randomUUID(),
    contactId: jo,
    requestId: null,
    previousId: null,
    content: { ...paper, applicationVersion: 1, criteriaVersion: 1 },
  });
  await f.updateMaterial();
  const before = await reviews();
  return {
    control: controls.overview,
    verifyReply(reply) {
      expect(reply).toMatch(/Priya/i);
      expect(reply).toMatch(/Jo\b/i);
      expect(reply).toMatch(/old|prior|previous|supersed|outdat|earlier|stale|version 1/i);
    },
    async verifyEffects() {
      expect(await reviews()).toEqual(before);
    },
  };
};

export const recordPaperReview = async (f: ReviewFixture): Promise<Scenario> => {
  const requestId = await f.request();
  const { priya, reviews } = f;
  return {
    control: controls.recordPaper,
    async verifyEffects() {
      const state = await reviews();
      expect(state.requests).toMatchObject([{ id: requestId, status: "received" }]);
      expect(state.assessments).toMatchObject([
        {
          requestId,
          contactId: priya,
          versions: [
            {
              content: { ...paper, reasoning: matchingText(/meal/i) },
              recorder: { userId: "dana" },
            },
          ],
        },
      ]);
    },
  };
};

export const correctPaperReview = async (f: ReviewFixture): Promise<Scenario> => {
  const requestId = await f.request();
  const { ctx, priya, reviews, reviewArgs } = f;
  const assessmentId = randomUUID();

  const recordArgs = async () => ({
    ...(await reviewArgs()),
    id: assessmentId,
    contactId: priya,
    requestId,
    previousId: null,
    content: paper,
  });

  await ctx.seed("record_assessment", await recordArgs());
  const [original] = (await reviews()).assessments;
  return {
    control: controls.correctPaper,
    async verifyEffects() {
      expect((await reviews()).assessments).toMatchObject([
        {
          id: assessmentId,
          contactId: priya,
          requestId,
          versions: [
            original?.versions[0],
            {
              content: { ...paper, amount: { currency: "EUR", minorUnits: "21050" } },
              note: matchingText(/transcri|mistyp|typo|clerical|misrecord/i),
            },
          ],
        },
      ]);
    },
  };
};
