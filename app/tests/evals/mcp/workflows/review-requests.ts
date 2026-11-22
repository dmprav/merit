import { expect } from "vite-plus/test";

import type { Scenario } from "../scenario";
import * as controls from "./review-controls";
import type { ReviewFixture } from "./review-fixture";

export const reviewRequest = async (
  f: ReviewFixture,
  action: "track" | "clarify" | "draft" | "invite" | "arrange",
  heldOut = false,
): Promise<Scenario> => {
  const drafting = action === "draft";
  const unassigned = action === "clarify";
  const send = action === "invite" || action === "arrange";
  const existing = drafting || action === "invite" ? await f.request() : undefined;
  const before = (await f.application()).application;
  return {
    allowDiscovery: !drafting,
    control: drafting
      ? controls.draftCopy
      : unassigned
        ? async () => "Who should review River Gardens?"
        : action === "invite"
          ? controls.sendExisting
          : controls.track(send),
    calibrationControl: drafting && !heldOut ? controls.sendExisting : undefined,
    async verifyEffects() {
      const current = (await f.application()).application;
      expect(current.summary, "Application summary changed").toBe(before.summary);
      expect(current.reviews.assessments).toEqual(before.reviews.assessments);
      if (existing || unassigned) {
        expect(current.reviews.requests).toEqual(before.reviews.requests);
      } else {
        expect(
          current.reviews.requests,
          "Expected exactly one outstanding request for Priya",
        ).toMatchObject([{ contactId: f.priya, status: "outstanding" }]);
      }
      if (send) {
        const saved = await f.ctx.seed("list_application_reviewers", f.target);
        expect(saved.assignments, "Expected Priya's invitation to be sent").toMatchObject([
          {
            requestId: current.reviews.requests[0]?.id,
            email: "priya@example.test",
            dueDate: null,
            status: "invited",
            delivery: "sent",
          },
        ]);
        expect(f.ctx.recipients).toEqual(["priya@example.test"]);
      } else {
        expect(await f.assignments(), "Unexpected reviewer assignments").toEqual([]);
        expect(f.ctx.recipients).toEqual([]);
      }
    },
    verifyReply:
      drafting && heldOut
        ? (reply) => {
            const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
            expect(
              [...sentences.segment(reply.trim().replace(/\s+/g, " "))],
              "Expected two sentences of invitation copy",
            ).toHaveLength(2);
            expect(reply).toMatch(/River Gardens/i);
            const wording = reply.replaceAll("’", "'");
            const activeSend =
              /\b(?:i|we)(?:'ve| have)? (?:already |just )?(?:sent|emailed) (?:you )?(?:(?:an?|the|your|formal|review|separate) )*(?:invitation|invite|link|details)\b/i;
            const passiveSend =
              /\b(?:invitation|invite|link|details) (?:was|were|has|have) (?:already |just )?(?:been )?(?:sent|emailed)\b/i;
            expect(wording, "Draft claims an invitation was already sent").not.toMatch(activeSend);
            expect(wording, "Draft claims an invitation was already sent").not.toMatch(passiveSend);
          }
        : undefined,
  };
};
