import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { fileURLToPath } from "node:url";

import { assert, expect, vi } from "vite-plus/test";
import { z } from "zod";

import { organizationInvitationWorkflowId } from "@merit/organizations/server";
import { databaseTest } from "@merit/test-support/database";
import { createWorkflowClient } from "@merit/workflows";
import { readTestTemporalConfig, uniqueName } from "@merit/workflows/testing";

const app = fileURLToPath(new URL("..", import.meta.url));
const vpx = fileURLToPath(new URL("../node_modules/.bin/vpx", import.meta.url));
const command = "tests/fixtures/invitation-restart-command.ts";
const mailpitMessage = z.object({
  To: z.array(z.object({ Email: z.string() })),
  Text: z.string(),
});

const test = databaseTest
  .extend("runtime", { scope: "file" }, async ({ database }) => database.createRuntimeConnection())
  .extend("scenario", async ({ database, runtime }, { onCleanup }) => {
    const cleanup = new AsyncDisposableStack();
    onCleanup(() => cleanup.disposeAsync());
    const messages: string[] = [];
    const receiver = cleanup.use(
      createServer((request, response) => {
        if (request.method !== "POST" || request.url !== "/api/v1/send") {
          response.writeHead(404).end();
          return;
        }
        void text(request).then(
          (body) => {
            messages.push(body);
            response.writeHead(200).end();
          },
          () => response.destroy(),
        );
      }),
    );
    receiver.listen(0, "127.0.0.1");
    await once(receiver, "listening");
    const address = receiver.address();
    assert(address && typeof address !== "string");
    const env = {
      ...process.env,
      APP_ORIGIN: "https://merit.example",
      DATABASE_URL: runtime,
      MERIT_LOCAL_WORKER: "1",
      MERIT_RECONCILE_INTERVAL_SECONDS: "2",
      MAILPIT_URL: `http://127.0.0.1:${address.port}`,
      EMAIL_FROM: "invite@merit.local",
      TEMPORAL_PAYLOAD_KEY: randomBytes(32).toString("base64"),
      MERIT_TASK_QUEUE: uniqueName("invite-restart"),
      MERIT_TURN_TASK_QUEUE: uniqueName("invite-restart-turn"),
      MERIT_RECONCILE_SCHEDULE_ID: uniqueName("invite-restart-schedule"),
    };

    const runCommand = (action: string, input?: string) =>
      spawnSync(vpx, [command, action], {
        cwd: app,
        env,
        input,
        encoding: "utf8",
        timeout: 15_000,
        killSignal: "SIGKILL",
      });

    await database.client.query(
      "INSERT INTO app_users(id, clerk_user_id, name) SELECT value, value, value FROM unnest($1::text[]) value",
      [["operator", "recipient"]],
    );

    const invitations = async () =>
      (
        await database.client.query<{ id: string; delivery: string; accepted_by: string | null }>(
          "SELECT id, delivery, accepted_by FROM organization_invitations",
        )
      ).rows;

    const client = createWorkflowClient(readTestTemporalConfig(env));
    cleanup.defer(() => client.connection.close());
    const schedule = client.schedule.getHandle(env.MERIT_RECONCILE_SCHEDULE_ID);

    const startWorker = async ({ paused }: { paused: boolean }) => {
      // A distinct initial interval lets the test observe that the worker installed its own settings.
      await client.schedule.create({
        scheduleId: env.MERIT_RECONCILE_SCHEDULE_ID,
        spec: { intervals: [{ every: "1 day" }] },
        action: {
          type: "startWorkflow",
          workflowType: "reconcile",
          taskQueue: env.MERIT_TASK_QUEUE,
        },
        state: { paused, remainingActions: 0 },
      });
      cleanup.defer(() =>
        client.connection.withDeadline(Date.now() + 5000, () => schedule.delete()),
      );
      const worker = spawn(vpx, ["src/worker/main.ts"], { cwd: app, env });
      const closed = once(worker, "close");
      let output = "";
      worker.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
      worker.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
      cleanup.defer(async () => {
        worker.kill("SIGTERM");
        const force = setTimeout(() => worker.kill("SIGKILL"), 4000);
        try {
          await closed;
        } finally {
          clearTimeout(force);
        }
      });

      await expect
        .poll(
          async () => {
            assert(worker.exitCode === null && worker.signalCode === null, output);
            return (await schedule.describe()).spec.intervals;
          },
          { timeout: 60_000 },
        )
        .toMatchObject([{ every: 2000 }]);
    };

    const issueAndCrash = async () => {
      const issued = runCommand("issue");
      expect(issued.status, issued.error?.message ?? issued.stderr).toBe(75);

      const pending = await invitations();
      expect(pending).toHaveLength(1);
      const [original] = pending;
      assert(original);
      const { id } = original;
      expect(original).toMatchObject({ delivery: "pending", accepted_by: null });
      expect(messages).toHaveLength(0);

      return id;
    };

    const expectSent = (id: string) =>
      expect
        .poll(invitations, { timeout: 20_000 })
        .toEqual([{ id, delivery: "sent", accepted_by: null }]);

    // Allow exactly one natural tick, then wait for the reconciliation it started to finish.
    const runNextSweep = async (index: number) => {
      await schedule.update((previous) => ({
        ...previous,
        state: { ...previous.state, paused: false, remainingActions: 1 },
      }));
      const workflow = await vi.waitFor(
        async () => {
          const action = (await schedule.describe()).info.recentActions[index];
          assert(action, "Waiting for the scheduled reconciliation");
          return action.action.workflow;
        },
        { timeout: 20_000, interval: 200 },
      );
      const result: unknown = await client.connection.withDeadline(Date.now() + 20_000, () =>
        client.workflow.getHandle(workflow.workflowId, workflow.firstExecutionRunId).result(),
      );
      expect(result).toMatchObject({ organizationInvitations: "ok" });
    };

    const acceptOnlyEmail = async (id: string) => {
      // A sweep finishes after handoff. Wait for delivery work to finish before counting emails.
      await client.connection.withDeadline(Date.now() + 20_000, () =>
        client.workflow.getHandle(organizationInvitationWorkflowId(id)).result(),
      );
      expect(messages).toHaveLength(1);
      const message = mailpitMessage.parse(JSON.parse(messages[0]!));
      expect(message.To).toEqual([{ Email: "recipient@example.test" }]);
      const token = message.Text.match(
        /https:\/\/merit\.example\/invitations\/([a-f0-9]{64})\b/,
      )?.[1];
      assert(token, "Expected the invitation link in the delivered email");
      const accepted = runCommand("accept", token);
      expect(accepted.status, accepted.error?.message ?? accepted.stderr).toBe(0);
      expect(await invitations()).toEqual([{ id, delivery: "sent", accepted_by: "recipient" }]);
    };

    return { startWorker, issueAndCrash, expectSent, runNextSweep, acceptOnlyEmail };
  });

test(
  "a fresh worker delivers one usable invitation after the issuing process exits before starting its workflow",
  { timeout: 120_000 },
  async ({ scenario }) => {
    const id = await scenario.issueAndCrash();
    // Zero scheduled actions isolates the startup recovery until the invitation is sent.
    await scenario.startWorker({ paused: false });
    await scenario.expectSent(id);
    await scenario.runNextSweep(0);
    await scenario.acceptOnlyEmail(id);
  },
);

test(
  "a running worker delivers the saved invitation on the next sweep after the issuing process exits",
  { timeout: 120_000 },
  async ({ scenario }) => {
    // Keep the isolated Schedule paused through startup and until the committed pending row is visible.
    await scenario.startWorker({ paused: true });
    const id = await scenario.issueAndCrash();
    await scenario.runNextSweep(0);
    await scenario.expectSent(id);
    // The invitation is still unaccepted during the next sweep, so a duplicate would reach the receiver.
    await scenario.runNextSweep(1);
    await scenario.acceptOnlyEmail(id);
  },
);
