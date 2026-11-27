import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { afterAll, assert, beforeAll, expect, onTestFinished, vi } from "vite-plus/test";
import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { withDatabase, type Database } from "@merit/db";
import { contactWork } from "@merit/grantmaking/testing/contact-work";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview, type ReviewerMessageWork } from "@merit/reviews/server";
import { inlineReviewerDelivery } from "@merit/reviews/testing";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import {
  readTestTemporalConfig,
  startTestWorker,
  storedHistoryIncludes,
  uniqueName,
  type TestWorker,
} from "@merit/workflows/testing";

import { assistantConversationWorkflowId } from "../src/server/assistant/conversation-work";
import { createAssistantHost, createAssistantRuntime } from "../src/server/assistant/host.server";
import type { AssistantCommand } from "../src/server/assistant/http.server";
import { createBackgroundWork } from "../src/server/background-work.server";
import { reviewerMessageDelivery } from "../src/server/services.server";
import { createActivities } from "../src/worker/activities";
import { createAssistantActivities } from "../src/worker/assistant-activities";
import { assistantTurnConcurrency } from "../src/worker/task-queue";

// Runs against the Compose Temporal service: `docker compose up -d --wait`.
const config = readTestTemporalConfig(process.env);
const workflowsPath = fileURLToPath(
  new URL("../src/worker/workflows.workflow.ts", import.meta.url),
);
const queues = { main: uniqueName("assistant"), turns: uniqueName("assistant-turns") };

// Short pacing keeps each test to seconds; production waits longer between looks.
const timing = {
  stepTimeoutMs: 60_000,
  // The turn activity heartbeats three times per timeout, so a cancelled step ends within 1 s.
  heartbeatTimeoutMs: 3000,
  idleInitialMs: 100,
  idleMaxMs: 300,
  maxFailures: 3,
  stepsPerRun: 100,
};

type Turns = ReturnType<typeof createAssistantRuntime>["turns"];

/** What the one shared worker does for the test that is running. */
const current: {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  advance: Turns["advance"];
  running: (limit: number, after?: string) => ReturnType<TestStore["running"]>;
  background: ReturnType<typeof createBackgroundWork>;
} = {
  database: () => Promise.reject(new Error("No test is running.")),
  advance: () => Promise.reject(new Error("No test is running.")),
  running: () => Promise.reject(new Error("No test is running.")),
  background: undefined as never,
};

type TestStore = ReturnType<typeof createAssistantRuntime>["store"];

let worker: TestWorker;

const startWorker = () =>
  startTestWorker(config, {
    workflows: { workflowsPath },
    taskQueue: queues.main,
    // A stopped worker abandons a turn in flight after a second, as a crashed one would.
    shutdownForceTime: "1s",
    activities: createActivities({
      database: (operation) => current.database(operation),
      reviewerMessages: {
        database: (operation) => current.database(operation),
        send: async () => {},
        reviewerUrl: () => "",
        managerUrl: () => "",
      },
      invitations: {
        database: (operation) => current.database(operation),
        sendInvitation: async () => {},
        invitationUrl: (token) => token,
      },
      assistant: {
        configured: true,
        running: (limit, after) => current.running(limit, after),
        wake: (work) => current.background.wakeAssistantConversation(work),
      },
      invitationDispatch: { invitationKey: () => config.payloadKey, start: async () => false },
      reconcileReviewerMessage: async () => "exists",
    }),
    activityQueues: [
      {
        taskQueue: queues.turns,
        activities: createAssistantActivities({
          configured: true,
          turns: { advance: (...address) => current.advance(...address) },
        }),
        maxConcurrentActivities: assistantTurnConcurrency,
      },
    ],
  });

beforeAll(async () => {
  worker = await startWorker();
}, 120_000);

afterAll(async () => {
  await worker.stop();
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

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const source = z.object({ key: z.string() });

/** An answer that cites every source the model has been shown, as the assistant requires. */
const cited = (text: string) => async (url: RequestInfo | URL, init?: RequestInit) => {
  const body: unknown = await new Request(url, init).json();
  const { messages } = z
    .object({ messages: z.array(z.object({ role: z.string(), content: z.string().nullable() })) })
    .parse(body);
  const keys = messages
    .filter((message) => message.role === "tool")
    .flatMap(
      (message) =>
        z.object({ evidence: z.array(source) }).parse(JSON.parse(message.content ?? "")).evidence,
    )
    .map((item) => `[${item.key}]`);
  return answer(`${text} ${keys.join(" ")}`.trim());
};

const snapshot = z.object({
  id: z.string(),
  status: z.string(),
  messages: z.array(z.object({ role: z.string(), text: z.string() })),
  groups: z.array(
    z.object({
      id: z.string(),
      actions: z.array(z.object({ id: z.string(), status: z.string() })),
    }),
  ),
});

const it = roundTest
  .extend("runtime", { scope: "file" }, async ({ database }) => database.createRuntimeConnection())
  .extend("scenario", async ({ database, db, rounds, runtime }) => {
    const address = await rounds.createApplication("Community gardens");
    const contactId = randomUUID();
    const contact = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug,
        contactId,
        action: "create",
        details: { name: "Sam", email: "sam@example.test", affiliation: "" },
      },
      contactWork,
    );
    assert(contact.status === "ok");
    await database.client.query(
      "insert into app_users (id, name, clerk_user_id) values ('sam','Sam','sam')",
    );
    await database.client.query(
      "insert into memberships (organization_id, user_id, email, role) values ('alder','sam','sam@example.test','reviewer')",
    );
    const requestId = randomUUID();
    const request = await saveApplicationReview(db, actor, {
      ...address,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: { action: "request", id: requestId, contactId, replacesId: null },
    });
    assert(request.status === "ok");
    await database.client.query(
      "insert into memberships (organization_id, user_id, role, administration) values ('alder','birch-manager','member','administrator')",
    );

    const run = <T>(operation: (db: Database) => Promise<T>) => withDatabase(runtime, operation);

    const delivered: string[] = [];
    // `hold` keeps an assistant invitation pending until the test lets the email through, as a
    // slow provider does; `failing` makes the send fail, so the message is recorded as failed.
    const mail: { hold: boolean; failing: boolean; held?: ReviewerMessageWork } = {
      hold: false,
      failing: false,
    };
    const deliverInline = inlineReviewerDelivery(
      reviewerMessageDelivery({
        database: run,
        invitationOrigin: "https://merit.test",
        sendEmail: async ({ to }) => {
          if (mail.failing) {
            throw new Error("The provider is down.");
          }
          delivered.push(to);
        },
      }),
    );

    const startInline = async (work: ReviewerMessageWork) => {
      if (mail.hold) {
        mail.held = work;
        return true;
      }
      return deliverInline(work);
    };

    const dependencies = {
      database: run,
      invitationOrigin: "https://merit.test",
      startReviewerMessage: startInline,
      startOrganizationInvitation: async () => true,
    };
    const model = { apiKey: "test", model: "scripted" };
    const driver = createAssistantRuntime(dependencies, model);
    const background = createBackgroundWork({
      client: () => worker.client,
      taskQueue: queues.main,
      turnTaskQueue: queues.turns,
      assistantTiming: timing,
    });
    current.database = run;
    current.advance = (...args) => driver.turns.advance(...args);
    current.running = (limit, after) => driver.store.running(limit, after);
    current.background = background;

    const fetchModel = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchModel);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });

    const host = createAssistantHost(
      {
        ...dependencies,
        wakeConversation: background.wakeAssistantConversation,
        cancelConversation: background.cancelAssistantTurn,
      },
      model,
    );

    const command = (input: AssistantCommand, who = actor) =>
      host.command(who, workspaceSlug, input, new AbortController().signal);

    const admin = { userId: "birch-manager" };
    expect((await command({ action: "set_consent", enabled: true }, admin)).status).toBe(200);

    const create = async () =>
      snapshot.parse(await (await command({ action: "create" })).json()).id;

    const open = async (id: string) =>
      snapshot.parse(await (await command({ action: "open", id })).json());

    const begin = async (id: string, message: string) =>
      expect((await command({ action: "start", id, message })).status).toBe(202);

    const settled = (id: string) =>
      vi.waitFor(
        async () => {
          const saved = await open(id);
          expect(saved.status).not.toBe("running");
          return saved;
        },
        { timeout: 15_000, interval: 50 },
      );

    const workflowId = assistantConversationWorkflowId;

    const status = async (id: string) =>
      (await worker.client.workflow.getHandle(workflowId(id)).describe()).status.name;

    const closed = (id: string) =>
      vi.waitFor(async () => expect(await status(id)).toBe("COMPLETED"), {
        timeout: 15_000,
        interval: 50,
      });

    const history = (id: string, text: string) =>
      storedHistoryIncludes(worker.client, workflowId(id), config.namespace, text);

    return {
      applicationId: address.publicId,
      requestId,
      rounds,
      database,
      delivered,
      mail,
      release: async () => {
        // The conversation asks for the message, which starts it, within a step or two of Stop.
        const held = await vi.waitFor(
          () => {
            assert(mail.held);
            return mail.held;
          },
          { timeout: 10_000, interval: 50 },
        );
        // A repeated start joins the held delivery until its outcome is durable.
        await deliverInline(held);
        mail.hold = false;
      },
      driver,
      background,
      fetchModel,
      command,
      admin,
      create,
      open,
      begin,
      settled,
      status,
      closed,
      history,
    };
  });

const roundCall = (roundId: string) => calls(["list_applications", { roundId }]);

it(
  "runs each step of a started turn in a workflow, which ends when the turn completes",
  { timeout: 30_000 },
  async ({ scenario: s, rounds }) => {
    const secret = "Which applications mention SECRET-TOKEN-4711?";
    s.fetchModel
      .mockResolvedValueOnce(roundCall(rounds.pageInput.publicId))
      .mockImplementationOnce(cited("Nothing needs attention."));
    const id = await s.create();

    await s.begin(id, secret);

    const done = await s.settled(id);
    expect(done.status).toBe("completed");
    expect(done.messages.at(-1)?.text).toContain("Nothing needs attention.");
    expect(s.fetchModel).toHaveBeenCalledTimes(2);
    await s.closed(id);
    // The stored history is the proof that the messages stayed in Postgres.
    expect(await s.history(id, id)).toBe(true);
    expect(await s.history(id, "SECRET-TOKEN-4711")).toBe(false);
    expect(await s.history(id, "Nothing needs attention")).toBe(false);
    expect(await s.history(id, "birch-manager")).toBe(false);
  },
);

it(
  "starts another workflow run when a finished conversation is asked again",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    s.fetchModel.mockResolvedValueOnce(answer("First.")).mockResolvedValueOnce(answer("Second."));
    const id = await s.create();
    await s.begin(id, "One?");
    await s.settled(id);
    await s.closed(id);

    await s.begin(id, "Two?");

    expect((await s.settled(id)).messages.at(-1)?.text).toBe("Second.");
    await s.closed(id);
  },
);

it(
  "continues as new to bound its history and still completes the turn",
  { timeout: 30_000 },
  async ({ scenario: s, rounds }) => {
    const small = createBackgroundWork({
      client: () => worker.client,
      taskQueue: queues.main,
      turnTaskQueue: queues.turns,
      assistantTiming: { ...timing, stepsPerRun: 1 },
    });
    s.fetchModel
      .mockResolvedValueOnce(roundCall(rounds.pageInput.publicId))
      .mockImplementationOnce(cited("Done."));
    const id = await s.create();
    // The host wakes with the injected pacing; start by hand with one step per run.
    const started = await s.driver.turns.start(actor, workspaceSlug, id, { message: "Go." });
    assert(started);

    await small.wakeAssistantConversation({
      userId: actor.userId,
      workspaceSlug,
      conversationId: id,
    });

    expect((await s.settled(id)).status).toBe("completed");
    await s.closed(id);
    const [first] =
      (await worker.client.workflow.getHandle(assistantConversationWorkflowId(id)).fetchHistory())
        .events ?? [];
    expect(first?.workflowExecutionStartedEventAttributes?.continuedExecutionRunId).toBeTruthy();
  },
);

it(
  "waits for approval, then resumes when the preview is approved",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    s.fetchModel.mockResolvedValueOnce(
      calls([
        "invite_reviewer",
        {
          applicationId: s.applicationId,
          requestId: s.requestId,
          commandId: randomUUID(),
          dueDate: null,
        },
      ]),
    );
    const id = await s.create();
    await s.begin(id, "Invite Sam.");
    const waiting = await s.settled(id);
    expect(waiting.status).toBe("awaiting_approval");
    await s.closed(id);
    const [group] = waiting.groups;
    assert(group);
    s.fetchModel.mockImplementationOnce(cited("Sam was invited."));

    expect((await s.command({ action: "approve", id, previewId: group.id })).status).toBe(202);

    const done = await s.settled(id);
    expect(done.status).toBe("completed");
    expect(done.groups[0]?.actions.map((action) => action.status)).toEqual(["succeeded"]);
    expect(s.delivered).toEqual(["sam@example.test"]);
    await s.closed(id);
  },
);

/** A model request that ends only when it is aborted, as a real request does. */
const held =
  (requests: Array<AbortSignal | null | undefined>) => (_url: unknown, init?: RequestInit) => {
    requests.push(init?.signal);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  };

it(
  "aborts the in-flight model request when the turn is stopped",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    const requests: Array<AbortSignal | null | undefined> = [];
    s.fetchModel.mockImplementationOnce(held(requests)).mockResolvedValue(answer("Late."));
    const id = await s.create();
    await s.begin(id, "Think.");
    await vi.waitFor(() => expect(s.fetchModel).toHaveBeenCalledTimes(1));
    expect(requests[0]?.aborted).toBe(false);

    expect((await s.command({ action: "stop", id })).status).toBe(200);

    // The web process holds no request: the workflow cancels the activity, which aborts it.
    await vi.waitFor(() => expect(requests[0]?.aborted).toBe(true), {
      timeout: 10_000,
      interval: 50,
    });
    await s.closed(id);
    expect((await s.open(id)).status).toBe("stopped");
    expect(s.fetchModel).toHaveBeenCalledTimes(1);
  },
);

it(
  "aborts the in-flight model request when the conversation is deleted",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    const requests: Array<AbortSignal | null | undefined> = [];
    s.fetchModel.mockImplementationOnce(held(requests)).mockResolvedValue(answer("Late."));
    const id = await s.create();
    await s.begin(id, "Think.");
    await vi.waitFor(() => expect(s.fetchModel).toHaveBeenCalledTimes(1));

    expect((await s.command({ action: "delete", id })).status).toBe(200);

    await vi.waitFor(() => expect(requests[0]?.aborted).toBe(true), {
      timeout: 10_000,
      interval: 50,
    });
    await s.closed(id);
  },
);

it(
  "answers afresh and promptly when asked again after a stop",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    const requests: Array<AbortSignal | null | undefined> = [];
    s.fetchModel.mockImplementationOnce(held(requests)).mockResolvedValue(answer("Fresh."));
    const id = await s.create();
    await s.begin(id, "Think.");
    await vi.waitFor(() => expect(s.fetchModel).toHaveBeenCalledTimes(1));
    expect((await s.command({ action: "stop", id })).status).toBe(200);

    const asked = Date.now();
    await s.begin(id, "Again?");

    expect((await s.settled(id)).messages.at(-1)?.text).toBe("Fresh.");
    // Far below the 90 s a request would otherwise be held.
    expect(Date.now() - asked).toBeLessThan(15_000);
    expect(s.fetchModel).toHaveBeenCalledTimes(2);
    await s.closed(id);
  },
);

it(
  "stops every member's running work when workspace consent is withdrawn",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    const requests: Array<AbortSignal | null | undefined> = [];
    s.fetchModel.mockImplementationOnce(held(requests)).mockResolvedValue(answer("Late."));
    const id = await s.create();
    await s.begin(id, "Think.");
    await vi.waitFor(() => expect(s.fetchModel).toHaveBeenCalledTimes(1));

    // The administrator, not the chat's owner, withdraws consent.
    expect((await s.command({ action: "set_consent", enabled: false }, s.admin)).status).toBe(200);

    await vi.waitFor(() => expect(requests[0]?.aborted).toBe(true), {
      timeout: 10_000,
      interval: 50,
    });
    await s.closed(id);
    expect(s.fetchModel).toHaveBeenCalledTimes(1);
    expect(await s.driver.store.running(100)).toEqual([]);
  },
);

it(
  "resumes a turn after the worker restarts mid-step",
  { timeout: 60_000 },
  async ({ scenario: s, database }) => {
    s.fetchModel
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValue(answer("Resumed."));
    const id = await s.create();
    await s.begin(id, "Think.");
    await vi.waitFor(() => expect(s.fetchModel).toHaveBeenCalledTimes(1));

    await worker.stop();
    // The abandoned model attempt holds a two-minute lease; let it lapse as time would.
    await database.client.query(
      "update assistant_conversations set state = jsonb_set(state, '{modelAttempt,until}', '0') where id = $1",
      [id],
    );
    worker = await startWorker();

    const done = await s.settled(id);
    expect(done.messages.at(-1)?.text).toBe("Resumed.");
    await s.closed(id);
  },
);

it(
  "recovers a missed start when reconciliation wakes running conversations",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    s.fetchModel.mockResolvedValue(answer("Recovered."));
    const id = await s.create();
    // The request committed, but its wake never reached Temporal.
    expect(await s.driver.turns.start(actor, workspaceSlug, id, { message: "Go." })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await s.open(id)).status).toBe("running");
    expect(s.fetchModel).not.toHaveBeenCalled();

    await worker.client.workflow.execute("reconcile", {
      taskQueue: queues.main,
      workflowId: uniqueName("reconcile"),
    });

    expect((await s.settled(id)).messages.at(-1)?.text).toBe("Recovered.");
    await s.closed(id);
  },
);

it("runs at most four turns at once", { timeout: 60_000 }, async ({ scenario: s }) => {
  let active = 0;
  let busiest = 0;
  const gate = deferred<void>();
  s.fetchModel.mockImplementation(async () => {
    active += 1;
    busiest = Math.max(busiest, active);
    await gate.promise;
    active -= 1;
    return answer("Done.");
  });
  const ids = [];
  for (let index = 0; index < 6; index += 1) {
    ids.push(await s.create());
  }
  for (const id of ids) {
    await s.begin(id, "Think.");
  }

  await vi.waitFor(() => expect(active).toBe(assistantTurnConcurrency), { timeout: 15_000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(active).toBe(assistantTurnConcurrency);
  expect(s.fetchModel).toHaveBeenCalledTimes(assistantTurnConcurrency);

  gate.resolve();
  for (const id of ids) {
    expect((await s.settled(id)).status).toBe("completed");
  }
  expect(busiest).toBe(assistantTurnConcurrency);
});

it(
  "gives up after repeated failures and leaves the conversation to reconciliation",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    const advance = current.advance;
    current.advance = () => Promise.reject(new Error("The database is down."));
    const id = await s.create();
    await s.driver.turns.start(actor, workspaceSlug, id, { message: "Go." });

    await s.background.wakeAssistantConversation({
      userId: actor.userId,
      workspaceSlug,
      conversationId: id,
    });

    await s.closed(id);
    expect(await s.open(id)).toMatchObject({ status: "running" });
    current.advance = advance;
    s.fetchModel.mockResolvedValue(answer("Back."));
    await worker.client.workflow.execute("reconcile", {
      taskQueue: queues.main,
      workflowId: uniqueName("reconcile"),
    });
    expect((await s.settled(id)).messages.at(-1)?.text).toBe("Back.");
  },
);

/** The conversation's invitation action, once it has reached `status`. */
const actionIn = async (
  s: { open: (id: string) => Promise<z.infer<typeof snapshot>> },
  id: string,
  status: string,
) =>
  vi.waitFor(
    async () => {
      const action = (await s.open(id)).groups[0]?.actions[0];
      expect(action?.status).toBe(status);
      return action;
    },
    { timeout: 15_000, interval: 50 },
  );

const invitation = (s: { applicationId: string; requestId: string }) =>
  calls([
    "invite_reviewer",
    {
      applicationId: s.applicationId,
      requestId: s.requestId,
      commandId: randomUUID(),
      dueDate: null,
    },
  ]);

it(
  "records an invitation that is sent after Stop, and finishes once it has",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    s.fetchModel.mockResolvedValueOnce(invitation(s));
    const id = await s.create();
    await s.begin(id, "Invite Sam.");
    const [group] = (await s.settled(id)).groups;
    assert(group);
    s.mail.hold = true;
    expect((await s.command({ action: "approve", id, previewId: group.id })).status).toBe(202);
    await actionIn(s, id, "delivering");

    expect((await s.command({ action: "stop", id })).status).toBe(200);
    expect((await s.open(id)).status).toBe("stopped");
    // The workflow stays up only to settle the delivery: it makes no model call.
    expect(await s.status(id)).toBe("RUNNING");

    await s.release();
    await actionIn(s, id, "succeeded");
    expect((await s.open(id)).status).toBe("stopped");
    expect(s.delivered).toEqual(["sam@example.test"]);
    await s.closed(id);
    expect(s.fetchModel).toHaveBeenCalledTimes(1);
  },
);

it(
  "records an invitation that fails after Stop and lets the chat retry it",
  { timeout: 30_000 },
  async ({ scenario: s }) => {
    s.fetchModel.mockResolvedValueOnce(invitation(s));
    const id = await s.create();
    await s.begin(id, "Invite Sam.");
    const [group] = (await s.settled(id)).groups;
    assert(group);
    s.mail.hold = true;
    s.mail.failing = true;
    expect((await s.command({ action: "approve", id, previewId: group.id })).status).toBe(202);
    await actionIn(s, id, "delivering");
    expect((await s.command({ action: "stop", id })).status).toBe(200);

    await s.release();
    const failed = await actionIn(s, id, "failed");
    assert(failed);
    expect((await s.open(id)).status).toBe("stopped");
    await s.closed(id);
    expect(s.delivered).toEqual([]);

    s.mail.failing = false;
    s.fetchModel.mockImplementationOnce(cited("Sam was invited."));
    expect(
      (await s.command({ action: "retry", id, previewId: group.id, actionId: failed.id })).status,
    ).toBe(202);
    expect((await s.settled(id)).status).toBe("completed");
    expect((await s.open(id)).groups[0]?.actions[0]?.status).toBe("succeeded");
    expect(s.delivered).toEqual(["sam@example.test"]);
  },
);
