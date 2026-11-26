import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { afterAll, assert, beforeAll, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { withDatabase, type Database } from "@merit/db";
import { contactWork } from "@merit/grantmaking/testing/contact-work";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import { actor } from "@merit/organizations/testing/workspace";
import type { ReviewerMessage } from "@merit/reviews/api";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import {
  createReviewerService,
  deliverCommittedReviewerMessage,
  listPendingReviewerMessageWork,
  saveApplicationReview,
  type ReviewerDelivery,
} from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import {
  readStoredFailures,
  readTestTemporalConfig,
  startTestWorker,
  storedHistoryIncludes,
  uniqueName,
  type TestWorker,
} from "@merit/workflows/testing";

import { createBackgroundWork } from "../src/server/background-work.server";
import { createActivities } from "../src/worker/activities";

// Runs against the Compose Temporal service: `docker compose up -d --wait`.
const config = readTestTemporalConfig(process.env);
const workflowsPath = fileURLToPath(
  new URL("../src/worker/workflows.workflow.ts", import.meta.url),
);

// Short timings keep the retry window to seconds; production uses about 15 minutes.
const timing = {
  attemptTimeoutMs: 2000,
  windowMs: 2500,
  initialIntervalMs: 200,
  maximumIntervalMs: 400,
};
const wait = { timeoutMs: 8000, intervalMs: 50 };

type Mail = { id: string; to: string; kind: ReviewerMessage["kind"] };

/** What the one shared worker does for the test that is running. */
const current: {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  send: (message: ReviewerMessage) => Promise<void>;
  background: ReturnType<typeof createBackgroundWork>;
  /** Holds a run open after its failure was recorded, until the test releases it. */
  afterFailure?: Promise<void>;
} = {
  database: () => Promise.reject(new Error("No test is running.")),
  send: () => Promise.reject(new Error("No test is running.")),
  background: undefined as never,
};

let worker: TestWorker;

beforeAll(async () => {
  const database: typeof current.database = (operation) => current.database(operation);

  const base = createActivities({
    database,
    reviewerMessages: {
      database,
      send: (message) => current.send(message),
      reviewerUrl: (slug, id) => `https://merit.test/app/${slug}/work/${id}`,
      managerUrl: (slug, id) => `https://merit.test/app/${slug}/applications/${id}`,
    },
    invitations: {
      database,
      sendInvitation: async () => {},
      invitationUrl: (token) => token,
    },
    assistant: { configured: false, running: async () => [], wake: async () => true },
    reconcileReviewerMessage: (work) => current.background.reconcileReviewerMessage(work),
  });
  const activities = {
    ...base,
    // The failure is committed, and the run stays open, as when its workflow task is delayed.
    failReviewerMessage: async (work: Parameters<typeof base.failReviewerMessage>[0]) => {
      const outcome = await base.failReviewerMessage(work);
      await current.afterFailure;
      return outcome;
    },
  };
  worker = await startTestWorker(config, { workflows: { workflowsPath }, activities });
}, 120_000);

afterAll(async () => {
  await worker.stop();
});

const sam = { userId: "sam" };

const it = roundTest
  .extend("runtime", { scope: "file" }, async ({ database }) => database.createRuntimeConnection())
  .extend("scenario", async ({ db, database, rounds, runtime }) => {
    await database.client.query(
      "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('sam','Sam Morgan','sam-account')",
    );
    await database.client.query(
      "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'sam', 'sam@example.test', 'reviewer')",
    );
    const address = await rounds.createApplication("Community review");
    const created = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug: "alder",
        action: "create",
        contactId: randomUUID(),
        details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
      },
      contactWork,
    );
    assert(created.status === "ok");
    const requestId = randomUUID();
    expect(
      await saveApplicationReview(db, actor, {
        ...address,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
        change: {
          action: "request",
          id: requestId,
          contactId: created.contact.id,
          replacesId: null,
        },
      }),
    ).toMatchObject({ status: "ok" });

    const run = <T>(operation: (db: Database) => Promise<T>) => withDatabase(runtime, operation);

    const mail: Mail[] = [];
    const behavior = { fail: false };
    current.database = run;
    current.send = async (message) => {
      mail.push({ id: message.id, to: message.to, kind: message.kind });
      if (behavior.fail) {
        throw new Error("Sender unavailable");
      }
    };
    const background = createBackgroundWork({
      client: () => worker.client,
      taskQueue: worker.taskQueue,
      reviewerMessageTiming: timing,
    });
    current.background = background;
    current.afterFailure = undefined;

    const serviceWith = (
      start = background.startReviewerMessage,
      deferDelivery?: (d: ReviewerDelivery) => void,
    ) =>
      createReviewerService({
        database: run,
        start,
        wait,
        ...(deferDelivery ? { deferDelivery } : {}),
      });

    const service = serviceWith();
    const invitation = { ...address, requestId, commandId: randomUUID(), dueDate: "2027-01-01" };

    const status = async (id: string) =>
      (
        await database.client.query<{ status: string }>(
          "SELECT status FROM reviewer_messages WHERE id = $1",
          [id],
        )
      ).rows[0]?.status;

    const history = (id: string, text: string) =>
      storedHistoryIncludes(worker.client, `reviewer-message:${id}`, config.namespace, text);

    const manage = async (
      assignmentId: string,
      action: "cancel" | "resend" | "retry_notification",
      using = service,
    ) => {
      const list = await using.forApplication(actor, address);
      assert(list.status === "ok");
      const found = list.value.find((value) => value.id === assignmentId);
      assert(found);
      return using.manage(actor, {
        ...address,
        assignmentId,
        commandId: randomUUID(),
        expectedRevision: found.revision,
        action,
        note: "",
      });
    };

    // Resends are limited to one per recipient each minute.
    const backdateMessages = (assignmentId: string) =>
      database.client.query(
        "UPDATE reviewer_messages SET created_at = now() - interval '2 minutes' WHERE assignment_id = $1",
        [assignmentId],
      );

    /** A submitted assessment whose notice failed, so the manager has a notification to retry. */
    const failedNotice = async () => {
      const invited = await service.invite(actor, invitation);
      assert(invited.status === "ok");
      const assignmentId = invited.value.id;

      const read = async () => {
        const page = await service.read(sam, { assignmentId });
        assert(page.status === "ok");
        return page.value;
      };

      expect(
        await service.respond(sam, {
          assignmentId,
          commandId: randomUUID(),
          expectedRevision: (await read()).assignment.revision,
          action: "accept",
          note: "",
        }),
      ).toMatchObject({ status: "ok" });
      const page = await read();
      assert(page.draft);
      expect(
        await service.saveDraft(sam, {
          assignmentId,
          commandId: randomUUID(),
          expectedDraftRevision: page.draft.revision,
          draft: {
            position: "Fund",
            amount: "40.00",
            reasoning: "Strong evidence",
            observations: [],
            note: "",
          },
        }),
      ).toMatchObject({ status: "ok" });

      behavior.fail = true;
      mail.length = 0;
      const submitted = await service.submit(sam, {
        assignmentId,
        commandId: randomUUID(),
        expectedDraftRevision: (await read()).draft?.revision ?? 0,
      });
      expect(submitted).toMatchObject({ status: "ok" });
      expect((await read()).assignment.notification).toBe("failed");
      const noticeId = mail[0]?.id;
      assert(noticeId);

      return { assignmentId, noticeId, read };
    };

    return {
      address,
      backdateMessages,
      background,
      database,
      failedNotice,
      history,
      invitation,
      mail,
      manage,
      run,
      service,
      serviceWith,
      status,
      behavior,
    };
  });

const closed = (id: string) => worker.client.workflow.getHandle(`reviewer-message:${id}`).result();

it("delivers a committed invitation through its workflow and records the outcome", async ({
  scenario: s,
}) => {
  const invited = await s.service.invite(actor, s.invitation);

  assert(invited.status === "ok");
  expect(invited.value.delivery).toBe("sent");
  expect(s.mail).toEqual([
    { id: s.invitation.commandId, to: "sam@example.test", kind: "invitation" },
  ]);
  expect(await closed(s.invitation.commandId)).toBe("sent");
  expect(await s.status(s.invitation.commandId)).toBe("sent");
});

it("keeps addresses, names and titles out of the stored history", async ({ scenario: s }) => {
  await s.service.invite(actor, s.invitation);
  await closed(s.invitation.commandId);

  for (const text of ["sam@example.test", "Sam Morgan", "Community review", "Community group"]) {
    expect(await s.history(s.invitation.commandId, text)).toBe(false);
  }
  expect(await s.history(s.invitation.commandId, s.invitation.commandId)).toBe(true);
});

it("retries a failing send, leaves the message pending meanwhile, then records failed", async ({
  scenario: s,
}) => {
  s.behavior.fail = true;
  const statuses: Array<string | undefined> = [];
  // The request waits for the first outcome, which only the end of the window brings.
  const invited = await s.service.invite(actor, s.invitation);

  assert(invited.status === "ok");
  statuses.push(invited.value.delivery);
  expect(statuses).toEqual(["failed"]);
  expect(s.mail.length).toBeGreaterThan(1);
  expect(new Set(s.mail.map((mail) => mail.id))).toEqual(new Set([s.invitation.commandId]));
  expect(await s.status(s.invitation.commandId)).toBe("failed");
  expect(await closed(s.invitation.commandId)).toBe("failed");

  // Failure text and stacks reach the stored history only as encrypted attributes.
  const failures = await readStoredFailures(
    worker.client,
    `reviewer-message:${s.invitation.commandId}`,
    config.namespace,
  );
  expect(failures.length).toBeGreaterThan(0);
  for (const failure of failures) {
    if (failure.encodedAttributes) {
      expect(failure.message).toBe("Encoded failure");
    }
  }
  expect(await s.history(s.invitation.commandId, "Sender unavailable")).toBe(false);
});

it("answers pending when the wait ends before the retries do", async ({ scenario: s }) => {
  s.behavior.fail = true;
  const impatient = createReviewerService({
    database: s.run,
    start: s.background.startReviewerMessage,
    wait: { timeoutMs: 300, intervalMs: 50 },
  });

  const invited = await impatient.invite(actor, s.invitation);

  assert(invited.status === "ok");
  expect(invited.value.delivery).toBe("pending");
  expect(await s.status(s.invitation.commandId)).toBe("pending");
  await closed(s.invitation.commandId);
  expect(await s.status(s.invitation.commandId)).toBe("failed");
});

it("resends with a new message and its own workflow once the first one failed", async ({
  scenario: s,
}) => {
  s.behavior.fail = true;
  const invited = await s.service.invite(actor, s.invitation);
  assert(invited.status === "ok");
  expect(invited.value.delivery).toBe("failed");

  s.behavior.fail = false;
  s.mail.length = 0;
  await s.backdateMessages(invited.value.id);
  const resent = await s.manage(invited.value.id, "resend");

  assert(resent.status === "ok");
  expect(resent.value.delivery).toBe("sent");
  expect(s.mail).toHaveLength(1);
  expect(s.mail[0]?.id).not.toBe(s.invitation.commandId);
  expect(await closed(s.mail[0]?.id ?? "")).toBe("sent");
});

it("retries a failed submission notice in place, with the same message ID", async ({
  scenario: s,
}) => {
  const { assignmentId, noticeId } = await s.failedNotice();

  const token = async () =>
    (
      await s.database.client.query<{ delivery_token: string; status: string }>(
        "SELECT delivery_token, status FROM reviewer_messages WHERE id = $1",
        [noticeId],
      )
    ).rows[0];

  const before = await token();
  expect(before?.status).toBe("failed");

  s.behavior.fail = false;
  s.mail.length = 0;
  const retried = await s.manage(assignmentId, "retry_notification");

  assert(retried.status === "ok");
  expect(retried.value.notification).toBe("sent");
  expect(s.mail.map(({ id, kind }) => ({ id, kind }))).toEqual([
    { id: noticeId, kind: "submission" },
  ]);
  expect(await s.status(noticeId)).toBe("sent");
  // The retry reset the message to pending with a fresh token, under the same ID.
  expect((await token())?.delivery_token).not.toBe(before?.delivery_token);
});

it("retries a manually retried notice through the window and records failed again", async ({
  scenario: s,
}) => {
  const { assignmentId, noticeId } = await s.failedNotice();
  s.behavior.fail = true;
  s.mail.length = 0;
  const retried = await s.manage(assignmentId, "retry_notification");

  // The reset put the message back to pending, so the workflow retried it before failing it again.
  assert(retried.status === "ok");
  expect(retried.value.notification).toBe("failed");
  expect(s.mail.length).toBeGreaterThan(1);
  expect(new Set(s.mail.map(({ id }) => id))).toEqual(new Set([noticeId]));
  expect(await s.status(noticeId)).toBe("failed");
});

it("starts a workflow for a message at most once at a time and never resends a delivered one", async ({
  scenario: s,
}) => {
  const invited = await s.service.invite(actor, s.invitation);
  assert(invited.status === "ok");
  await closed(s.invitation.commandId);
  const work = {
    messageId: s.invitation.commandId,
    assignmentId: invited.value.id,
    kind: "invitation" as const,
    userId: actor.userId,
  };

  await Promise.all([
    s.background.startReviewerMessage(work),
    s.background.startReviewerMessage(work),
  ]);
  await closed(s.invitation.commandId);
  // A closed run starts again, finds the message sent and sends nothing.
  expect(await s.background.reconcileReviewerMessage(work)).toBe("started");
  expect(await closed(s.invitation.commandId)).toBe("sent");
  const replay = await s.service.invite(actor, s.invitation);

  expect(replay).toMatchObject({ status: "ok", value: { delivery: "sent" } });
  expect(s.mail).toHaveLength(1);
});

it("recovers a message whose start was lost by reconciliation", async ({ scenario: s }) => {
  const lost = createBackgroundWork({
    client: () => {
      throw new Error("Temporal is unreachable");
    },
  });
  const request = s.serviceWith(lost.startReviewerMessage);

  const started = Date.now();
  const invited = await request.invite(actor, { ...s.invitation, dueDate: "2027-01-01" });

  // The commit stands and the request answers at once, without waiting for work that never started.
  expect(Date.now() - started).toBeLessThan(wait.timeoutMs);
  assert(invited.status === "ok");
  expect(invited.value.delivery).toBe("pending");
  expect(s.mail).toHaveLength(0);

  const outcome: unknown = await worker.client.workflow.execute("reconcile", {
    taskQueue: worker.taskQueue,
    workflowId: uniqueName("reconcile"),
    workflowExecutionTimeout: "30 seconds",
  });

  expect(outcome).toEqual({ reviewerMessages: "ok", conversations: "ok" });
  expect(await closed(s.invitation.commandId)).toBe("sent");
  expect(s.mail).toHaveLength(1);
  expect(await s.status(s.invitation.commandId)).toBe("sent");
});

it("stops retrying once the assignment is cancelled", async ({ scenario: s }) => {
  s.behavior.fail = true;
  const impatient = createReviewerService({
    database: s.run,
    start: s.background.startReviewerMessage,
    wait: { timeoutMs: 100, intervalMs: 50 },
  });
  const invited = await impatient.invite(actor, s.invitation);
  assert(invited.status === "ok");

  expect(await s.manage(invited.value.id, "cancel")).toMatchObject({ status: "ok" });
  const attempts = s.mail.length;

  expect(await closed(s.invitation.commandId)).toBe("stopped");
  // At most the attempt already in flight; no further retries after revocation.
  expect(s.mail.length).toBeLessThanOrEqual(attempts + 1);
  expect(await s.status(s.invitation.commandId)).toBe("pending");
});

it("stops retrying once the invitation has expired", async ({ scenario: s }) => {
  s.behavior.fail = true;
  const impatient = createReviewerService({
    database: s.run,
    start: s.background.startReviewerMessage,
    wait: { timeoutMs: 100, intervalMs: 50 },
  });
  const invited = await impatient.invite(actor, s.invitation);
  assert(invited.status === "ok");

  await s.database.client.query(
    "UPDATE review_assignments SET expires_at = now() - interval '1 minute' WHERE id = $1",
    [invited.value.id],
  );

  expect(await closed(s.invitation.commandId)).toBe("stopped");
  expect(await s.status(s.invitation.commandId)).toBe("pending");
});

const release = () => {
  let open = () => {};

  const held = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { held, open };
};

it("delivers a notice retried while its failed run is still open", async ({ scenario: s }) => {
  const gate = release();
  current.afterFailure = gate.held;
  const { assignmentId, noticeId } = await s.failedNotice();
  expect(await s.status(noticeId)).toBe("failed");

  // The retry resets the message to pending while the run that failed it is still open, so the
  // request's start finds that run and starts nothing.
  s.behavior.fail = false;
  s.mail.length = 0;
  const impatient = createReviewerService({
    database: s.run,
    start: s.background.startReviewerMessage,
    wait: { timeoutMs: 200, intervalMs: 50 },
  });
  const retried = await s.manage(assignmentId, "retry_notification", impatient);
  assert(retried.status === "ok");
  expect(retried.value.notification).toBe("pending");
  expect(await s.status(noticeId)).toBe("pending");

  gate.open();

  // The run that failed it notices the retry and delivers the message again.
  expect(await closed(noticeId)).toBe("sent");
  expect(await s.status(noticeId)).toBe("sent");
  expect(s.mail.map(({ id }) => id)).toEqual([noticeId]);
});

it("restarts a pending message whose earlier run completed, by reconciliation", async ({
  scenario: s,
}) => {
  const { noticeId } = await s.failedNotice();
  expect(await closed(noticeId)).toBe("failed");

  // A retry committed after the run closed, as when the request's own start was lost.
  await s.database.client.query(
    "UPDATE reviewer_messages SET status = 'pending', delivery_token = gen_random_uuid() WHERE id = $1",
    [noticeId],
  );
  s.behavior.fail = false;
  s.mail.length = 0;

  const outcome: unknown = await worker.client.workflow.execute("reconcile", {
    taskQueue: worker.taskQueue,
    workflowId: uniqueName("reconcile"),
    workflowExecutionTimeout: "30 seconds",
  });

  expect(outcome).toEqual({ reviewerMessages: "ok", conversations: "ok" });
  expect(await closed(noticeId)).toBe("sent");
  expect(await s.status(noticeId)).toBe("sent");
  expect(s.mail.map(({ id }) => id)).toEqual([noticeId]);
});

it("lists a pending message only while its actor could still deliver it", async ({
  scenario: s,
}) => {
  s.behavior.fail = true;
  const impatient = createReviewerService({
    database: s.run,
    start: async () => false,
    wait: { timeoutMs: 0, intervalMs: 0 },
  });
  const invited = await impatient.invite(actor, s.invitation);
  assert(invited.status === "ok");

  const listed = async () =>
    (await listPendingReviewerMessageWork(s.run, 100)).map(({ messageId }) => messageId);

  expect(await listed()).toEqual([s.invitation.commandId]);

  await s.database.client.query("UPDATE app_users SET active = false WHERE id = $1", [
    actor.userId,
  ]);
  expect(await listed()).toEqual([]);
  await s.database.client.query("UPDATE app_users SET active = true WHERE id = $1", [actor.userId]);
  expect(await listed()).toEqual([s.invitation.commandId]);

  await s.database.client.query(
    "UPDATE organizations SET kind = 'demo', demo_expires_at = now() - interval '1 hour', demo_seed_version = 1 WHERE id = 'alder'",
  );
  expect(await listed()).toEqual([]);
});

/** Ask where the assistant's saved message stands until it settles, as its later steps do. */
const settle = async (
  s: { run: Parameters<typeof deliverCommittedReviewerMessage>[0]["database"] },
  ticket: ReviewerDelivery,
  start: Parameters<typeof deliverCommittedReviewerMessage>[0]["start"],
) => {
  const dependencies = { database: s.run, start };
  return expect
    .poll(() => deliverCommittedReviewerMessage(dependencies, actor.userId, ticket), {
      timeout: 10_000,
      interval: 100,
    })
    .not.toBe("pending");
};

it("delivers the assistant's committed invitation through the same workflow", async ({
  scenario: s,
}) => {
  let ticket: ReviewerDelivery | undefined;
  const assistant = s.serviceWith(s.background.startReviewerMessage, (pending) => {
    ticket = pending;
  });

  // The assistant commits the invitation with the grant and saves a ticket; nothing is sent yet.
  const invited = await assistant.invite(actor, s.invitation);
  assert(invited.status === "ok");
  expect(invited.value.delivery).toBe("pending");
  assert(ticket);
  expect(s.mail).toHaveLength(0);

  const dependencies = { database: s.run, start: s.background.startReviewerMessage };
  // Asking never waits: the message is pending until the workflow has sent it.
  expect(await deliverCommittedReviewerMessage(dependencies, actor.userId, ticket)).toBe("pending");
  await settle(s, ticket, s.background.startReviewerMessage);
  expect(await s.status(ticket.messageId)).toBe("sent");

  expect(await closed(ticket.messageId)).toBe("sent");
  expect(s.mail).toHaveLength(1);
});

it("records a failed assistant delivery once and never sends it again, and a newer message is unavailable", async ({
  scenario: s,
}) => {
  s.behavior.fail = true;
  let ticket: ReviewerDelivery | undefined;
  const assistant = s.serviceWith(s.background.startReviewerMessage, (pending) => {
    ticket = pending;
  });
  const invited = await assistant.invite(actor, s.invitation);
  assert(invited.status === "ok");
  assert(ticket);

  await settle(s, ticket, s.background.startReviewerMessage);
  expect(await s.status(ticket.messageId)).toBe("failed");
  expect(await closed(ticket.messageId)).toBe("failed");

  // A crash after the failure and before the assistant recorded it asks again: the message is
  // already failed, so nothing starts a new run or sends it behind the assistant's retry action.
  const attempts = s.mail.length;
  s.behavior.fail = false;
  expect(
    await deliverCommittedReviewerMessage(
      { database: s.run, start: s.background.startReviewerMessage },
      actor.userId,
      ticket,
    ),
  ).toBe("failed");
  expect(s.mail).toHaveLength(attempts);
  expect(await s.status(ticket.messageId)).toBe("failed");

  // Even a run started for it, as a race with the failure recording could, sends nothing.
  await s.background.startReviewerMessage({
    messageId: ticket.messageId,
    assignmentId: ticket.assignmentId,
    kind: ticket.kind,
    userId: actor.userId,
  });
  expect(await closed(ticket.messageId)).toBe("stopped");
  expect(s.mail).toHaveLength(attempts);

  await s.backdateMessages(invited.value.id);
  expect(await s.manage(invited.value.id, "resend")).toMatchObject({ status: "ok" });
  expect(
    await deliverCommittedReviewerMessage(
      { database: s.run, start: s.background.startReviewerMessage },
      actor.userId,
      ticket,
    ),
  ).toBe("unavailable");
});
