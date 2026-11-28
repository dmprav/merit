import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import {
  getFundingApplicationPage,
  listApplicationReviewSummaries,
  listWorkspaceActivity,
} from "@merit/grantmaking/server";
import { createGrantmakingService } from "@merit/grantmaking/server";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { saveApplicationReview } from "@merit/reviews/server";
import { aiReviewTest as it, questionId, stub, validReply } from "@merit/reviews/testing/ai-review";

// Database guarantees of AI review commands are tested with Reviews.
// These cases read the saved runs through the application page.

it("shows saved runs on the application page and in workspace activity", async ({
  db,
  aiReviewSetup,
}) => {
  const { address, run } = await aiReviewSetup();
  const first = await run(stub().reviewer);
  assert(first.status === "ok");

  const entries = await listWorkspaceActivity(db, actor, { workspaceSlug });
  assert(entries.status === "ok");
  expect(entries.entries[0]).toMatchObject({
    action: "ai_review.recorded",
    actor: "Dana Reed",
    subject: { type: "ai_review", id: first.review.id, name: "Workshop Saturdays" },
    record: { kind: "application", id: address.publicId, title: "Workshop Saturdays" },
  });

  const mcp = { userId: "dana", provenance: { interface: "mcp", clientId: "client-1" } } as const;
  const second = await run(stub().reviewer, { as: mcp });
  assert(second.status === "ok");

  const current = await getFundingApplicationPage(db, actor, address);
  expect(current?.aiReviews.map(({ id }) => id)).toEqual([second.review.id, first.review.id]);
});

it("shows a run saved against an earlier version as outdated on the page", async ({
  db,
  aiReviewSetup,
}) => {
  const { address, run, edit, applicationState } = await aiReviewSetup();

  const page = () => getFundingApplicationPage(db, actor, address);

  assert((await edit({ action: "mark_ready" })).status === "ok");
  const revised = await run(
    stub(async (request) => {
      assert((await edit({ action: "start_revision", kind: "correction" })).status === "ok");
      assert(
        (
          await edit({
            action: "save_revision",
            draft: {
              kind: "correction",
              reason: "Fix the title",
              content: { title: "Workshop Sundays" },
            },
          })
        ).status === "ok",
      );
      assert((await edit({ action: "publish_revision" })).status === "ok");
      return validReply(request);
    }).reviewer,
  );
  assert(revised.status === "ok");
  expect((await applicationState()).version).toBe(2);
  expect((await page())?.application.version).toBe(2);
  expect((await page())?.aiReviews[0]).toMatchObject({
    id: revised.review.id,
    freshness: "outdated",
  });
});

it("gives a reviewer member no application page for AI reviews", async ({ db, aiReviewSetup }) => {
  const { address, run } = await aiReviewSetup();
  assert((await run(stub().reviewer)).status === "ok");
  expect(await getFundingApplicationPage(db, { userId: "rita" }, address)).toBeNull();
});

it("labels each citation with the question as worded in the version the review read", async ({
  db,
  aiReviewSetup,
}) => {
  const { run, edit, address } = await aiReviewSetup();

  const page = () => getFundingApplicationPage(db, actor, address);

  assert((await edit({ action: "mark_ready" })).status === "ok");
  const saved = await run(stub().reviewer);
  assert(saved.status === "ok");
  expect(saved.review.criteria[0]?.claims[0]?.citations[0]).toMatchObject({ label: "Plan" });

  assert((await edit({ action: "start_revision", kind: "correction" })).status === "ok");
  assert(
    (
      await edit({
        action: "save_revision",
        draft: {
          kind: "correction",
          reason: "Reword the question",
          content: {
            answers: [
              {
                questionId,
                question: "Project plan, reworded",
                response: "Repair workshops with a free venue.",
              },
            ],
          },
        },
      })
    ).status === "ok",
  );
  assert((await edit({ action: "publish_revision" })).status === "ok");

  const after = (await page())?.aiReviews[0];
  expect(after).toMatchObject({ freshness: "outdated" });
  // The label is the wording the review read, not the current wording.
  expect(after?.criteria[0]?.claims[0]?.citations[0]).toMatchObject({
    source: questionId,
    label: "Plan",
  });
});

it("never counts an AI review as an assessment, a review summary or an allocation", async ({
  db,
  aiReviewSetup,
}) => {
  const { address, run } = await aiReviewSetup();

  const page = () => getFundingApplicationPage(db, actor, address);

  const before = await page();
  assert(before);
  expect((await run(stub().reviewer)).status).toBe("ok");
  const after = await page();
  assert(after);
  expect(after.application.assessments).toEqual([]);
  expect(after.application.reviews).toEqual(before.application.reviews);
  expect(after.application.managerRecommendation).toBeNull();
  expect(after.round.totals).toEqual(before.round.totals);
  expect(
    await listApplicationReviewSummaries(db, actor, {
      workspaceSlug,
      applicationId: address.publicId,
      limit: 50,
    }),
  ).toMatchObject({
    status: "ok",
    reviews: [],
  });
  // The review state only moves for assessments and requests.
  const state = await saveApplicationReview(db, actor, {
    ...address,
    expectedRevision: after.application.reviews.revision,
    expectedApplicationVersion: after.application.version,
    expectedCriteriaVersion: after.round.criteriaVersion,
    change: { action: "cancel", id: randomUUID() },
  });
  expect(state.status).not.toBe("ok");
});

it("presents availability and provider with the application page, keeping saved reviews readable", async ({
  db,
  aiReviewSetup,
  database,
}) => {
  const { address, run, edit } = await aiReviewSetup();
  const provider = { provider: "Test provider", model: "test-model" };

  const read = () =>
    createGrantmakingService({
      database: (operation) => operation(db),
      aiReviewProvider: provider,
    }).readApplicationPage(actor, address);

  expect(await read()).toMatchObject({
    aiReviews: [],
    aiReviewAvailability: "available",
    aiReviewProvider: provider,
  });
  const saved = await run(stub().reviewer);
  assert(saved.status === "ok");

  await database.client.query("DELETE FROM assistant_consents");
  expect(await read()).toMatchObject({
    aiReviewAvailability: "consent_required",
    aiReviews: [{ id: saved.review.id }],
  });
  expect(await getFundingApplicationPage(db, actor, address)).toMatchObject({
    aiReviewAvailability: "provider_unconfigured",
    aiReviewProvider: null,
  });

  await database.client.query("INSERT INTO assistant_consents (organization_id) VALUES ('alder')");
  assert(
    (
      await edit({
        action: "withdraw",
        withdrawnOn: new Date().toISOString().slice(0, 10),
        reason: "Withdrawn",
      })
    ).status === "ok",
  );
  expect(await read()).toMatchObject({ aiReviewAvailability: "withdrawn" });
  await database.client.query(
    "UPDATE organizations SET kind = 'demo', demo_expires_at = now() + interval '1 day', demo_seed_version = 1",
  );
  expect(await read()).toMatchObject({
    aiReviewAvailability: "demo",
    aiReviews: [{ id: saved.review.id }],
  });
});
