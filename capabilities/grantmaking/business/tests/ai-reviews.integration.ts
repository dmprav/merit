import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import { assert, expect, vi } from "vite-plus/test";

import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { withDatabase } from "@merit/db";
import {
  getFundingApplicationPage,
  listApplicationReviewSummaries,
  listWorkspaceActivity,
} from "@merit/grantmaking/server";
import { createGrantmakingService } from "@merit/grantmaking/server";
import { actor, workspaceTest, workspaceSlug } from "@merit/organizations/testing/workspace";
import type { AiReviewer, AiReviewerRequest } from "@merit/reviews/domain";
import {
  readApplicationAiReviews,
  runAiReview,
  saveApplicationReview,
} from "@merit/reviews/server";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "./application-work";
import { recordedEvents } from "./audit-events";

const questionId = "9841b190-2a06-5fe1-a7af-5e5b534662c5";
const criteria = [
  {
    id: "6ab5c8b6-9ad8-5941-b120-30092274597f",
    title: "Community benefit",
    description: "Who gains",
  },
  { id: "dc1f55ac-e713-51a8-8d91-f27f1c3d9959", title: "Feasibility", description: "" },
];

const it = workspaceTest.extend("runtimeUrl", { scope: "file" }, async ({ database }) =>
  database.createRuntimeConnection(),
);

/** A reply that verifies against whatever the model was sent. */
const validReply = ({ input }: AiReviewerRequest) => ({
  criteria: (input.criteria.length > 0 ? input.criteria.map(({ id }) => id) : [null]).map(
    (criterionId) => ({
      criterionId,
      claims: [
        {
          text: "The workshops use a free venue.",
          citations: [{ source: questionId, quote: "Repair workshops with a free venue" }],
        },
      ],
      gaps: ["No participant numbers."],
      strengths: [],
      weaknesses: [],
      concerns: [],
    }),
  ),
  questions: ["How many people will attend?"],
  reasoning: "A practical plan that needs participant numbers.",
  position: "Fund",
  amount: { minorUnits: "1800000", currency: "EUR" },
});

const stub = (review: (request: AiReviewerRequest) => unknown = validReply) => {
  const calls: AiReviewerRequest[] = [];
  const reviewer: AiReviewer = {
    provider: "Test provider",
    model: "test-model",
    review: vi.fn(async (request: AiReviewerRequest) => {
      calls.push(request);
      return review(request);
    }),
  };
  return { reviewer, calls };
};

const setup = async (
  db: NodePgDatabase,
  database: { client: Client },
  runtimeUrl: string,
  { withCriteria = true }: { withCriteria?: boolean } = {},
) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "AI review round",
  });
  assert(round.status === "ok");
  if (withCriteria) {
    const edited = await editFundingRound(db, actor, {
      workspaceSlug,
      publicId: round.publicId,
      expectedRevision: 0,
      change: { section: "criteria", criteria },
    });
    assert(edited.status === "ok");
  }
  const application = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Workshop Saturdays",
    applicant: "Repair Collective",
    requested: "18000",
    answers: [{ questionId, question: "Plan", response: "Repair workshops with a free venue." }],
  });
  assert(application.status === "ok");
  await database.client.query("INSERT INTO assistant_consents (organization_id) VALUES ('alder')");
  await database.client.query(
    "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('rita','Rita Reviewer','seed_rita')",
  );
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'rita', 'rita@example.test', 'reviewer')",
  );

  const address = { workspaceSlug, publicId: application.publicId };

  const runtime = <T>(operation: (db: NodePgDatabase) => Promise<T>) =>
    withDatabase(runtimeUrl, operation);

  const run = (
    reviewer: AiReviewer | undefined,
    options: {
      as?: Parameters<typeof runAiReview>[1];
      onSaved?: () => void;
      runId?: string;
      publicId?: string;
    } = {},
  ) =>
    runtime((rdb) =>
      runAiReview(
        rdb,
        options.as ?? actor,
        {
          ...address,
          publicId: options.publicId ?? address.publicId,
          runId: options.runId ?? randomUUID(),
        },
        { reviewer, onSaved: options.onSaved },
      ),
    );

  const page = () => getFundingApplicationPage(db, actor, address);

  const rows = async () =>
    Number(
      (await database.client.query<{ count: string }>("SELECT count(*) FROM ai_reviews")).rows[0]
        ?.count,
    );

  const edit = async (change: Parameters<typeof editFundingApplication>[2]["change"]) => {
    const current = await page();
    assert(current);
    return editFundingApplication(
      db,
      actor,
      { ...address, expectedRevision: current.intake.revision, change },
      applicationWork,
    );
  };

  return { round, address, runtime, run, page, rows, edit };
};

it("saves a verified run with its basis, provenance, audit event and analytics outcome", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { address, run, page, rows, edit } = await setup(db, database, runtimeUrl);
  // Private notes exist, and none of them may reach the provider.
  expect(await edit({ action: "details", summary: "PRIVATE-MANAGER-NOTE" })).toMatchObject({
    status: "ok",
  });
  const { reviewer, calls } = stub();
  const onSaved = vi.fn();

  const result = await run(reviewer, { onSaved });
  assert(result.status === "ok");

  expect(calls).toHaveLength(1);
  expect(calls[0]?.input).toEqual({
    application: {
      title: "Workshop Saturdays",
      applicant: "Repair Collective",
      requested: "18000.00 EUR",
      projectPeriod: null,
      submittedOn: null,
      answers: [{ questionId, question: "Plan", response: "Repair workshops with a free venue." }],
    },
    criteria: criteria.map(({ id, title, description }) => ({ id, title, description })),
  });
  expect(JSON.stringify(calls)).not.toContain("PRIVATE-MANAGER-NOTE");

  expect(result.review).toMatchObject({
    applicationVersion: 1,
    provider: "Test provider",
    model: "test-model",
    runBy: { userId: "dana", name: "Dana Reed" },
    provenance: { interface: "web" },
    position: "Fund",
    amount: { minorUnits: "1800000", currency: "EUR" },
    freshness: "current",
    questions: ["How many people will attend?"],
    criteria: [
      { criterionId: criteria[0]?.id, title: "Community benefit" },
      { criterionId: criteria[1]?.id, title: "Feasibility" },
    ],
  });
  expect(result.review.criteria[0]?.claims).toEqual([
    {
      text: "The workshops use a free venue.",
      citations: [{ source: questionId, quote: "Repair workshops with a free venue" }],
    },
  ]);
  expect(await rows()).toBe(1);
  expect(await recordedEvents(database.client, "action = 'ai_review.recorded'")).toEqual([
    `ai_review.recorded ai_review/${result.review.id}@-`,
  ]);
  expect(onSaved).toHaveBeenCalledExactlyOnceWith({
    workspaceId: "alder",
    workspaceKind: "standard",
    surface: "web",
  });

  const entries = await listWorkspaceActivity(db, actor, { workspaceSlug });
  assert(entries.status === "ok");
  expect(entries.entries[0]).toMatchObject({
    action: "ai_review.recorded",
    actor: "Dana Reed",
    subject: { type: "ai_review", id: result.review.id, name: "Workshop Saturdays" },
    record: { kind: "application", id: address.publicId, title: "Workshop Saturdays" },
  });

  const mcp = { userId: "dana", provenance: { interface: "mcp", clientId: "client-1" } } as const;
  const second = await run(stub().reviewer, { as: mcp, onSaved });
  assert(second.status === "ok");
  expect(second.review.provenance).toEqual({ interface: "mcp", clientId: "client-1" });
  expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ surface: "mcp" }));

  const read = await readApplicationAiReviews(db, actor, address);
  assert(read.status === "ok");
  expect(read.reviews.map(({ id }) => id)).toEqual([second.review.id, result.review.id]);
  const current = await page();
  expect(current?.aiReviews.map(({ id }) => id)).toEqual([second.review.id, result.review.id]);
});

it("reviews a round with no criteria as a whole application, and an application with no answers", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { run } = await setup(db, database, runtimeUrl, { withCriteria: false });
  const result = await run(
    stub((request) => ({
      ...validReply(request),
      criteria: [
        {
          criterionId: null,
          claims: [],
          gaps: ["No criteria."],
          strengths: [],
          weaknesses: [],
          concerns: [],
        },
      ],
    })).reviewer,
  );
  assert(result.status === "ok");
  expect(result.review.criteria).toMatchObject([{ criterionId: null, title: "Whole application" }]);
});

it.for([
  ["consent_required", "DELETE FROM assistant_consents"],
  ["provider_unconfigured", null],
  [
    "withdrawn",
    null, // The application is withdrawn through the intake command below.
  ],
  [
    "demo",
    "UPDATE organizations SET kind = 'demo', demo_expires_at = now() + interval '1 day', demo_seed_version = 1",
  ],
] as const)(
  "refuses a run that is %s without calling the provider or saving",
  async ([availability, statement], { db, database, runtimeUrl }) => {
    const { run, rows, edit } = await setup(db, database, runtimeUrl);
    if (statement) {
      await database.client.query(statement);
    }
    if (availability === "withdrawn") {
      expect(
        await edit({
          action: "withdraw",
          withdrawnOn: new Date().toISOString().slice(0, 10),
          reason: "Withdrawn",
        }),
      ).toMatchObject({ status: "ok" });
    }
    const { reviewer } = stub();
    const result = await run(availability === "provider_unconfigured" ? undefined : reviewer);
    expect(result).toEqual({ status: "not_available", availability });
    expect(reviewer.review).not.toHaveBeenCalled();
    expect(await rows()).toBe(0);
  },
);

it.for([
  ["a provider error", () => Promise.reject(new Error("provider down"))],
  ["malformed output", () => ({ criteria: "nope" })],
  [
    "an unverifiable citation",
    (request: AiReviewerRequest) => {
      const reply = validReply(request);
      return {
        ...reply,
        criteria: reply.criteria.map((section) => ({
          ...section,
          claims: [
            { text: "Invented", citations: [{ source: questionId, quote: "A grand hall" }] },
          ],
        })),
      };
    },
  ],
  [
    "criteria that do not match the round",
    (request: AiReviewerRequest) => ({
      ...validReply(request),
      criteria: validReply(request).criteria.slice(0, 1),
    }),
  ],
  [
    "a position that contradicts its amount",
    (request: AiReviewerRequest) => ({
      ...validReply(request),
      position: "Decline",
    }),
  ],
] as const)("saves nothing after %s", async ([, reply], { db, database, runtimeUrl }) => {
  const { run, rows } = await setup(db, database, runtimeUrl);
  const onSaved = vi.fn();
  expect(await run(stub(reply).reviewer, { onSaved })).toEqual({ status: "failed" });
  expect(await rows()).toBe(0);
  expect(await recordedEvents(database.client, "action = 'ai_review.recorded'")).toEqual([]);
  expect(onSaved).not.toHaveBeenCalled();
});

it("works outside any transaction, saves simultaneous runs, and keeps the basis it read", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { run, rows, edit, page, address } = await setup(db, database, runtimeUrl);
  let arrived = 0;

  let release: () => void = () => {};

  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  const idle: number[] = [];

  const observe = async () => {
    const open = await database.client.query<{ count: string }>(
      `SELECT count(*) FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'`,
    );
    idle.push(Number(open.rows[0]?.count));
    await database.client.query(
      "SELECT id FROM application_cases WHERE id = $1 FOR UPDATE NOWAIT",
      [address.publicId],
    );
  };

  const changed = async () => {
    // Both runs wait inside the provider call together: neither holds a lock or transaction.
    arrived += 1;
    if (arrived === 2) {
      await observe();
      release();
    }
    await bothArrived;
  };

  const results = await Promise.all([
    run(stub(async (request) => (await changed(), validReply(request))).reviewer),
    run(stub(async (request) => (await changed(), validReply(request))).reviewer),
  ]);
  expect(results.map(({ status }) => status)).toEqual(["ok", "ok"]);
  expect(idle).toEqual([0]);
  expect(await rows()).toBe(2);

  // An application revised during a run is saved against the version the run read.
  assert((await edit({ action: "mark_ready" })).status === "ok");
  const revised = await run(
    stub(async (request) => {
      assert((await edit({ action: "start_revision", kind: "correction" })).status === "ok");
      const draft = (await page())?.intake.workingRevision;
      assert(draft);
      assert(
        (
          await edit({
            action: "save_revision",
            draft: { ...draft, reason: "Fix the title", content: { title: "Workshop Sundays" } },
          })
        ).status === "ok",
      );
      assert((await edit({ action: "publish_revision" })).status === "ok");
      return validReply(request);
    }).reviewer,
  );
  assert(revised.status === "ok");
  expect(revised.review).toMatchObject({ applicationVersion: 1, freshness: "outdated" });
  expect((await page())?.application.version).toBe(2);
  expect((await page())?.aiReviews[0]).toMatchObject({
    id: revised.review.id,
    freshness: "outdated",
  });
});

it.for([
  ["consent is turned off", "consent_required"],
  ["the application is withdrawn", "withdrawn"],
  ["the manager loses the program manager role", "not_found"],
] as const)(
  "saves nothing when %s during the run",
  async ([change, outcome], { db, database, runtimeUrl }) => {
    const { run, rows, edit } = await setup(db, database, runtimeUrl);
    const onSaved = vi.fn();

    const during = async () => {
      if (outcome === "consent_required") {
        await database.client.query("DELETE FROM assistant_consents");
      } else if (outcome === "withdrawn") {
        const withdrawn = await edit({
          action: "withdraw",
          withdrawnOn: new Date().toISOString().slice(0, 10),
          reason: "Withdrawn during the run",
        });
        assert(withdrawn.status === "ok");
      } else {
        await database.client.query(
          "UPDATE memberships SET role = 'reviewer' WHERE user_id = 'dana'",
        );
      }
    };

    const result = await run(
      stub(async (request) => {
        await during();
        return validReply(request);
      }).reviewer,
      { onSaved },
    );
    expect(result).toEqual(
      outcome === "not_found"
        ? { status: "not_found" }
        : { status: "not_available", availability: outcome },
    );
    expect(change).toBeTruthy();
    expect(await rows()).toBe(0);
    expect(onSaved).not.toHaveBeenCalled();
  },
);

it("returns the review a run already saved when its identity repeats, without the provider, consent or a second record", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { run, rows } = await setup(db, database, runtimeUrl);
  const runId = randomUUID();
  const first = stub();
  const onSaved = vi.fn();
  const saved = await run(first.reviewer, { runId, onSaved });
  assert(saved.status === "ok");

  // A worker that died after saving, or a lost response, retries the same run.
  await database.client.query("DELETE FROM assistant_consents");
  const retry = stub();
  expect(await run(retry.reviewer, { runId, onSaved })).toEqual(saved);
  expect(retry.calls).toEqual([]);
  expect(await rows()).toBe(1);
  expect(onSaved).toHaveBeenCalledOnce();

  // A new identity is a new run, so it still needs consent.
  expect(await run(retry.reviewer)).toEqual({
    status: "not_available",
    availability: "consent_required",
  });
});

it("refuses a run identity that belongs to another application", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { round, run, rows } = await setup(db, database, runtimeUrl);
  const other = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Another project",
    applicant: "Another Collective",
    requested: "1000",
    answers: [],
  });
  assert(other.status === "ok");
  const runId = randomUUID();
  assert((await run(stub().reviewer, { runId })).status === "ok");

  const intruder = stub();
  expect(await run(intruder.reviewer, { runId, publicId: other.publicId })).toEqual({
    status: "not_found",
  });
  expect(intruder.calls).toEqual([]);
  expect(await rows()).toBe(1);
});

it("saves one review when two runs with the same identity finish together", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { run, rows } = await setup(db, database, runtimeUrl);
  const runId = randomUUID();
  let arrived = 0;

  let release = () => {};

  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Neither run has saved when the other asks the provider, so only the unique identity decides.
  const together = async (request: AiReviewerRequest) => {
    arrived += 1;
    if (arrived === 2) {
      release();
    }
    await bothArrived;
    return validReply(request);
  };

  const onSaved = vi.fn();

  const results = await Promise.all([
    run(stub(together).reviewer, { runId, onSaved }),
    run(stub(together).reviewer, { runId, onSaved }),
  ]);

  assert(results[0].status === "ok" && results[1].status === "ok");
  expect(results[0].review.id).toBe(results[1].review.id);
  expect(await rows()).toBe(1);
  expect(onSaved).toHaveBeenCalledOnce();
  expect(await recordedEvents(database.client, "action = 'ai_review.recorded'")).toHaveLength(1);
});

it("keeps AI reviews away from reviewer members in every read and run", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { address, run, runtime } = await setup(db, database, runtimeUrl);
  const saved = await run(stub().reviewer);
  assert(saved.status === "ok");
  const rita = { userId: "rita" };
  const { reviewer, calls } = stub();

  expect(await run(reviewer, { as: rita })).toEqual({ status: "not_found" });
  expect(calls).toHaveLength(0);
  expect(await readApplicationAiReviews(db, rita, address)).toEqual({ status: "not_found" });
  expect(await getFundingApplicationPage(db, rita, address)).toBeNull();

  // Even a runtime connection scoped to her own workspace membership reads no AI review rows.
  const visible = await runtime((rdb) =>
    import("@merit/organizations/transactions").then(({ readWorkspace }) =>
      readWorkspace(rdb, "rita", workspaceSlug, (tx) => tx.execute(sql`SELECT id FROM ai_reviews`)),
    ),
  );
  expect(visible.rows).toEqual([]);
  const manager = await runtime((rdb) =>
    import("@merit/organizations/transactions").then(({ readWorkspace }) =>
      readWorkspace(rdb, "dana", workspaceSlug, (tx) => tx.execute(sql`SELECT id FROM ai_reviews`)),
    ),
  );
  expect(manager.rows).toHaveLength(1);
});

it("never counts an AI review as an assessment, a review summary or an allocation", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { address, run, page } = await setup(db, database, runtimeUrl);
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
  database,
  runtimeUrl,
}) => {
  const { address, run, edit } = await setup(db, database, runtimeUrl);
  const provider = { provider: "Test provider", model: "test-model" };

  const read = () =>
    runtimeUrl &&
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

it("keeps a saved run immutable, removing it only with its application", async ({
  db,
  database,
  runtimeUrl,
}) => {
  const { address, run, runtime } = await setup(db, database, runtimeUrl);
  const saved = await run(stub().reviewer);
  assert(saved.status === "ok");

  const attempt = (statement: string) => database.client.query(statement);

  for (const statement of [
    "UPDATE ai_reviews SET model = 'other'",
    "DELETE FROM ai_reviews",
    "UPDATE ai_review_sections SET criterion_title = 'Other'",
    "DELETE FROM ai_review_items",
    "DELETE FROM ai_review_citations",
    "UPDATE ai_review_questions SET text = 'Other'",
    "INSERT INTO ai_review_questions (organization_id, ai_review_id, ordinal, text) SELECT organization_id, id, 9, 'Late' FROM ai_reviews",
  ]) {
    await expect(attempt(statement)).rejects.toMatchObject({ code: "23514" });
  }
  // The runtime role holds no privilege to change a run.
  for (const statement of ["UPDATE ai_reviews SET model = 'other'", "DELETE FROM ai_reviews"]) {
    await expect(
      runtime((rdb) =>
        import("@merit/organizations/transactions").then(({ writeWorkspace }) =>
          writeWorkspace(rdb, "dana", workspaceSlug, (tx) => tx.execute(sql.raw(statement))),
        ),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  }

  await database.client.query("DELETE FROM application_cases WHERE id = $1", [address.publicId]);
  for (const table of [
    "ai_reviews",
    "ai_review_sections",
    "ai_review_items",
    "ai_review_citations",
    "ai_review_questions",
  ]) {
    expect((await database.client.query(`SELECT 1 FROM ${table}`)).rowCount).toBe(0);
  }
});

it("stores only a position and amount that agree", async ({ db, database, runtimeUrl }) => {
  const { run } = await setup(db, database, runtimeUrl);
  const saved = await run(stub().reviewer);
  assert(saved.status === "ok");

  const insertReview = (position: string, amount: string) =>
    database.client.query(
      `INSERT INTO ai_reviews (run_id, organization_id, case_id, application_version, round_id, criteria_version, provider, model,
         run_by_user_id, run_by_name, provenance_interface, position, amount_minor_units, amount_currency, reasoning)
       SELECT gen_random_uuid(), organization_id, case_id, application_version, round_id, criteria_version, provider, model,
         run_by_user_id, run_by_name, provenance_interface, $1, $2, 'EUR', 'Reasoning' FROM ai_reviews`,
      [position, amount],
    );

  await expect(insertReview("Fund", "0")).rejects.toMatchObject({ code: "23514" });
  await expect(insertReview("Defer", "5")).rejects.toMatchObject({ code: "23514" });
  await expect(insertReview("Maybe", "5")).rejects.toMatchObject({ code: "23514" });
  await expect(insertReview("Fund", "-5")).rejects.toMatchObject({ code: "23514" });
});
