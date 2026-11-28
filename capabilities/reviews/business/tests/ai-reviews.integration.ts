import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect, vi } from "vite-plus/test";

import { createFundingApplication } from "@merit/applications/server";
import { recordedEvents } from "@merit/audit/testing";
import type { DatabaseRunner } from "@merit/db";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { aiReviewLimits, type AiReviewerRequest } from "@merit/reviews/domain";
import { readApplicationAiReviews } from "@merit/reviews/server";

import {
  aiReviewTest as it,
  questionId,
  criteria,
  manyCriteria,
  stub,
  validReply,
} from "./ai-review-test";

it("saves a verified run with its basis, provenance, audit event and analytics outcome", async ({
  db,
  aiReviewSetup,
  database,
}) => {
  const { address, run, rows, edit } = await aiReviewSetup();
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
      citations: [
        { source: questionId, quote: "Repair workshops with a free venue", label: "Plan" },
      ],
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
    applicationId: address.publicId,
    prior: "none",
  });

  const mcp = { userId: "dana", provenance: { interface: "mcp", clientId: "client-1" } } as const;
  const second = await run(stub().reviewer, { as: mcp, onSaved });
  assert(second.status === "ok");
  expect(second.review.provenance).toEqual({ interface: "mcp", clientId: "client-1" });
  expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ surface: "mcp" }));

  const read = await readApplicationAiReviews(db, actor, address);
  assert(read.status === "ok");
  expect(read.reviews.map(({ id }) => id)).toEqual([second.review.id, result.review.id]);
});

/** A reply that covers the whole application and quotes only its title. */
const wholeApplicationReply = (request: AiReviewerRequest) => ({
  ...validReply(request),
  criteria: [
    {
      criterionId: null,
      claims: [
        {
          text: "The project is named.",
          citations: [{ source: "title", quote: "Workshop Saturdays" }],
        },
      ],
      gaps: ["No criteria."],
      strengths: [],
      weaknesses: [],
      concerns: [],
    },
  ],
});

it("reviews a round with no criteria as a whole application", async ({ aiReviewSetup }) => {
  const { run } = await aiReviewSetup({ withCriteria: false });
  const { reviewer, calls } = stub(wholeApplicationReply);

  const result = await run(reviewer);

  assert(result.status === "ok");
  expect(calls[0]?.input.criteria).toEqual([]);
  expect(result.review.criteria).toMatchObject([{ criterionId: null, title: "Whole application" }]);
});

it("reviews an application with no submitted answers and reports the gaps", async ({
  aiReviewSetup,
}) => {
  const { run, rows } = await aiReviewSetup({ answers: [] });
  const { reviewer, calls } = stub((request) => ({
    ...validReply(request),
    criteria: request.input.criteria.map(({ id }) => ({
      criterionId: id,
      claims: [
        { text: "The project is named.", citations: [{ source: "title", quote: "Workshop" }] },
      ],
      gaps: ["The application has no answers."],
      strengths: [],
      weaknesses: [],
      concerns: [],
    })),
  }));

  const result = await run(reviewer);

  assert(result.status === "ok");
  // The provider is sent the application with no answers, and the review saves.
  expect(calls[0]?.input.application.answers).toEqual([]);
  expect(calls[0]?.input.criteria).toHaveLength(2);
  expect(result.review.criteria[0]?.gaps).toEqual(["The application has no answers."]);
  expect(await rows()).toBe(1);
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
  async ([availability, statement], { aiReviewSetup, database }) => {
    const { run, rows, edit } = await aiReviewSetup();
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
] as const)("saves nothing after %s", async ([, reply], { aiReviewSetup, database }) => {
  const { run, rows } = await aiReviewSetup();
  const onSaved = vi.fn();
  expect(await run(stub(reply).reviewer, { onSaved })).toEqual({ status: "failed" });
  expect(await rows()).toBe(0);
  expect(await recordedEvents(database.client, "action = 'ai_review.recorded'")).toEqual([]);
  expect(onSaved).not.toHaveBeenCalled();
});

it("works outside any transaction, saves simultaneous runs, and keeps the basis it read", async ({
  db,
  aiReviewSetup,
  database,
}) => {
  const { run, rows, edit, applicationState, address } = await aiReviewSetup();
  let arrived = 0;

  let release: () => void = () => {};

  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  const idle: number[] = [];
  const probe: { failure?: unknown } = {};

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
      try {
        await observe();
      } catch (error) {
        // Reported after the runs end; a failed probe must not leave the other run waiting.
        probe.failure = error;
      } finally {
        release();
      }
    }
    await bothArrived;
  };

  const results = await Promise.all([
    run(stub(async (request) => (await changed(), validReply(request))).reviewer),
    run(stub(async (request) => (await changed(), validReply(request))).reviewer),
  ]);
  expect(probe.failure).toBeUndefined();
  expect(results.map(({ status }) => status)).toEqual(["ok", "ok"]);
  expect(idle).toEqual([0]);
  expect(await rows()).toBe(2);

  // An application revised during a run is saved against the version the run read.
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
  expect(revised.review).toMatchObject({ applicationVersion: 1, freshness: "outdated" });
  expect((await applicationState()).version).toBe(2);
  const read = await readApplicationAiReviews(db, actor, address);
  assert(read.status === "ok");
  expect(read.reviews[0]).toMatchObject({ id: revised.review.id, freshness: "outdated" });
});

it("judges a new run by the freshness of the latest earlier run, however many came before", async ({
  aiReviewSetup,
}) => {
  const { run, edit } = await aiReviewSetup();
  const onSaved = vi.fn();

  const prior = () => onSaved.mock.calls.map(([saved]) => (saved as { prior: string }).prior);

  for (let count = 0; count < 3; count++) {
    assert((await run(stub().reviewer, { onSaved })).status === "ok");
  }
  expect(prior()).toEqual(["none", "current", "current"]);

  assert((await edit({ action: "mark_ready" })).status === "ok");
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

  // The earlier runs read version 1; the application is now at version 2.
  assert((await run(stub().reviewer, { onSaved })).status === "ok");
  // The newest earlier run read version 2, whatever the older ones read.
  assert((await run(stub().reviewer, { onSaved })).status === "ok");
  expect(prior()).toEqual(["none", "current", "current", "outdated", "current"]);
});

it("holds no database connection while the provider works", async ({ aiReviewSetup }) => {
  const { runtime, run, rows } = await aiReviewSetup();
  let checkedOut = 0;
  const checkouts: number[] = [];

  const counting: DatabaseRunner = async (operation) => {
    checkedOut += 1;
    try {
      return await runtime(operation);
    } finally {
      checkedOut -= 1;
    }
  };

  const { reviewer } = stub(async (request) => {
    checkouts.push(checkedOut);
    return validReply(request);
  });

  expect((await run(reviewer, { runner: counting })).status).toBe("ok");
  // The reviewer was asked once, with no checkout held, and both transactions ran around it.
  expect(checkouts).toEqual([0]);
  expect(checkedOut).toBe(0);
  expect(await rows()).toBe(1);
});

it.for([
  ["consent is turned off", "consent_required"],
  ["the application is withdrawn", "withdrawn"],
  ["the manager loses the program manager role", "not_found"],
] as const)(
  "saves nothing when %s during the run",
  async ([change, outcome], { aiReviewSetup, database }) => {
    const { run, rows, edit } = await aiReviewSetup();
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
  aiReviewSetup,
  database,
}) => {
  const { run, rows } = await aiReviewSetup();
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

it("refuses a run identity that belongs to another application", async ({ db, aiReviewSetup }) => {
  const { round, run, rows } = await aiReviewSetup();
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
  aiReviewSetup,
  database,
}) => {
  const { run, rows } = await aiReviewSetup();
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
  aiReviewSetup,
}) => {
  const { address, run, runtime } = await aiReviewSetup();
  const saved = await run(stub().reviewer);
  assert(saved.status === "ok");
  const rita = { userId: "rita" };
  const { reviewer, calls } = stub();

  expect(await run(reviewer, { as: rita })).toEqual({ status: "not_found" });
  expect(calls).toHaveLength(0);
  expect(await readApplicationAiReviews(db, rita, address)).toEqual({ status: "not_found" });

  // Even a runtime connection scoped to her own workspace membership reads no AI review rows,
  // from the review or from any table that holds its content.
  const tables = [
    "ai_reviews",
    "ai_review_sections",
    "ai_review_items",
    "ai_review_citations",
    "ai_review_questions",
  ];

  const countRows = (userId: string) =>
    runtime((rdb) =>
      import("@merit/organizations/transactions").then(({ readWorkspace }) =>
        readWorkspace(rdb, userId, workspaceSlug, async (tx) => {
          const totals: Record<string, number> = {};
          for (const table of tables) {
            const { rows } = await tx.execute<{ total: string }>(
              sql`SELECT count(*)::text AS total FROM ${sql.identifier(table)}`,
            );
            totals[table] = Number(rows[0]?.total);
          }
          return totals;
        }),
      ),
    );

  expect(await countRows("rita")).toEqual(Object.fromEntries(tables.map((table) => [table, 0])));
  // The same connection as a manager does read them, so the zeros above are the policy's doing.
  const manager = await countRows("dana");
  expect(Object.keys(manager)).toEqual(tables);
  expect(Object.values(manager).every((total) => total > 0)).toBe(true);
});

it("keeps a saved run immutable, removing it only with its application", async ({
  aiReviewSetup,
  database,
}) => {
  const { address, run, runtime } = await aiReviewSetup();
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

it("stores only a position and amount that agree", async ({ aiReviewSetup, database }) => {
  const { run } = await aiReviewSetup();
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

it.for([
  ["the application", { applicationVersion: 2 }],
  // Setting the round's criteria made version 2 the current one.
  ["the criteria", { criteriaVersion: 1 }],
] as const)(
  "sends nothing when %s is not at the version the caller showed",
  async ([_name, expected], { aiReviewSetup }) => {
    const { run, rows } = await aiReviewSetup();
    const { reviewer } = stub();
    const onSaved = vi.fn();

    const result = await run(reviewer, { expected, onSaved });

    expect(result).toEqual({ status: "conflict" });
    expect(reviewer.review).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(await rows()).toBe(0);
  },
);

it("runs when the versions the caller showed are the current ones, and for a caller that names none", async ({
  aiReviewSetup,
}) => {
  const { run, rows } = await aiReviewSetup();

  expect(
    (await run(stub().reviewer, { expected: { applicationVersion: 1, criteriaVersion: 2 } }))
      .status,
  ).toBe("ok");
  expect((await run(stub().reviewer)).status).toBe("ok");

  expect(await rows()).toBe(2);
});

it("refuses a run whose application changed after it was shown, once the application has a newer version", async ({
  aiReviewSetup,
}) => {
  const { run, rows, edit, applicationState } = await aiReviewSetup();
  assert((await edit({ action: "mark_ready" })).status === "ok");
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
  expect((await applicationState()).version).toBe(2);
  const { reviewer } = stub();

  expect(await run(reviewer, { expected: { applicationVersion: 1 } })).toEqual({
    status: "conflict",
  });
  expect(reviewer.review).not.toHaveBeenCalled();
  expect(await rows()).toBe(0);
});

it("returns the review a concurrent run with the same identity saved when this run's provider fails", async ({
  aiReviewSetup,
}) => {
  const { run, rows } = await aiReviewSetup();
  const runId = randomUUID();

  let finishOther = () => {};

  const otherSaved = new Promise<void>((resolve) => {
    finishOther = resolve;
  });

  let enter = () => {};

  const failingEntered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const failing = run(
    stub(async () => {
      enter();
      await otherSaved;
      throw new Error("The provider timed out.");
    }).reviewer,
    { runId },
  );

  // The other run starts only once the failing one is inside its provider call.
  await failingEntered;
  const other = await run(stub().reviewer, { runId });
  assert(other.status === "ok");
  finishOther();
  const result = await failing;

  assert(result.status === "ok");
  expect(result.review.id).toBe(other.review.id);
  expect(await rows()).toBe(1);
});

it("reports a failed run when nothing was saved under its identity", async ({ aiReviewSetup }) => {
  const { run, rows } = await aiReviewSetup();

  const result = await run(
    stub(() => Promise.reject(new Error("The provider timed out."))).reviewer,
  );

  expect(result).toEqual({ status: "failed" });
  expect(await rows()).toBe(0);
});

it("does not look for a saved run under another application's authority when the provider fails", async ({
  aiReviewSetup,
}) => {
  const { run, rows } = await aiReviewSetup();
  const saved = await run(stub().reviewer);
  assert(saved.status === "ok");

  // The identity belongs to a saved run of this application; another caller cannot reach it.
  const stranger = await run(
    stub(() => Promise.reject(new Error("The provider timed out."))).reviewer,
    { as: { userId: "rita" }, runId: randomUUID() },
  );

  expect(stranger).toEqual({ status: "not_found" });
  expect(await rows()).toBe(1);
});

it("answers not found, and does not return the saved run, when the caller lost access while the provider failed", async ({
  aiReviewSetup,
  database,
}) => {
  const { run, rows } = await aiReviewSetup();
  const runId = randomUUID();

  let fail = () => {};

  const providerFails = new Promise<void>((resolve) => {
    fail = resolve;
  });

  let enter = () => {};

  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const failing = run(
    stub(async () => {
      enter();
      await providerFails;
      throw new Error("The provider timed out.");
    }).reviewer,
    { runId },
  );

  // A concurrent run with this identity saves while the manager's provider call is in flight,
  // and then the manager's role is revoked before that call fails.
  await entered;
  assert((await run(stub().reviewer, { runId })).status === "ok");
  await database.client.query("UPDATE memberships SET role = 'reviewer' WHERE user_id = 'dana'");
  fail();

  expect(await failing).toEqual({ status: "not_found" });
  expect(await rows()).toBe(1);
});

it.for([
  [
    "the provider answers after the stop",
    (stop: () => void, request: AiReviewerRequest) => (stop(), validReply(request)),
  ],
  [
    "the provider request is aborted by the stop",
    (stop: () => void) => (stop(), Promise.reject(new Error("The request was aborted."))),
  ],
] as const)(
  "saves nothing and reports a stopped run when %s",
  async ([_name, answer], { aiReviewSetup }) => {
    const { run, rows } = await aiReviewSetup();
    const stopped = new AbortController();
    const { reviewer, calls } = stub((request) => answer(() => stopped.abort(), request));
    const onSaved = vi.fn();

    const result = await run({ ...reviewer, signal: stopped.signal }, { onSaved });

    expect(result).toEqual({ status: "stopped" });
    // The provider request carried the run's signal, so a stop could end it.
    expect(calls[0]?.signal).toBe(stopped.signal);
    expect(await rows()).toBe(0);
    expect(onSaved).not.toHaveBeenCalled();
  },
);

/**
 * Hold an application the way a grant command does: the workspace and round shared, then the
 * case row, in the order the save takes them. The save then waits for the case alone, and the
 * holder never needs a lock the save holds, so the two cannot deadlock.
 */
const holdApplication = async (
  holder: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  caseId: string,
) => {
  await holder.query("BEGIN");
  await holder.query(
    "SELECT id FROM organizations WHERE id = (SELECT organization_id FROM application_cases WHERE id = $1) FOR SHARE",
    [caseId],
  );
  await holder.query(
    "SELECT id FROM funding_rounds WHERE id = (SELECT round_id FROM application_cases WHERE id = $1) FOR SHARE",
    [caseId],
  );
  await holder.query("SELECT id FROM application_cases WHERE id = $1 FOR UPDATE", [caseId]);
};

/** The save connects on its own, which a loaded machine can take longer than the default second to do. */
const lockWait = { timeout: 15_000 };

it("saves nothing and reports a stopped run when Stop arrives while the save waits for the application", async ({
  aiReviewSetup,
  database,
}) => {
  const { run, rows, address } = await aiReviewSetup();
  const stopped = new AbortController();
  const holder = database.client;
  const onSaved = vi.fn();
  let held: number | undefined;
  // Another writer holds the application while the provider answers, so the save waits for it.
  const { reviewer } = stub(async (request) => {
    await holdApplication(holder, address.publicId);
    held = (await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
    return validReply(request);
  });

  const result = run({ ...reviewer, signal: stopped.signal }, { onSaved });
  await vi.waitFor(async () => {
    expect(held).toBeDefined();
    // Inside a transaction the activity view is a snapshot of its first read, so read it afresh.
    await holder.query("SELECT pg_stat_clear_snapshot()");
    const waiting = await holder.query<{ count: string }>(
      "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND $1 = ANY(pg_blocking_pids(pid))",
      [held],
    );
    expect(Number(waiting.rows[0]?.count)).toBe(1);
  }, lockWait);
  stopped.abort();
  await holder.query("COMMIT");

  expect(await result).toEqual({ status: "stopped" });
  expect(await rows()).toBe(0);
  expect(await recordedEvents(holder, "action = 'ai_review.recorded'")).toEqual([]);
  expect(onSaved).not.toHaveBeenCalled();
});

it("saves a run whose signal never ended", async ({ aiReviewSetup }) => {
  const { run, rows } = await aiReviewSetup();
  const { reviewer } = stub();

  expect((await run({ ...reviewer, signal: new AbortController().signal })).status).toBe("ok");
  expect(await rows()).toBe(1);
});

it("stamps a run when it is inserted after the case lock, so history order is commit order", async ({
  aiReviewSetup,
  database,
}) => {
  const { run, address } = await aiReviewSetup();
  // Another writer holds the application while the provider answers, so the save waits for it.
  const holder = database.client;
  let held: number | undefined;
  const result = run(
    stub(async (request) => {
      await holdApplication(holder, address.publicId);
      held = (await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
      return validReply(request);
    }).reviewer,
  );
  await vi.waitFor(async () => {
    expect(held).toBeDefined();
    // Inside a transaction the activity view is a snapshot of its first read, so read it afresh.
    await holder.query("SELECT pg_stat_clear_snapshot()");
    const waiting = await holder.query<{ count: string }>(
      "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND $1 = ANY(pg_blocking_pids(pid))",
      [held],
    );
    expect(Number(waiting.rows[0]?.count)).toBe(1);
  }, lockWait);
  const releasedAt = (await holder.query<{ at: string }>("SELECT clock_timestamp()::text AS at"))
    .rows[0]?.at;
  await holder.query("COMMIT");

  assert((await result).status === "ok");

  // The save began before the lock was released, but the review is stamped after it.
  const stamped = await holder.query<{ after: boolean }>(
    "SELECT recorded_at >= $1::timestamptz AS after FROM ai_reviews",
    [releasedAt],
  );
  expect(stamped.rows).toEqual([{ after: true }]);
});

it(
  "saves a review at the whole-review caps, in batches within one transaction, well inside the statement timeout",
  { timeout: 120_000 },
  async ({ aiReviewSetup, database }) => {
    const { run, rows } = await aiReviewSetup({ roundCriteria: manyCriteria(100) });
    const quote = "Repair workshops with a free venue";
    const { itemsPerReview, citationsPerReview, itemsPerList } = aiReviewLimits;
    const sections = 100;
    // 100 sections of 1 claim (6 citations) and 3 gaps: exactly 400 items and 600 citations.
    const claim = {
      text: "Claim",
      citations: Array.from({ length: citationsPerReview / sections }, () => ({
        source: questionId,
        quote,
      })),
    };
    const gaps = Array.from(
      { length: itemsPerReview / sections - 1 },
      (_, index) => `Gap ${index}`,
    );
    const list = Array.from({ length: itemsPerList }, (_, index) => `Question ${index}`);

    const started = performance.now();
    const result = await run(
      stub((request) => ({
        ...validReply(request),
        criteria: request.input.criteria.map(({ id }) => ({
          criterionId: id,
          claims: [claim],
          gaps,
          strengths: [],
          weaknesses: [],
          concerns: [],
        })),
        questions: list,
      })).reviewer,
    );
    const elapsed = performance.now() - started;

    assert(result.status === "ok");
    // The statement timeout is 10 s; the largest reply a provider can return saves in a fraction.
    expect(elapsed).toBeLessThan(3000);
    expect(await rows()).toBe(1);
    const counts = await database.client.query<Record<string, string>>(
      `SELECT (SELECT count(*) FROM ai_review_sections) AS sections,
            (SELECT count(*) FROM ai_review_items) AS items,
            (SELECT count(*) FROM ai_review_citations) AS citations,
            (SELECT count(*) FROM ai_review_questions) AS questions`,
    );
    expect(counts.rows[0]).toEqual({
      sections: "100",
      items: String(itemsPerReview),
      citations: String(citationsPerReview),
      questions: "20",
    });
    expect(result.review.criteria).toHaveLength(100);
    expect(result.review.criteria[99]?.claims[0]?.citations).toHaveLength(6);
  },
);
