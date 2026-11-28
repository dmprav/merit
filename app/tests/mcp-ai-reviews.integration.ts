import { randomUUID } from "node:crypto";

import { assert, expect, vi } from "vite-plus/test";

import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import { actor } from "@merit/organizations/testing/workspace";
import type { AiReviewer, AiReviewerRequest } from "@merit/reviews/domain";

import { createTransport } from "./fixtures/transport-test";

const questionId = "0e03fcf9-a422-5c35-9ac4-27be275d2f3e";

const reply = ({ input }: AiReviewerRequest) => ({
  criteria: [
    {
      criterionId: null,
      claims: [
        {
          text: "Activities run weekly.",
          citations: [{ source: questionId, quote: "Weekly community activities" }],
        },
      ],
      gaps: [],
      strengths: [],
      weaknesses: [],
      concerns: [],
    },
  ],
  questions: [`Who attends ${input.application.title}?`],
  reasoning: "Plain and weekly.",
  position: "Fund with a condition",
  amount: { minorUnits: "8000", currency: "EUR" },
});

const it = roundTest.extend("aiReview", async ({ db, database, rounds }, { onCleanup }) => {
  await database.client.query("INSERT INTO assistant_consents (organization_id) VALUES ('alder')");
  await database.client.query(
    "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('sam','Sam Morgan','sam-account')",
  );
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'sam', 'sam@example.test', 'reviewer')",
  );
  const review = vi.fn(async (request: AiReviewerRequest) => reply(request));
  const reviewer: AiReviewer = { provider: "OpenAI", model: "merit-test", review };
  const captureGrantOutcome = vi.fn();
  const transport = createTransport(
    db,
    undefined,
    undefined,
    { captureGrantOutcome, captureMcpToolFinished: vi.fn() },
    reviewer,
  );
  onCleanup(async () => {
    await transport.close();
  });
  const application = await rounds.createApplication("Community project");
  const address = { workspaceSlug: application.workspaceSlug, applicationId: application.publicId };

  const invoke = async (userId: string, name: string, extra: Record<string, unknown> = {}) =>
    (await transport.callMcp(userId, { ...address, ...extra }, name)).structuredContent as Record<
      string,
      unknown
    >;

  return { ...transport, review, captureGrantOutcome, application, address, invoke, db };
});

it("runs and reads AI reviews through MCP as the delegated manager", async ({ aiReview: a }) => {
  const ran = await a.invoke("dana", "run_ai_review");
  assert(ran.status === "ok");
  expect(ran).toMatchObject({
    applicationId: a.address.applicationId,
    aiReview: {
      provider: "OpenAI",
      model: "merit-test",
      provenance: { interface: "mcp", clientId: "integration-client" },
      runBy: { userId: "dana", name: "Dana Reed" },
      position: "Fund with a condition",
      freshness: "current",
    },
  });
  expect(a.captureGrantOutcome).toHaveBeenCalledExactlyOnceWith({
    event: "ai_review_saved",
    surface: "mcp",
    workspaceKind: "standard",
    workspaceId: "alder",
    applicationId: a.application.publicId,
    prior: "none",
  });

  // The web surface reaches the same operation, with web provenance and its own outcome.
  const web = await a.mcpOperations.reviews.runAiReview(actor, {
    workspaceSlug: a.application.workspaceSlug,
    publicId: a.application.publicId,
    runId: randomUUID(),
  });
  assert(web.status === "ok");
  expect(web.review.provenance).toEqual({ interface: "web" });
  expect(a.captureGrantOutcome).toHaveBeenLastCalledWith(
    expect.objectContaining({
      event: "ai_review_saved",
      surface: "web",
      applicationId: a.application.publicId,
      prior: "current",
    }),
  );

  const read = await a.invoke("dana", "read_ai_reviews");
  assert(read.status === "ok");
  expect(read).toMatchObject({ applicationVersion: 1 });
  expect((read.aiReviews as { id: string }[]).map(({ id }) => id)).toEqual([
    web.review.id,
    (ran.aiReview as { id: string }).id,
  ]);
  const page = await getFundingApplicationPage(a.db, actor, a.application);
  expect(page?.aiReviews.map(({ id }) => id)).toEqual(
    (read.aiReviews as { id: string }[]).map(({ id }) => id),
  );
  expect(page?.application.assessments).toEqual([]);
});

it("refuses a reviewer member both tools without calling the provider", async ({ aiReview: a }) => {
  expect(await a.invoke("sam", "run_ai_review")).toEqual({ status: "not_found" });
  expect(await a.invoke("sam", "read_ai_reviews")).toEqual({ status: "not_found" });
  expect(a.review).not.toHaveBeenCalled();
  expect(a.captureGrantOutcome).not.toHaveBeenCalled();
});

it("reports the availability reason and a failed run the same way as the web", async ({
  aiReview: a,
  database,
}) => {
  a.review.mockRejectedValueOnce(new Error("provider down"));
  expect(await a.invoke("dana", "run_ai_review")).toEqual({ status: "failed" });
  expect((await a.invoke("dana", "read_ai_reviews")).aiReviews).toEqual([]);

  await database.client.query("DELETE FROM assistant_consents");
  expect(await a.invoke("dana", "run_ai_review")).toEqual({
    status: "not_available",
    availability: "consent_required",
  });
  expect(a.captureGrantOutcome).not.toHaveBeenCalled();
});

it("returns the saved review when an MCP run repeats its runId, and saves a new one without it", async ({
  aiReview: a,
}) => {
  const runId = randomUUID();
  const first = await a.invoke("dana", "run_ai_review", { runId });
  assert(first.status === "ok");
  const again = await a.invoke("dana", "run_ai_review", { runId });
  expect(again).toEqual(first);
  expect(a.review).toHaveBeenCalledOnce();
  expect(a.captureGrantOutcome).toHaveBeenCalledOnce();

  const other = await a.invoke("dana", "run_ai_review");
  assert(other.status === "ok");
  expect(other.aiReview).not.toEqual(first.aiReview);
  expect(a.review).toHaveBeenCalledTimes(2);
  expect(((await a.invoke("dana", "read_ai_reviews")).aiReviews as unknown[]).length).toBe(2);
});
