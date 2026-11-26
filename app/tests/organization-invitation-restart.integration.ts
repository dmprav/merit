import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { fileURLToPath } from "node:url";

import { assert, expect } from "vite-plus/test";
import { z } from "zod";

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

databaseTest(
  "a fresh worker delivers one usable invitation after the issuing process exits before starting its workflow",
  { timeout: 120_000 },
  async ({ database }) => {
    const messages: string[] = [];
    await using receiver = createServer((request, response) => {
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
    });
    receiver.listen(0, "127.0.0.1");
    await once(receiver, "listening");
    const address = receiver.address();
    assert(address && typeof address !== "string");
    const env = {
      ...process.env,
      APP_ORIGIN: "https://merit.example",
      DATABASE_URL: await database.createRuntimeConnection(),
      MERIT_LOCAL_WORKER: "1",
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
    const issued = runCommand("issue");
    expect(issued.status, issued.error?.message ?? issued.stderr).toBe(75);

    const invitations = async () =>
      (
        await database.client.query<{ id: string; delivery: string; accepted_by: string | null }>(
          "SELECT id, delivery, accepted_by FROM organization_invitations",
        )
      ).rows;

    const pending = await invitations();
    expect(pending).toHaveLength(1);
    const [original] = pending;
    assert(original);
    const { id } = original;
    expect(original).toMatchObject({ delivery: "pending", accepted_by: null });
    expect(messages).toHaveLength(0);

    await using cleanup = new AsyncDisposableStack();
    const client = createWorkflowClient(readTestTemporalConfig(env));
    cleanup.defer(() => client.connection.close());
    // Keep startup recovery enabled, but exclude the periodic scan as the source of the email.
    await client.schedule.create({
      scheduleId: env.MERIT_RECONCILE_SCHEDULE_ID,
      spec: { intervals: [{ every: "1 minute" }] },
      action: { type: "startWorkflow", workflowType: "reconcile", taskQueue: env.MERIT_TASK_QUEUE },
      state: { remainingActions: 0 },
    });
    cleanup.defer(() =>
      client.connection.withDeadline(Date.now() + 5000, () =>
        client.schedule.getHandle(env.MERIT_RECONCILE_SCHEDULE_ID).delete(),
      ),
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
          return invitations();
        },
        { timeout: 60_000, interval: 100 },
      )
      .toEqual([{ id, delivery: "sent", accepted_by: null }]);

    // Exercise another pass while the invitation is still unaccepted and its link is still live.
    const retry: unknown = await client.connection.withDeadline(Date.now() + 20_000, () =>
      client.workflow.execute("reconcile", {
        workflowId: uniqueName("invite-restart-repeat"),
        taskQueue: env.MERIT_TASK_QUEUE,
        workflowExecutionTimeout: "15 seconds",
      }),
    );
    expect(retry).toMatchObject({ organizationInvitations: "ok" });
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
  },
);
