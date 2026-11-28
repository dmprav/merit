import { randomUUID } from "node:crypto";

import { assert, expect, onTestFinished, vi } from "vite-plus/test";
import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { withDatabase, type Database } from "@merit/db";
import { contactWork } from "@merit/grantmaking/testing/contact-work";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import {
  reviewRevisionSchema,
  type AiReviewer,
  type AiReviewerRequest,
} from "@merit/reviews/domain";
import { runAiReview, saveApplicationReview } from "@merit/reviews/server";
import { inlineReviewerDelivery } from "@merit/reviews/testing";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { createAssistantHost, createAssistantRuntime } from "../src/server/assistant/host.server";
import type { AssistantCommand } from "../src/server/assistant/http.server";
import type { EmailSender } from "../src/server/email-delivery.server";
import { reviewerMessageDelivery } from "../src/server/services.server";

const it = roundTest
  .extend("runtime", { scope: "file" }, async ({ database }) => database.createRuntimeConnection())
  .extend("committee", async ({ db, database, rounds }) => {
    const address = await rounds.createApplication("Community gardens");
    const assessmentId = randomUUID();
    const reviewers = [];
    for (const [index, name] of ["Alex", "Jo", "Sam", "Lee"].entries()) {
      const userId = name.toLowerCase();
      const email = userId + "@example.test";
      const contactId = randomUUID();
      const contact = await changeWorkspaceContact(
        db,
        actor,
        {
          workspaceSlug,
          contactId,
          action: "create",
          details: { name, email, affiliation: "" },
        },
        contactWork,
      );
      assert(contact.status === "ok");
      const basis = {
        ...address,
        expectedRevision: reviewRevisionSchema.parse(index),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      };
      if (index === 0) {
        const assessment = await saveApplicationReview(db, actor, {
          ...basis,
          change: {
            action: "record",
            id: assessmentId,
            contactId,
            requestId: null,
            previousId: null,
            content: {
              applicationVersion: basis.expectedApplicationVersion,
              criteriaVersion: basis.expectedCriteriaVersion,
              date: null,
              position: null,
              amount: null,
              reasoning: "Volunteer cover needs clarification.",
              observations: [],
            },
          },
        });
        assert(assessment.status === "ok");
        continue;
      }
      await database.client.query(
        "insert into app_users (id, name, clerk_user_id) values ($1, $2, $1)",
        [userId, name],
      );
      await database.client.query(
        "insert into memberships (organization_id, user_id, email, role) values ('alder', $1, $2, 'reviewer')",
        [userId, email],
      );
      const requestId = randomUUID();
      const request = await saveApplicationReview(db, actor, {
        ...basis,
        change: { action: "request", id: requestId, contactId, replacesId: null },
      });
      assert(request.status === "ok");
      reviewers.push({ contactId, requestId, name, email });
    }
    return { address, applicationId: address.publicId, assessmentId, reviewers };
  });

const calls = (...tools: Array<[string, Record<string, unknown>]>) =>
  Response.json({
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          content: null,
          tool_calls: tools.map(([name, input]) => ({
            type: "function",
            function: { name, arguments: JSON.stringify({ input }) },
          })),
        },
      },
    ],
  });

const answer = (content: string) =>
  Response.json({ choices: [{ finish_reason: "stop", message: { content } }] });

const source = z.object({
  kind: z.string(),
  recordId: z.string(),
  version: z.string(),
  key: z.string(),
});

const receipts = async (url: RequestInfo | URL, init?: RequestInit) => {
  const body: unknown = await new Request(url, init).json();
  const { messages } = z
    .object({ messages: z.array(z.object({ role: z.string(), content: z.string().nullable() })) })
    .parse(body);
  return messages
    .filter((m) => m.role === "tool")
    .map((m) =>
      z
        .object({ result: z.record(z.string(), z.unknown()), evidence: z.array(source) })
        .parse(JSON.parse(m.content ?? "")),
    );
};

const snapshot = z.object({
  id: z.string(),
  status: z.string(),
  messages: z.array(
    z.object({ role: z.string(), text: z.string(), citations: z.array(source).optional() }),
  ),
  groups: z.array(
    z.object({
      id: z.string(),
      actions: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          canRetry: z.boolean(),
          preview: z.object({
            name: z.string(),
            input: z.record(z.string(), z.unknown()),
            effects: z.array(z.string()),
            targets: z.array(z.unknown()),
          }),
        }),
      ),
    }),
  ),
});

type Runtime = Parameters<typeof withDatabase>[0];

/** The assistant host over a runtime connection, with its turns driven in process. */
const harness = (runtime: Runtime, sendEmail: EmailSender, aiReviewer?: AiReviewer) => {
  const database_ = <T>(operation: (db: Database) => Promise<T>) =>
    withDatabase(runtime, operation);

  const deliverInline = inlineReviewerDelivery(
    reviewerMessageDelivery({
      database: database_,
      invitationOrigin: "https://merit.test",
      sendEmail,
    }),
  );
  const dependencies = {
    database: database_,
    invitationOrigin: "https://merit.test",
    aiReviewer,
    startReviewerMessage: deliverInline,
    startOrganizationInvitation: async () => true,
  };
  const model = { apiKey: "test", model: "scripted" };
  // The workflow's own tests cover Temporal; here a wake drives the same turns in process.
  const driver = createAssistantRuntime(dependencies, model);

  // As the workflow does: look again after a step that waited, until nothing is left to drive.
  let ending = false;
  onTestFinished(() => {
    ending = true;
  });

  // The workflow cancels a conversation's step after Stop; here that aborts the step's signal.
  const cancellations = new Map<string, AbortController>();

  const drive = async (...address: Parameters<typeof driver.turns.advance>) => {
    const cancellation = new AbortController();
    cancellations.set(address[2], cancellation);
    try {
      while (
        !ending &&
        (await driver.turns.advance(address[0], address[1], address[2], cancellation.signal)) !==
          "finished"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } catch (error) {
      // A step that was in flight when the test ended meets a dropped database.
      if (!ending) {
        throw error;
      }
    }
  };

  const host = createAssistantHost(
    {
      ...dependencies,
      cancelConversation: async (id) => {
        cancellations.get(id)?.abort();
      },
      wakeConversation: async ({ userId, workspaceSlug, conversationId }) => {
        void drive({ userId }, workspaceSlug, conversationId);
        return true;
      },
    },
    model,
  );

  const command = (
    input: AssistantCommand,
    who = actor,
    workspace = workspaceSlug,
    signal = new AbortController().signal,
  ) => host.command(who, workspace, input, signal);

  /** One step by a second worker, as another activity would run it. */
  const step = (id: string) => driver.turns.advance(actor, workspaceSlug, id);

  /** The worker dies: whatever it was doing reports nothing, and nothing it left behind is an error. */
  const crash = () => {
    ending = true;
  };

  return { command, step, crash };
};

it(
  "investigates committee evidence, previews three invitations, and recovers only the failed email after disconnect",
  { timeout: 30_000 },
  async ({ database, runtime, rounds, committee: { applicationId, assessmentId, reviewers } }) => {
    const fetchModel = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchModel);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const attempts: Array<{ id: string; to: string }> = [];
    const delivered: string[] = [];
    const failedEmail = "sam@example.test";

    const sendEmail: EmailSender = async ({ id, to }) => {
      const firstAttempt = !attempts.some((attempt) => attempt.to === to);
      attempts.push({ id, to });
      if (to === failedEmail && firstAttempt) {
        throw new Error("Temporary mail failure");
      }
      delivered.push(to);
    };

    const { command } = harness(runtime, sendEmail);

    const admin = { userId: "birch-manager" };
    expect((await command({ action: "set_consent", enabled: true })).status).toBe(403);
    expect((await command({ action: "set_consent", enabled: true }, admin, "birch")).status).toBe(
      200,
    );
    expect((await command({ action: "create" })).status).toBe(403);
    expect(fetchModel).not.toHaveBeenCalled();
    await database.client.query(
      "insert into memberships (organization_id, user_id, role, administration) values ('alder','birch-manager','member','administrator')",
    );
    expect((await command({ action: "set_consent", enabled: true }, admin)).status).toBe(200);
    const created = await command({ action: "create" });
    expect(created.status).toBe(201);
    const { id } = snapshot.parse(await created.json());

    const open = async () => snapshot.parse(await (await command({ action: "open", id })).json());

    const untilSettled = async () => {
      return vi.waitFor(
        async () => {
          const saved = await open();
          expect(saved.status).not.toBe("running");
          return saved;
        },
        { timeout: 10_000, interval: 50 },
      );
    };

    fetchModel
      .mockResolvedValueOnce(calls(["list_applications", { roundId: rounds.pageInput.publicId }]))
      .mockImplementationOnce(async (...args) => {
        const [listed] = await receipts(...args);
        const [app] = z
          .tuple([z.object({ applicationId: z.string(), applicationVersion: z.number() })])
          .parse(listed?.result.applications);
        return calls(
          [
            "get_application_content",
            {
              applicationId: app.applicationId,
              section: "material",
              materialVersion: app.applicationVersion,
            },
          ],
          ["list_application_reviews", { applicationId: app.applicationId }],
        );
      })
      .mockImplementationOnce(async (...args) => {
        const history = await receipts(...args);
        const reviews = z
          .array(z.object({ kind: z.string(), id: z.string() }))
          .parse(history.at(-1)?.result.reviews);
        const assessment = reviews.find((entry) => entry.kind === "assessment");
        assert(assessment);
        return calls([
          "get_application_content",
          { applicationId, section: "assessment", entryId: assessment.id },
        ]);
      })
      .mockImplementationOnce(async (...args) => {
        const history = await receipts(...args);
        expect(
          history.some((item) =>
            String(item.result.content).includes("Weekly community activities."),
          ),
        ).toBe(true);
        expect(history.at(-1)?.result.content).toContain("Volunteer cover needs clarification.");
        const sources = history.flatMap((item) => item.evidence);
        const material = sources.find((s) => s.kind === "material" && s.recordId === applicationId);
        const assessment = sources.find(
          (s) => s.kind === "assessment" && s.recordId === assessmentId,
        );
        assert(material && assessment);
        return answer(
          `The application proposes weekly activities [${material.key}]. Alex flagged volunteer cover [${assessment.key}].`,
        );
      });

    expect(
      (
        await command({
          action: "start",
          id,
          message: "Which applications need attention before committee?",
          page: `/app/alder/rounds/${rounds.pageInput.publicId}`,
        })
      ).status,
    ).toBe(202);
    const researched = await untilSettled();
    expect(researched.status).toBe("completed");
    expect(researched.messages.at(-1)).toMatchObject({
      role: "assistant",
      citations: [
        { kind: "material", recordId: applicationId, version: "1" },
        { kind: "assessment", recordId: assessmentId, version: "1" },
      ],
    });

    fetchModel.mockResolvedValueOnce(
      calls(
        ...reviewers.map(({ requestId }): [string, Record<string, unknown>] => [
          "invite_reviewer",
          { applicationId, requestId, commandId: randomUUID(), dueDate: null },
        ]),
      ),
    );
    expect(
      (
        await command({
          action: "start",
          id,
          message: "Invite Jo, Sam and Lee to review this application.",
        })
      ).status,
    ).toBe(202);
    const waiting = await untilSettled();
    expect(waiting.status).toBe("awaiting_approval");
    const [group] = waiting.groups;
    assert(group);
    expect(group.actions).toMatchObject(
      reviewers.map(({ requestId, email }) => ({
        status: "waiting",
        preview: {
          name: "invite_reviewer",
          input: { applicationId, requestId },
          effects: [`Send invitation email to ${email}.`],
        },
      })),
    );
    for (const [index, reviewer] of reviewers.entries()) {
      expect(group.actions[index]?.preview.targets).toContainEqual(
        expect.objectContaining({
          kind: "contact",
          id: reviewer.contactId,
          label: reviewer.name,
        }),
      );
    }

    const invitationRows = async () =>
      (
        await database.client.query<{
          request_id: string;
          id: string | null;
          recipient: string | null;
          status: string | null;
        }>(
          "select a.request_id, m.id, m.recipient, m.status from review_assignments a left join reviewer_messages m on m.assignment_id=a.id where a.case_id=$1 order by m.recipient",
          [applicationId],
        )
      ).rows;

    const stale = await command({ action: "approve", id, previewId: "superseded" });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ status: "conflict" });
    expect(await open()).toEqual(waiting);
    expect(await invitationRows()).toEqual([]);
    expect(attempts).toEqual([]);

    fetchModel.mockImplementationOnce(async (...args) => {
      const keys = (await receipts(...args)).flatMap((receipt) =>
        receipt.evidence.map((item) => `[${item.key}]`),
      );
      return answer(`Two invitations were delivered and one delivery failed. ${keys.join(" ")}`);
    });
    const tab = new AbortController();
    expect(
      (
        await command(
          { action: "approve", id, previewId: group.id },
          actor,
          workspaceSlug,
          tab.signal,
        )
      ).status,
    ).toBe(202);
    tab.abort();
    await vi.waitFor(() => expect(attempts).toHaveLength(3), { timeout: 10_000 });
    const returned = await untilSettled();
    expect(returned.status).toBe("completed");
    expect(returned.messages.at(-1)?.text).toContain("one delivery failed");
    expect(returned.groups[0]?.actions.map((item) => item.status)).toEqual([
      "succeeded",
      "failed",
      "succeeded",
    ]);
    const failed = returned.groups[0]?.actions.find((item) => item.canRetry);
    assert(failed);
    const partial = await invitationRows();
    expect(partial).toMatchObject(
      [...reviewers]
        .sort((a, b) => a.email.localeCompare(b.email))
        .map(({ requestId, email }) => ({
          request_id: requestId,
          recipient: email,
          status: email === failedEmail ? "failed" : "sent",
        })),
    );
    expect(delivered).toEqual(["jo@example.test", "lee@example.test"]);

    fetchModel.mockImplementationOnce(async (...args) => {
      const sources = (await receipts(...args)).flatMap((item) => item.evidence);
      return answer(`Invitations delivered. ${sources.map((s) => `[${s.key}]`).join(" ")}`);
    });
    expect(
      (await command({ action: "retry", id, previewId: group.id, actionId: failed.id })).status,
    ).toBe(202);
    const completed = await untilSettled();
    expect(completed.status).toBe("completed");
    expect(completed.groups[0]?.actions.map((item) => item.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
    ]);
    expect(await invitationRows()).toEqual(partial.map((row) => ({ ...row, status: "sent" })));
    const originalMessage = partial.find((row) => row.recipient === failedEmail);
    assert(originalMessage?.id);
    expect(attempts.filter((item) => item.to === failedEmail).map((item) => item.id)).toEqual([
      originalMessage.id,
      originalMessage.id,
    ]);
    expect(delivered.toSorted()).toEqual(reviewers.map((reviewer) => reviewer.email).toSorted());
  },
);

it(
  "previews an AI review run, saves it only on approval and cites it as an AI review",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const fetchModel = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchModel);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const review = vi.fn(async ({ input }: AiReviewerRequest) => ({
      criteria: [
        {
          criterionId: null,
          claims: [
            {
              text: "Activities run weekly.",
              citations: [
                {
                  source: input.application.answers[0]?.questionId,
                  quote: "Weekly community activities",
                },
              ],
            },
          ],
          gaps: ["Volunteer cover is not described."],
          strengths: [],
          weaknesses: [],
          concerns: [],
        },
      ],
      questions: [],
      reasoning: "Weekly and clear.",
      position: "Fund",
      amount: { minorUnits: "8000", currency: "EUR" },
    }));
    const { command } = harness(runtime, async () => {}, {
      provider: "OpenAI",
      model: "scripted",
      review,
    });

    await database.client.query(
      "insert into memberships (organization_id, user_id, role, administration) values ('alder','birch-manager','member','administrator')",
    );
    expect(
      (await command({ action: "set_consent", enabled: true }, { userId: "birch-manager" })).status,
    ).toBe(200);
    const { id } = snapshot.parse(await (await command({ action: "create" })).json());

    const settled = async () =>
      vi.waitFor(
        async () => {
          const saved = snapshot.parse(await (await command({ action: "open", id })).json());
          expect(saved.status).not.toBe("running");
          return saved;
        },
        { timeout: 10_000, interval: 50 },
      );

    const savedRows = async () =>
      (
        await database.client.query<{ provenance_interface: string }>(
          "select provenance_interface from ai_reviews",
        )
      ).rows;

    fetchModel.mockResolvedValueOnce(calls(["run_ai_review", { applicationId }]));
    expect(
      (await command({ action: "start", id, message: "Run an AI review of this application." }))
        .status,
    ).toBe(202);
    const waiting = await settled();
    expect(waiting.status).toBe("awaiting_approval");
    const [group] = waiting.groups;
    assert(group);
    expect(group.actions[0]?.preview).toMatchObject({
      name: "run_ai_review",
      effects: [
        "Sends this application's current material and the round's criteria to OpenAI (scripted).",
        "Saves a new AI review.",
      ],
      targets: [
        {
          kind: "application",
          id: applicationId,
          version: "application version 1, criteria version 1",
        },
      ],
    });
    expect(review).not.toHaveBeenCalled();
    expect(await savedRows()).toEqual([]);

    fetchModel.mockImplementationOnce(async (...args) => {
      const sources = (await receipts(...args)).flatMap((item) => item.evidence);
      const saved = sources.find((item) => item.kind === "ai_review");
      assert(saved);
      return answer(`Merit AI proposes funding in full [${saved.key}].`);
    });
    expect((await command({ action: "approve", id, previewId: group.id })).status).toBe(202);
    const completed = await settled();
    expect(completed.status).toBe("completed");
    expect(completed.messages.at(-1)?.citations).toMatchObject([
      { kind: "ai_review", version: "1" },
    ]);
    expect(review).toHaveBeenCalledOnce();
    expect(await savedRows()).toEqual([{ provenance_interface: "web" }]);
  },
);

/** A reviewer whose provider call waits until the test lets it answer, as a slow provider does. */
const slowReviewer = (output: (request: AiReviewerRequest) => unknown, honorsStop = true) => {
  const gate: { release: () => void } = { release: () => {} };
  const started: { resolve: () => void } = { resolve: () => {} };
  const begun = new Promise<void>((resolve) => {
    started.resolve = resolve;
  });
  const review = vi.fn(async (request: AiReviewerRequest) => {
    started.resolve();
    await new Promise<void>((resolve, reject) => {
      gate.release = resolve;
      if (honorsStop) {
        request.signal?.addEventListener("abort", () => reject(new Error("The run was stopped.")));
      }
    });
    return output(request);
  });
  return {
    reviewer: { provider: "OpenAI", model: "scripted", review } satisfies AiReviewer,
    review,
    begun,
    release: () => gate.release(),
  };
};

const reviewOutput = ({ input }: AiReviewerRequest) => ({
  criteria: [
    {
      criterionId: null,
      claims: [
        {
          text: "Activities run weekly.",
          citations: [
            {
              source: input.application.answers[0]?.questionId,
              quote: "Weekly community activities",
            },
          ],
        },
      ],
      gaps: [],
      strengths: [],
      weaknesses: [],
      concerns: [],
    },
  ],
  questions: [],
  reasoning: "Weekly and clear.",
  position: "Fund",
  amount: { minorUnits: "8000", currency: "EUR" },
});

/** A consented conversation whose AI review run is approved and under way in the provider. */
const approvedRun = async (
  database: { client: { query: (sql: string, values?: unknown[]) => Promise<unknown> } },
  command: ReturnType<typeof harness>["command"],
  applicationId: string,
) => {
  const fetchModel = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchModel);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  await database.client.query(
    "insert into memberships (organization_id, user_id, role, administration) values ('alder','birch-manager','member','administrator')",
  );
  await command({ action: "set_consent", enabled: true }, { userId: "birch-manager" });
  const { id } = snapshot.parse(await (await command({ action: "create" })).json());

  const read = async () => snapshot.parse(await (await command({ action: "open", id })).json());

  fetchModel.mockResolvedValueOnce(calls(["run_ai_review", { applicationId }]));
  await command({ action: "start", id, message: "Run an AI review of this application." });
  const waiting = await vi.waitFor(
    async () => {
      const saved = await read();
      expect(saved.status).toBe("awaiting_approval");
      return saved;
    },
    { timeout: 10_000, interval: 50 },
  );
  const [group] = waiting.groups;
  assert(group);
  fetchModel.mockImplementation(async (...args) => {
    const saved = (await receipts(...args))
      .flatMap((item) => item.evidence)
      .find((item) => item.kind === "ai_review");
    return answer(saved ? `Merit AI proposes funding [${saved.key}].` : "No AI review was saved.");
  });
  await command({ action: "approve", id, previewId: group.id });
  return { id, group, read, fetchModel };
};

it(
  "runs an approved AI review with no conversation lock or open transaction, while the application stays writable",
  { timeout: 30_000 },
  async ({ db, database, runtime, committee: { address, applicationId, reviewers } }) => {
    const provider = slowReviewer(reviewOutput);
    const { command, step } = harness(runtime, async () => {}, provider.reviewer);
    const { id, read } = await approvedRun(database, command, applicationId);
    await provider.begun;

    // The conversation row is free: nothing holds its lock, and no backend waits in a transaction.
    await database.client.query("begin");
    await database.client.query(
      "select id from assistant_conversations where id = $1 for update nowait",
      [id],
    );
    await database.client.query("rollback");
    const waiting = await database.client.query<{ count: string }>(
      "select count(*) from pg_stat_activity where datname = current_database() and state like 'idle in transaction%'",
    );
    expect(waiting.rows[0]?.count).toBe("0");
    // The conversation can be read, and a second worker leaves the live claim alone.
    expect(await read()).toMatchObject({
      status: "running",
      groups: [{ actions: [{ status: "approved" }] }],
    });
    expect(await step(id)).toBe("waiting");
    expect(provider.review).toHaveBeenCalledOnce();

    // Another write to the same application commits during the run.
    const [reviewer] = reviewers;
    assert(reviewer);
    const other = await saveApplicationReview(db, actor, {
      ...address,
      expectedRevision: reviewRevisionSchema.parse(4),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: {
        action: "record",
        id: randomUUID(),
        contactId: reviewer.contactId,
        requestId: reviewer.requestId,
        previousId: null,
        content: {
          applicationVersion: materialVersionSchema.parse(1),
          criteriaVersion: criteriaVersionSchema.parse(1),
          date: null,
          position: null,
          amount: null,
          reasoning: "Recorded while the AI review ran.",
          observations: [],
        },
      },
    });
    expect(other.status).toBe("ok");

    provider.release();
    await vi.waitFor(async () => expect((await read()).status).toBe("completed"), {
      timeout: 10_000,
      interval: 50,
    });
    expect((await database.client.query("select id from ai_reviews")).rows).toHaveLength(1);
  },
);

it(
  "stops an AI review run that saved nothing, and keeps one that committed before Stop as succeeded without a retry",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const stopped = slowReviewer(reviewOutput);
    const { command } = harness(runtime, async () => {}, stopped.reviewer);
    const { id, group, read } = await approvedRun(database, command, applicationId);
    await stopped.begun;
    expect((await command({ action: "stop", id })).status).toBe(200);

    const claimCleared = async () =>
      (
        await database.client.query(
          "select 1 from assistant_conversations where id = $1 and state #> '{groups,0,actions,0,executing}' is null",
          [id],
        )
      ).rowCount === 1;

    await vi.waitFor(async () => expect(await claimCleared()).toBe(true), {
      timeout: 10_000,
      interval: 50,
    });
    expect((await database.client.query("select id from ai_reviews")).rows).toEqual([]);
    expect(await read()).toMatchObject({
      status: "stopped",
      groups: [{ actions: [{ status: "stopped", canRetry: false }] }],
    });
    expect(group.actions).toHaveLength(1);
  },
);

type Client = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** A transaction that holds a row lock, and the backend that holds it. */
const holdLock = async (client: Client, lock: string, id: string) => {
  await client.query("begin");
  await client.query(lock, [id]);
  const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
  return rows[0]?.pid;
};

/** Wait until `count` backends wait on the lock the backend `pid` holds, directly or queued behind another waiter. */
const waitBlockedBy = (client: Client, pid: number | undefined, count: number) =>
  vi.waitFor(
    async () => {
      // The runtime role's sessions are hidden from pg_stat_activity, but not from pg_locks.
      const { rows } = await client.query<{ count: string }>(
        `with recursive waiting(pid) as (
           select pid from pg_locks where not granted and $1 = any(pg_blocking_pids(pid))
           union
           select l.pid from pg_locks l join waiting w on w.pid = any(pg_blocking_pids(l.pid)) where not l.granted
         ) select count(distinct pid) from waiting`,
        [pid],
      );
      expect(Number(rows[0]?.count)).toBe(count);
    },
    { timeout: 10_000, interval: 50 },
  );

const waitForReview = (client: Client) =>
  vi.waitFor(
    async () => expect((await client.query("select id from ai_reviews")).rows).toHaveLength(1),
    { timeout: 10_000, interval: 50 },
  );

const lockApplication = "select id from application_cases where id = $1 for update";
const lockConversation = "select id from assistant_conversations where id = $1 for update";

it(
  "saves nothing and reports the action stopped when Stop arrives while the save waits for the application",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const provider = slowReviewer(reviewOutput);
    const { command } = harness(runtime, async () => {}, provider.reviewer);
    const { id, group, read } = await approvedRun(database, command, applicationId);
    await provider.begun;
    // The provider has answered and the run has begun to save, but the save waits for another writer.
    const holder = await holdLock(database.client, lockApplication, applicationId);
    provider.release();
    await waitBlockedBy(database.client, holder, 1);

    expect((await command({ action: "stop", id })).status).toBe(200);
    await database.client.query("commit");

    await vi.waitFor(
      async () =>
        expect(
          (
            await database.client.query(
              "select 1 from assistant_conversations where id = $1 and state #> '{groups,0,actions,0,executing}' is null",
              [id],
            )
          ).rowCount,
        ).toBe(1),
      { timeout: 10_000, interval: 50 },
    );
    expect((await database.client.query("select id from ai_reviews")).rows).toEqual([]);
    const [action] = (await read()).groups[0]?.actions ?? [];
    assert(action);
    expect(action).toMatchObject({ status: "stopped", canRetry: false });
    expect(
      (await command({ action: "retry", id, previewId: group.id, actionId: action.id })).status,
    ).toBe(409);
    expect((await database.client.query("select id from ai_reviews")).rows).toEqual([]);
  },
);

it(
  "keeps an AI review that committed before Stop reached the conversation, reports it succeeded and offers no retry",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const provider = slowReviewer(reviewOutput);
    const { command } = harness(runtime, async () => {}, provider.reviewer);
    const { id, group, read } = await approvedRun(database, command, applicationId);
    await provider.begun;
    // The conversation is held, so Stop queues for it first and the run's outcome queues behind it.
    const holder = await holdLock(database.client, lockConversation, id);
    const stopping = command({ action: "stop", id });
    await waitBlockedBy(database.client, holder, 1);
    provider.release();
    // The review commits while Stop has not yet reached the conversation; then the outcome waits too.
    await waitForReview(database.client);
    await waitBlockedBy(database.client, holder, 2);
    await database.client.query("commit");
    expect((await stopping).status).toBe(200);

    await vi.waitFor(
      async () =>
        expect((await read()).groups[0]?.actions[0]).toMatchObject({ status: "succeeded" }),
      { timeout: 10_000, interval: 50 },
    );
    expect((await read()).status).toBe("stopped");
    const [action] = (await read()).groups[0]?.actions ?? [];
    assert(action);
    expect(
      (await command({ action: "retry", id, previewId: group.id, actionId: action.id })).status,
    ).toBe(409);
    expect((await database.client.query("select id from ai_reviews")).rows).toHaveLength(1);
  },
);

it(
  "records a stopped action as succeeded when its worker died after the review committed, once its claim expires",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const provider = slowReviewer(reviewOutput);
    const { command, step, crash } = harness(runtime, async () => {}, provider.reviewer);
    const { id, group, read } = await approvedRun(database, command, applicationId);
    await provider.begun;
    const holder = await holdLock(database.client, lockConversation, id);
    provider.release();
    await waitForReview(database.client);
    // The worker waits to record the outcome; it dies there, as its connection is lost.
    await waitBlockedBy(database.client, holder, 1);
    crash();
    await database.client.query(
      "select pg_terminate_backend(pid) from (select distinct pid from pg_locks where not granted and $1 = any(pg_blocking_pids(pid))) as blocked",
      [holder],
    );
    await database.client.query("rollback");

    expect((await command({ action: "stop", id })).status).toBe(200);
    // While the claim is live another worker leaves the action alone.
    expect(await step(id)).toBe("waiting");
    expect((await read()).groups[0]?.actions[0]).toMatchObject({ status: "stopped" });

    await database.client.query(
      "update assistant_conversations set state = jsonb_set(state, '{groups,0,actions,0,executing,until}', '0') where id = $1",
      [id],
    );
    expect(await step(id)).toBe("progressed");

    const [action] = (await read()).groups[0]?.actions ?? [];
    assert(action);
    expect(action).toMatchObject({ status: "succeeded" });
    expect(provider.review).toHaveBeenCalledOnce();
    expect((await database.client.query("select id from ai_reviews")).rows).toHaveLength(1);
    expect(
      (await command({ action: "retry", id, previewId: group.id, actionId: action.id })).status,
    ).toBe(409);
  },
);

it(
  "keeps a stopped action stopped when its worker died before the review committed",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const provider = slowReviewer(reviewOutput);
    const { command, step } = harness(runtime, async () => {}, provider.reviewer);
    const { id, read } = await approvedRun(database, command, applicationId);
    await provider.begun;
    expect((await command({ action: "stop", id })).status).toBe(200);
    // The worker never reports back; its claim lapses.
    await database.client.query(
      "update assistant_conversations set state = jsonb_set(state, '{groups,0,actions,0,executing,until}', '0') where id = $1",
      [id],
    );
    await vi.waitFor(async () => expect(await step(id)).not.toBe("waiting"), {
      timeout: 10_000,
      interval: 50,
    });
    expect((await read()).groups[0]?.actions[0]).toMatchObject({ status: "stopped" });
    expect((await database.client.query("select id from ai_reviews")).rows).toEqual([]);
  },
);

it(
  "saves nothing when Stop arrives while a provider that ignores it answers",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    // This provider ignores the abort and answers anyway; the run still saves nothing.
    const provider = slowReviewer(reviewOutput, false);
    const { command } = harness(runtime, async () => {}, provider.reviewer);
    const { id, read } = await approvedRun(database, command, applicationId);
    await provider.begun;
    expect((await command({ action: "stop", id })).status).toBe(200);

    provider.release();

    await vi.waitFor(
      async () =>
        expect(
          (
            await database.client.query(
              "select 1 from assistant_conversations where id = $1 and state #> '{groups,0,actions,0,executing}' is null",
              [id],
            )
          ).rowCount,
        ).toBe(1),
      { timeout: 10_000, interval: 50 },
    );
    expect((await database.client.query("select id from ai_reviews")).rows).toEqual([]);
    expect((await read()).groups[0]?.actions[0]).toMatchObject({ status: "stopped" });
  },
);

it(
  "reports an expired claim as a failed action, never runs it again, and saves a review only when its retry is approved",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const crashed = slowReviewer(reviewOutput);
    const { command, step } = harness(runtime, async () => {}, crashed.reviewer);
    const { id, group, read } = await approvedRun(database, command, applicationId);
    await crashed.begun;
    // The worker dies mid-run: its claim lapses and its request never reports back.
    await database.client.query(
      "update assistant_conversations set state = jsonb_set(state, '{groups,0,actions,0,executing,until}', '0') where id = $1",
      [id],
    );
    expect(await step(id)).toBe("progressed");
    expect(crashed.review).toHaveBeenCalledOnce();
    const failed = (await read()).groups[0]?.actions[0];
    expect(failed).toMatchObject({ status: "failed", canRetry: true });
    assert(failed);
    expect((await database.client.query("select id from ai_reviews")).rows).toEqual([]);

    // Retrying asks for a fresh approval before anything is sent again.
    await vi.waitFor(
      async () => {
        await step(id);
        expect((await read()).status).toBe("completed");
      },
      { timeout: 10_000, interval: 50 },
    );
    expect(
      (await command({ action: "retry", id, previewId: group.id, actionId: failed.id })).status,
    ).toBe(202);
    const [, retried] = (
      await vi.waitFor(async () => {
        const saved = await read();
        expect(saved.status).toBe("awaiting_approval");
        return saved;
      })
    ).groups;
    assert(retried);
    expect((await database.client.query("select id from ai_reviews")).rows).toEqual([]);
    await command({ action: "approve", id, previewId: retried.id });
    await vi.waitFor(() => expect(crashed.review).toHaveBeenCalledTimes(2), {
      timeout: 10_000,
      interval: 50,
    });
    crashed.release();
    await vi.waitFor(
      async () =>
        expect((await database.client.query("select id from ai_reviews")).rows).toHaveLength(1),
      { timeout: 10_000, interval: 50 },
    );
  },
);

/** What a worker that saved its review under the action's run identity and then died leaves behind. */
const savedByDeadWorker = async (
  runtime: Runtime,
  applicationId: string,
  action: z.infer<typeof snapshot>["groups"][number]["actions"][number],
) =>
  runAiReview(
    (operation) => withDatabase(runtime, operation),
    actor,
    {
      workspaceSlug,
      publicId: applicationId,
      runId: z.uuid().parse(action.preview.input.runId),
    },
    {
      reviewer: {
        provider: "OpenAI",
        model: "scripted",
        review: async (request) => reviewOutput(request),
      },
    },
  );

it(
  "records an expired claim as succeeded with the review its run had already saved, without asking the provider again",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const crashed = slowReviewer(reviewOutput, false);
    const { command, step } = harness(runtime, async () => {}, crashed.reviewer);
    const { id, read } = await approvedRun(database, command, applicationId);
    await crashed.begun;
    const [started] = (await read()).groups[0]?.actions ?? [];
    assert(started);
    // The worker saved the review under the action's run identity, then died before it could say so.
    const saved = await savedByDeadWorker(runtime, applicationId, started);
    assert(saved.status === "ok");
    await database.client.query(
      "update assistant_conversations set state = jsonb_set(state, '{groups,0,actions,0,executing,until}', '0') where id = $1",
      [id],
    );

    expect(await step(id)).toBe("progressed");

    const [action] = (await read()).groups[0]?.actions ?? [];
    expect(action).toMatchObject({ status: "succeeded", canRetry: false });
    expect(crashed.review).toHaveBeenCalledOnce();
    expect((await database.client.query("select id from ai_reviews")).rows).toEqual([
      { id: saved.review.id },
    ]);
    // The conversation goes on to cite the review it recorded, never to report a failure.
    await vi.waitFor(
      async () => {
        await step(id);
        expect((await read()).status).toBe("completed");
      },
      { timeout: 10_000, interval: 50 },
    );
    expect((await read()).messages.at(-1)?.citations).toMatchObject([{ kind: "ai_review" }]);
  },
);

it(
  "returns the saved review when an approved retry follows a worker that died after saving, without a second review",
  { timeout: 30_000 },
  async ({ database, runtime, committee: { applicationId } }) => {
    const provider = slowReviewer(reviewOutput, false);
    const { command, step } = harness(runtime, async () => {}, provider.reviewer);
    const { id, group, read } = await approvedRun(database, command, applicationId);
    await provider.begun;
    // The claim lapses while the run is still under way, so the conversation reports it failed.
    await database.client.query(
      "update assistant_conversations set state = jsonb_set(state, '{groups,0,actions,0,executing,until}', '0') where id = $1",
      [id],
    );
    expect(await step(id)).toBe("progressed");
    await vi.waitFor(
      async () => {
        await step(id);
        expect((await read()).status).toBe("completed");
      },
      { timeout: 10_000, interval: 50 },
    );
    const failed = (await read()).groups[0]?.actions[0];
    expect(failed).toMatchObject({ status: "failed", canRetry: true });
    assert(failed);

    // The worker saved the review after all, but nothing records its outcome on the action.
    assert((await savedByDeadWorker(runtime, applicationId, failed)).status === "ok");
    expect((await database.client.query("select id from ai_reviews")).rows).toHaveLength(1);
    expect((await read()).groups[0]?.actions[0]?.status).toBe("failed");

    expect(
      (await command({ action: "retry", id, previewId: group.id, actionId: failed.id })).status,
    ).toBe(202);
    const retried = (
      await vi.waitFor(async () => {
        const saved = await read();
        expect(saved.status).toBe("awaiting_approval");
        return saved;
      })
    ).groups[1];
    assert(retried);
    await command({ action: "approve", id, previewId: retried.id });
    await vi.waitFor(
      async () => expect((await read()).groups[1]?.actions[0]?.status).toBe("succeeded"),
      {
        timeout: 10_000,
        interval: 50,
      },
    );
    // The retry carried the approved action's run identity: the saved review answered it, and no
    // provider was asked again.
    expect(provider.review).toHaveBeenCalledOnce();
    expect((await database.client.query("select id from ai_reviews")).rows).toHaveLength(1);
  },
);
