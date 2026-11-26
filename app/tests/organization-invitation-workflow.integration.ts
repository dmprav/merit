import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { afterAll, assert, beforeAll, describe, expect } from "vite-plus/test";

import { withDatabase, type Database } from "@merit/db";
import type { InvitationMessage } from "@merit/organizations/api";
import {
  createInvitationActivities,
  createOrganizationService,
  type InvitationWork,
} from "@merit/organizations/server";
import { databaseTest } from "@merit/test-support/database";
import type { createTestDatabase } from "@merit/test-support/test-database";
import {
  readTestTemporalConfig,
  startTestWorker,
  storedHistoryIncludes,
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

// The database fixture owns the test database and disposes it; the scenario fixture publishes it here.
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let run: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
let worker: TestWorker;
let background: ReturnType<typeof createBackgroundWork>;
let mail: InvitationMessage[];
let works: InvitationWork[];
let sendingFails: boolean;

const invitationUrl = (token: string) => `https://merit.test/invitations/${token}`;

const sendInvitation = async (message: InvitationMessage) => {
  mail.push(message);
  if (sendingFails) {
    throw new Error("Sender unavailable");
  }
};

const tokenOf = (message: InvitationMessage | undefined) => message?.url.split("/").at(-1) ?? "";

const serviceWith = (start = background.startOrganizationInvitation, deliveryWait = wait) =>
  createOrganizationService({
    revokeReviewAccess: async () => {},
    database: run,
    isOperator: async (actor) => actor.userId === "operator",
    verifiedEmails: async (actor) => [`${actor.userId}@example.test`],
    displayName: async (actor) => actor.userId,
    start: async (work) => {
      works.push(work);
      return start(work);
    },
    wait: deliveryWait,
  });

const closed = (invitationId: string) =>
  worker.client.workflow.getHandle(`organization-invitation:${invitationId}`).result();

const delivery = async (invitationId: string) =>
  (
    await database.client.query<{ delivery: string }>(
      "SELECT delivery FROM organization_invitations WHERE id = $1",
      [invitationId],
    )
  ).rows[0]?.delivery;

const history = (invitationId: string, text: string) =>
  storedHistoryIncludes(
    worker.client,
    `organization-invitation:${invitationId}`,
    config.namespace,
    text,
  );

const owner = { userId: "owner" };
const operator = { userId: "operator" };
const workspace = { workspaceSlug: "team" };

const inviteMember = async (service = serviceWith(), email = "waiting@example.test") => {
  const requestId = randomUUID();
  const result = await service.inviteMember(owner, {
    ...workspace,
    requestId,
    email,
    administration: "none",
    role: "program_manager",
  });
  assert(result.status === "ok");
  return requestId;
};

beforeAll(async () => {
  // The activities reach the database of the running test through `run`.
  const activities = createActivities({
    database: (operation) => run(operation),
    reviewerMessages: {
      database: (operation) => run(operation),
      send: async () => {},
      reviewerUrl: () => "",
      managerUrl: () => "",
    },
    invitations: {
      database: (operation) => run(operation),
      sendInvitation: (message) => sendInvitation(message),
      invitationUrl,
    },
    assistant: { configured: false, running: async () => [], wake: async () => true },
    reconcileReviewerMessage: async () => "exists",
  });
  worker = await startTestWorker(config, { workflows: { workflowsPath }, activities });
  background = createBackgroundWork({
    client: () => worker.client,
    taskQueue: worker.taskQueue,
    invitationTiming: timing,
  });
}, 120_000);

afterAll(async () => {
  await worker.stop();
});

const it = databaseTest
  .extend("runtime", { scope: "file" }, async ({ database: owned }) =>
    owned.createRuntimeConnection(),
  )
  .extend("scenario", { auto: true }, async ({ database: owned, runtime }) => {
    database = owned;
    run = (operation) => withDatabase(runtime, operation);
    await database.client.query(
      "INSERT INTO app_users(id, clerk_user_id, name) SELECT value, value, value FROM unnest($1::text[]) value",
      [["operator", "owner"]],
    );
    mail = [];
    works = [];
    sendingFails = false;

    // Provisioning is the first invitation: the operator creates the organization, the owner joins.
    const created = await serviceWith().create(operator, {
      requestId: randomUUID(),
      name: "Community group",
      slug: "team",
      email: "owner@example.test",
    });
    assert(created.status === "ok");
    expect(await serviceWith().accept(owner, { token: tokenOf(mail.at(-1)) })).toMatchObject({
      status: "ok",
    });
    mail = [];
    works = [];
  });

describe("organization invitation workflow", () => {
  it("delivers a committed provisioning invitation and records the outcome", async () => {
    const created = await serviceWith().create(operator, {
      requestId: randomUUID(),
      name: "Second group",
      slug: "second",
      email: "second-owner@example.test",
    });
    assert(created.status === "ok");

    const [work] = works;
    assert(work);
    expect(await closed(work.invitationId)).toBe("sent");
    expect(await delivery(work.invitationId)).toBe("sent");
    expect(mail).toMatchObject([
      { id: work.invitationId, to: "second-owner@example.test", organizationName: "Second group" },
    ]);
  });

  it("delivers a team invitation, resends it, and keeps secrets out of stored history", async () => {
    const id = await inviteMember();
    expect(await closed(id)).toBe("sent");
    expect(await delivery(id)).toBe("sent");
    const first = mail.at(-1);

    for (const text of ["waiting@example.test", "Community group", tokenOf(first)]) {
      expect(await history(id, text)).toBe(false);
    }
    expect(await history(id, id)).toBe(true);

    await database.client.query(
      "UPDATE organization_invitations SET created_at = now() - interval '2 minutes'",
    );
    const resent = await serviceWith().resendMemberInvitation(owner, {
      ...workspace,
      invitationId: id,
    });
    assert(resent.status === "ok");
    const newId = resent.value.invitationId;
    expect(newId).not.toBe(id);
    expect(await closed(newId)).toBe("sent");
    expect(await delivery(newId)).toBe("sent");
    expect(mail.map((message) => message.id)).toEqual([id, newId]);
    expect(tokenOf(mail.at(-1))).not.toBe(tokenOf(first));
  });

  it("retries a failing send, leaves the invitation pending meanwhile, then records failed", async () => {
    sendingFails = true;
    const impatient = serviceWith(undefined, { timeoutMs: 100, intervalMs: 50 });
    const id = await inviteMember(impatient);

    expect(await delivery(id)).toBe("pending");
    expect(await closed(id)).toBe("failed");
    expect(await delivery(id)).toBe("failed");
    expect(mail.length).toBeGreaterThan(1);
    expect(new Set(mail.map((message) => message.id))).toEqual(new Set([id]));

    // The administrator resends once the sender recovers.
    sendingFails = false;
    await database.client.query(
      "UPDATE organization_invitations SET created_at = now() - interval '2 minutes'",
    );
    const resent = await serviceWith().resendMemberInvitation(owner, {
      ...workspace,
      invitationId: id,
    });
    assert(resent.status === "ok");
    expect(await delivery(resent.value.invitationId)).toBe("sent");
  });

  it("answers a request with the first outcome it finds", async () => {
    sendingFails = true;
    const started = Date.now();
    const id = await inviteMember(serviceWith(undefined, { timeoutMs: 300, intervalMs: 50 }));

    expect(Date.now() - started).toBeLessThan(wait.timeoutMs);
    expect(await delivery(id)).toBe("pending");
    expect(await closed(id)).toBe("failed");
  });

  it("starts a workflow once and sends no second email for a repeated start or a retried attempt", async () => {
    const id = await inviteMember();
    await closed(id);
    const [work] = works;
    assert(work);

    await Promise.all([
      background.startOrganizationInvitation(work),
      background.startOrganizationInvitation(work),
    ]);
    const activities = createInvitationActivities({
      database: run,
      sendInvitation,
      invitationUrl,
    });

    expect(await activities.sendOrganizationInvitation(work)).toBe("sent");
    expect(mail).toHaveLength(1);
  });

  it("stops retrying once the invitation is revoked", async () => {
    sendingFails = true;
    const impatient = serviceWith(undefined, { timeoutMs: 100, intervalMs: 50 });
    const id = await inviteMember(impatient);

    const revoked = await impatient.revokeMemberInvitation(owner, {
      ...workspace,
      invitationId: id,
    });
    assert(revoked.status === "ok");
    const attempts = mail.length;

    expect(await closed(id)).toBe("stopped");
    // At most the attempt already in flight; no further retries after revocation.
    expect(mail.length).toBeLessThanOrEqual(attempts + 1);
    expect(await delivery(id)).toBe("pending");
  });

  it("stops retrying once the invitation has expired", async () => {
    sendingFails = true;
    const id = await inviteMember(serviceWith(undefined, { timeoutMs: 100, intervalMs: 50 }));

    await database.client.query(
      "UPDATE organization_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [id],
    );

    expect(await closed(id)).toBe("stopped");
    expect(await delivery(id)).toBe("pending");
  });

  it("leaves a lost start pending for the administrator to resend", async () => {
    const lost = createBackgroundWork({
      client: () => {
        throw new Error("Temporal is unreachable");
      },
    });
    const started = Date.now();
    const id = await inviteMember(serviceWith(lost.startOrganizationInvitation));

    // The commit stands and the request answers at once, without waiting for work that never started.
    expect(Date.now() - started).toBeLessThan(wait.timeoutMs);
    expect(await delivery(id)).toBe("pending");
    expect(mail).toHaveLength(0);

    // Nothing reconciles invitations, because only the token hash is stored; resending delivers.
    await database.client.query(
      "UPDATE organization_invitations SET created_at = now() - interval '2 minutes'",
    );
    const resent = await serviceWith().resendMemberInvitation(owner, {
      ...workspace,
      invitationId: id,
    });
    assert(resent.status === "ok");
    expect(await delivery(resent.value.invitationId)).toBe("sent");
  });

  it("resends a provisioning invitation from the administration console", async () => {
    const created = await serviceWith().create(operator, {
      requestId: randomUUID(),
      name: "Third group",
      slug: "third",
      email: "third@example.test",
    });
    assert(created.status === "ok");
    const first = works.at(-1);
    assert(first);
    await closed(first.invitationId);
    await database.client.query(
      "UPDATE organization_invitations SET created_at = now() - interval '2 minutes'",
    );

    const resent = await serviceWith().invite(operator, {
      organizationId: created.value.organizationId,
      email: "third-again@example.test",
    });
    assert(resent.status === "ok");
    const second = works.at(-1);
    assert(second);

    expect(second.invitationId).not.toBe(first.invitationId);
    expect(await closed(second.invitationId)).toBe("sent");
    expect(await delivery(second.invitationId)).toBe("sent");
    // The replaced invitation is revoked, so its workflow cannot send again.
    expect(await activitiesStop(first)).toBe("stopped");
  });
});

const activitiesStop = (work: InvitationWork) =>
  createInvitationActivities({
    database: run,
    sendInvitation,
    invitationUrl,
  }).sendOrganizationInvitation(work);
