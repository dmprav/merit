import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { z } from "zod";

import { createTestDatabase } from "@merit/test-support/test-database";
import { createWorkflowClient } from "@merit/workflows/client";
import { readTestTemporalConfig } from "@merit/workflows/testing";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const name = `merit-overlap-${randomBytes(5).toString("hex")}`;
const directory = await mkdtemp(join(tmpdir(), name));

const docker = async (...args: string[]) =>
  (await run("docker", args, { cwd: root })).stdout.trim();

const baseImage = process.argv[2] ?? "merit:local";
const clientFiles = "/opt/merit/app/dist/client";
const appOrigin = "https://merit.example";

// This command always uses the local Compose PostgreSQL and Temporal services.
process.env.TEST_DATABASE_URL = "postgres://merit:merit@127.0.0.1:55432/merit";
await using cleanup = new AsyncDisposableStack();
cleanup.defer(() => rm(directory, { recursive: true, force: true }));
const database = await createTestDatabase();
cleanup.defer(() => database.dispose());
await database.migrate();
const hostDatabase = await database.createRuntimeConnection();
const containerDatabase = new URL(hostDatabase);
containerDatabase.host = "postgres:5432";

const composeId = (service: string) => docker("compose", "ps", "-q", service);

const postgres = await composeId("postgres");
const servicesNetwork = await docker(
  "inspect",
  "-f",
  "{{range $key, $_ := .NetworkSettings.Networks}}{{$key}}{{end}}",
  postgres,
);
// The trusted proxy gets an address outside the range Docker allocates to restarting containers.
const network = `${name}-release`;
const subnet = `10.${randomBytes(2).join(".")}`;
const proxyIp = `${subnet}.2`;
await docker(
  "network",
  "create",
  "--subnet",
  `${subnet}.0/24`,
  "--ip-range",
  `${subnet}.128/25`,
  network,
);
cleanup.defer(() => docker("network", "rm", network).then(() => {}));
const mailImage = await docker("inspect", "-f", "{{.Config.Image}}", await composeId("mailpit"));
const socket = createServer().listen(0, "127.0.0.1");
await once(socket, "listening");
const address = socket.address();
assert(address && typeof address === "object");
const port = address.port;
await new Promise<void>((done) => socket.close(() => done()));
const origin = `http://127.0.0.1:${port}`;
const common = {
  APP_ORIGIN: appOrigin,
  DATABASE_URL: containerDatabase.href,
  TEMPORAL_ADDRESS: "temporal:7233",
  TEMPORAL_PAYLOAD_KEY: randomBytes(32).toString("base64"),
  MERIT_TASK_QUEUE: name,
  MERIT_TURN_TASK_QUEUE: `${name}-turns`,
  MERIT_RECONCILE_SCHEDULE_ID: name,
};
const client = createWorkflowClient(
  readTestTemporalConfig({ ...common, TEMPORAL_ADDRESS: "127.0.0.1:7233" }),
);
cleanup.defer(() => client.connection.close());
// Only a worker startup can recover the saved invite during this test.
await client.schedule.create({
  scheduleId: name,
  spec: { intervals: [{ every: "1 minute" }] },
  action: { type: "startWorkflow", workflowType: "reconcile", taskQueue: name },
  state: { remainingActions: 0 },
});
cleanup.defer(async () => {
  await client.schedule.getHandle(name).delete();
  for await (const workflow of client.workflow.list({
    query: `TaskQueue = '${name}' AND ExecutionStatus = 'Running'`,
  })) {
    await client.workflow
      .getHandle(workflow.workflowId, workflow.runId)
      .terminate("Local rehearsal ended");
  }
});

const deploy = async (image: string, filename: string, extra: Record<string, string> = {}) => {
  const result = await run(
    resolve(root, "tooling/deploy/release.py"),
    [image, join(directory, filename)],
    {
      env: {
        ...process.env,
        MERIT_DEPLOY_NAME: name,
        MERIT_DEPLOY_NETWORK: network,
        MERIT_DEPLOY_SERVICES_NETWORK: servicesNetwork,
        MERIT_DEPLOY_PROXY_IP: proxyIp,
        MERIT_DEPLOY_PORT: String(port),
        MERIT_DEPLOY_STATE: join(directory, "state"),
        ...extra,
      },
    },
  );
  console.log(result.stdout.trim());
};

const saveEnv = (filename: string, settings: Record<string, string>) =>
  writeFile(
    join(directory, filename),
    Object.entries(settings)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(""),
    { mode: 0o600 },
  );

await saveEnv("web.env", common);
await saveEnv("capture.env", {
  ...common,
  MERIT_LOCAL_WORKER: "1",
  EMAIL_FROM: "rehearsal@merit.local",
});
await saveEnv("broken.env", { ...common, TEMPORAL_PAYLOAD_KEY: "invalid" });
await docker("image", "inspect", baseImage, "-f", "{{.Id}}");
const context = join(directory, "image");
await mkdir(context);
const downloadBytes = 32 * 1024 * 1024;
await writeFile(join(context, "transfer.bin"), Buffer.alloc(downloadBytes));
for (const version of ["a", "b"]) {
  await writeFile(join(context, "release.txt"), version);
  const asset = `rehearsal-${version}-${name}.js`;
  await writeFile(join(context, asset), `// release ${version}\n`);
  // Build distinct client assets on top of the unmodified runtime under test.
  await writeFile(
    join(context, "Dockerfile"),
    [
      "ARG BASE",
      "FROM ${BASE}",
      `COPY transfer.bin ${clientFiles}/`,
      `COPY release.txt ${clientFiles}/`,
      `COPY ${asset} ${clientFiles}/assets/`,
      "",
    ].join("\n"),
  );
  const tag = `${name}:${version}`;
  await docker("build", "-t", tag, "--build-arg", `BASE=${baseImage}`, context);
  cleanup.defer(() => docker("image", "rm", tag).then(() => {}));
}
const mail = `${name}-mail`;
cleanup.defer(async () => {
  const ids = await docker("ps", "-aq", "--filter", `label=merit.deploy=${name}`);
  if (ids) {
    await docker("rm", "-f", ...ids.split(/\s+/));
  }
});

const captured = async (path: string) =>
  docker("exec", mail, "wget", "-qO-", `http://127.0.0.1:8025${path}`);

const read = async (path: string) => {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, path);
  return response.text();
};

const workerHealth = async () => {
  const probeId = randomBytes(8).toString("hex");
  assert.deepEqual(
    await client.workflow.execute("workerHealth", {
      workflowId: `${name}-${probeId}`,
      workflowExecutionTimeout: "20 seconds",
      taskQueue: name,
      args: [{ probeId }],
    }),
    { probeId, status: "ok" },
  );
};

await deploy(`${name}:a`, "web.env");
await docker("restart", `${name}-proxy`);
assert.equal(
  await docker(
    "inspect",
    "-f",
    `{{(index .NetworkSettings.Networks "${network}").IPAddress}}`,
    `${name}-proxy`,
  ),
  proxyIp,
);
assert.equal(await docker("exec", `${name}-blue-web`, "printenv", "TRUSTED_PROXY_IP"), proxyIp);
// Docker returns from restart as soon as the process starts. Wait for nginx to listen
// before measuring uninterrupted service through the subsequent release switches.
const proxyDeadline = Date.now() + 15_000;
while (true) {
  try {
    assert.equal(await read("/release.txt"), "a");
    break;
  } catch (error) {
    if (Date.now() >= proxyDeadline) {
      throw error;
    }
    await delay(100);
  }
}
await workerHealth();
let requests = 0;
let monitoring = true;
const failures: string[] = [];
const monitor = (async () => {
  while (monitoring) {
    try {
      assert.match(await read("/"), /Bring your grantmaking together\./);
      requests++;
    } catch (error) {
      failures.push(String(error));
    }
    await delay(100);
  }
})();
cleanup.defer(async () => {
  monitoring = false;
  await monitor;
});
await assert.rejects(
  deploy(`${name}:b`, "broken.env", { MERIT_DEPLOY_READY_SECONDS: "15" }),
  /Candidate readiness failed:.*green-worker/,
);
assert.equal(await docker("ps", "-aq", "--filter", `name=^/${name}-green-`), "");
assert.equal(await read("/release.txt"), "a");
await workerHealth();

await database.client.query(
  "INSERT INTO app_users(id, clerk_user_id, name) SELECT value, value, value FROM unnest($1::text[]) value",
  [["operator", "recipient"]],
);

const invitation = (action: string, input?: string) =>
  spawnSync(
    resolve(root, "app/node_modules/.bin/vpx"),
    ["tests/fixtures/invitation-restart-command.ts", action],
    {
      cwd: resolve(root, "app"),
      env: { ...process.env, ...common, DATABASE_URL: hostDatabase },
      input,
      encoding: "utf8",
      timeout: 20_000,
    },
  );

const issued = invitation("issue");
assert.equal(issued.status, 75, issued.stderr);
assert.deepEqual(
  (
    await database.client.query<{ delivery: string }>(
      "SELECT delivery FROM organization_invitations",
    )
  ).rows,
  [{ delivery: "pending" }],
);
// Leave an old-slot response under backpressure while new connections switch slots.
const transfer = await fetch(origin + "/transfer.bin", { signal: AbortSignal.timeout(150_000) });
assert.equal(transfer.status, 200);

const finishTransfer = async () => {
  try {
    const deadline = Date.now() + 120_000;
    while ((await read("/release.txt")) !== "b") {
      assert(Date.now() < deadline, "New release never received traffic");
      await delay(100);
    }
    assert.equal(await docker("inspect", "-f", "{{.State.Running}}", `${name}-blue-web`), "true");
    const containers = ["proxy", "blue-web", "blue-worker", "green-web", "green-worker"];
    console.log(
      await docker(
        "stats",
        "--no-stream",
        "--format",
        "{{.Name}} {{.MemUsage}}",
        ...containers.map((container) => `${name}-${container}`),
      ),
    );
    assert.equal((await transfer.arrayBuffer()).byteLength, downloadBytes);
  } finally {
    if (!transfer.bodyUsed) {
      await transfer.body?.cancel();
    }
  }
};

const cutover = await Promise.allSettled([deploy(`${name}:b`, "capture.env"), finishTransfer()]);
for (const result of cutover) {
  if (result.status === "rejected") {
    throw result.reason instanceof Error ? result.reason : new Error(String(result.reason));
  }
}
assert.equal(await read("/release.txt"), "b");
assert.equal(await read(`/assets/rehearsal-a-${name}.js`), "// release a\n");
await workerHealth();

// Mailpit accepts only loopback connections from the local-mode worker. Share the new
// worker's network namespace so the real email activity can finish its pending delivery.
await docker("run", "-d", "--name", mail, "--network", `container:${name}-green-worker`, mailImage);
cleanup.defer(async () => {
  const id = await docker("ps", "-aq", "--filter", `name=^/${mail}$`);
  if (id) {
    await docker("rm", "-f", id);
  }
});
const deadline = Date.now() + 120_000;
while (
  (
    await database.client.query<{ delivery: string }>(
      "SELECT delivery FROM organization_invitations",
    )
  ).rows[0]?.delivery !== "sent"
) {
  assert(Date.now() < deadline, "Replacement worker did not deliver the invitation");
  await delay(250);
}
const inbox = z
  .object({
    total: z.number(),
    messages: z.array(z.object({ ID: z.string(), To: z.array(z.object({ Address: z.string() })) })),
  })
  .parse(JSON.parse(await captured("/api/v1/messages")));
assert.equal(inbox.total, 1);
const [received] = inbox.messages;
assert(received);
assert.equal(received.To[0]?.Address, "recipient@example.test");
const message = z
  .object({ Text: z.string() })
  .parse(JSON.parse(await captured(`/api/v1/message/${received.ID}`)));
const token = message.Text.match(/https:\/\/merit\.example\/invitations\/([a-f0-9]{64})\b/)?.[1];
assert(token, "The captured invitation must contain a usable link");
const accepted = invitation("accept", token);
assert.equal(accepted.status, 0, accepted.stderr);
await docker("rm", "-f", mail);
await deploy(`${name}:a`, "web.env");
assert.equal(await read("/release.txt"), "a");
await workerHealth();
monitoring = false;
await monitor;
assert.deepEqual(failures, []);
assert(requests > 0);
console.log(
  `Passed: rejected candidate, 32 MiB in-flight response, replacement, rollback, one accepted invitation, ${requests} successful HTTP probes.`,
);
