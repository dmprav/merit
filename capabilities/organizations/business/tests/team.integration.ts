import { randomUUID } from "node:crypto";

import { assert, beforeAll, afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { withDatabase } from "@merit/db";
import { migrate } from "@merit/db/migrate";
import type { InvitationMessage } from "@merit/organizations/api";
import { createOrganizationService } from "@merit/organizations/server";
import { createTestDatabase } from "@merit/test-support/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let messages: InvitationMessage[];
let sendingFails: boolean;

const service = (emails?: string[]) =>
  createOrganizationService({
    database: (operation) => withDatabase(database.connectionString, operation),
    isOperator: (actor) => actor.userId === "operator",
    verifiedEmails: async (actor) => emails ?? [`${actor.userId}@example.test`],
    displayName: async (actor) => actor.userId,
    sendInvitation: async (message) => {
      if (sendingFails) {
        throw new Error("offline");
      }

      messages.push(message);
    },
    invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.example.test").href,
  });

const token = () => messages.at(-1)!.url.split("/").at(-1)!;

const input = { workspaceSlug: "team" };

const ageInvitations = (email: string) =>
  database.client.query(
    "UPDATE organization_invitations SET created_at=clock_timestamp()-interval '2 minutes' WHERE email=$1",
    [email],
  );

const team = async (id = "owner") => {
  const result = await service().team({ userId: id }, input);

  if (result.status !== "ok") {
    throw new Error(result.status);
  }

  return result.value;
};

const memberRequest = async (name: string) => {
  const data = await team();
  const member = data.members.find((m) => m.name === name)!;

  return {
    ...input,
    userId: member.userId,
    expectedMembershipId: member.membershipId,
    expectedVersion: member.version,
    expectedInvitationIds: data.invitations
      .filter((i) => i.invitedBy === member.userId)
      .map((i) => i.id),
  };
};

const invite = async (
  name: string,
  administration: "none" | "administrator" = "none",
  role: "member" | "program_manager" = "program_manager",
  issuer = "owner",
) => {
  const requestId = randomUUID();
  expect(
    await service().inviteMember(
      { userId: issuer },
      {
        ...input,
        requestId,
        email: `${name}@example.test`,
        administration,
        role,
      },
    ),
  ).toEqual({ status: "ok", value: { invitationId: requestId } });

  return token();
};

const join = async (
  name: string,
  administration: "none" | "administrator" = "none",
  role: "member" | "program_manager" = "program_manager",
) => {
  const invitation = await invite(name, administration, role);

  expect((await service().accept({ userId: name }, { token: invitation })).status).toBe("ok");

  return invitation;
};

beforeAll(async () => {
  database = await createTestDatabase();
  await migrate(database.client);
});
afterAll(async () => database.dispose());
beforeEach(async () => {
  await database.client.query("TRUNCATE organizations, app_users CASCADE");
  await database.client.query(
    "INSERT INTO app_users(id, clerk_user_id, name) SELECT value, value, value FROM unnest($1::text[]) value",
    [
      [
        "admin",
        "colleague",
        "first",
        "manager",
        "member",
        "operator",
        "other",
        "outsider",
        "owner",
        "peer",
        "recipient",
        "second",
        "waiting",
      ],
    ],
  );
  messages = [];
  sendingFails = false;

  expect(
    (
      await service().create(
        { userId: "operator" },
        {
          requestId: randomUUID(),
          name: "Team",
          slug: "team",
          email: "owner@example.test",
        },
      )
    ).status,
  ).toBe("ok");
  expect((await service().accept({ userId: "owner" }, { token: token() })).status).toBe("ok");
});

describe("organization team", () => {
  it("separates ownership, administration and grant access and protects directory privacy", async () => {
    await join("admin", "administrator", "member");
    await join("manager");
    await invite("waiting");
    const owner = await team();

    expect(owner.subject).toMatchObject({ administration: "owner", role: "program_manager" });
    expect((await team("admin")).subject).toMatchObject({
      administration: "administrator",
      role: "member",
    });
    expect(await service().workspaces({ userId: "admin" })).toMatchObject({
      status: "ok",
      value: [{ slug: "team", role: "member" }],
    });

    const manager = await team("manager");

    expect(manager.members).toHaveLength(3);
    expect(manager.invitations).toEqual([]);
    expect(await service().team({ userId: "operator" }, input)).toEqual({
      status: "forbidden",
    });
    expect(await service().team({ userId: "outsider" }, input)).toEqual({
      status: "forbidden",
    });
    expect(
      await service().inviteMember(
        { userId: "manager" },
        {
          ...input,
          requestId: randomUUID(),
          email: "no@example.test",
          administration: "none",
          role: "program_manager",
        },
      ),
    ).toEqual({ status: "forbidden" });
  });

  it("reserves administrator appointments to the owner, permits explicit self-grant, and prevents owner removal and self-demotion", async () => {
    await join("admin", "administrator", "member");
    await ageInvitations("manager@example.test");
    await join("manager");

    expect(
      await service().changeMember(
        { userId: "admin" },
        {
          ...(await memberRequest("manager")),
          administration: "administrator",
          role: "program_manager",
        },
      ),
    ).toEqual({ status: "forbidden" });
    expect(
      await service().inviteMember(
        { userId: "admin" },
        {
          ...input,
          requestId: randomUUID(),
          email: "new-admin@example.test",
          administration: "administrator",
          role: "member",
        },
      ),
    ).toEqual({ status: "forbidden" });
    expect(
      (
        await service().changeMember(
          { userId: "admin" },
          {
            ...(await memberRequest("admin")),
            administration: "administrator",
            role: "program_manager",
          },
        )
      ).status,
    ).toBe("ok");
    expect(
      await service().changeMember(
        { userId: "admin" },
        {
          ...(await memberRequest("admin")),
          administration: "none",
          role: "program_manager",
        },
      ),
    ).toEqual({ status: "self_change" });
    expect(await service().removeMember({ userId: "admin" }, await memberRequest("admin"))).toEqual(
      {
        status: "self_change",
      },
    );
    expect(await service().removeMember({ userId: "owner" }, await memberRequest("owner"))).toEqual(
      {
        status: "owner_protected",
      },
    );
    expect(await service().removeMember({ userId: "admin" }, await memberRequest("owner"))).toEqual(
      {
        status: "owner_protected",
      },
    );
    expect(
      await service().changeMember(
        { userId: "owner" },
        {
          ...(await memberRequest("owner")),
          administration: "none",
          role: "program_manager",
        },
      ),
    ).toEqual({ status: "owner_protected" });

    await join("peer", "administrator");

    expect(await service().removeMember({ userId: "admin" }, await memberRequest("peer"))).toEqual({
      status: "forbidden",
    });
    expect(
      (
        await service().changeMember(
          { userId: "owner" },
          {
            ...(await memberRequest("manager")),
            administration: "administrator",
            role: "program_manager",
          },
        )
      ).status,
    ).toBe("ok");
  });

  it("does not modify a current member through an invitation and retries invitation creation safely", async () => {
    const request = {
      ...input,
      requestId: randomUUID(),
      email: "MEMBER@example.test",
      administration: "none" as const,
      role: "program_manager" as const,
    };
    const before = messages.length;

    expect((await service().inviteMember({ userId: "owner" }, request)).status).toBe("ok");
    expect((await service().inviteMember({ userId: "owner" }, request)).status).toBe("ok");
    expect(messages).toHaveLength(before + 1);
    expect(
      (await service().inviteMember({ userId: "owner" }, { ...request, requestId: randomUUID() }))
        .status,
    ).toBe("invitation_exists");
    expect((await service().accept({ userId: "member" }, { token: token() })).status).toBe("ok");
    expect(
      (
        await service().inviteMember(
          { userId: "owner" },
          {
            ...request,
            requestId: randomUUID(),
            administration: "administrator",
          },
        )
      ).status,
    ).toBe("membership_conflict");
    expect((await team("member")).subject.administration).toBe("none");
  });

  it("preserves ownership and issued invitations when an administrator changes the owner's grant access", async () => {
    await join("admin", "administrator");
    const pending = await invite("waiting");
    const request = await memberRequest("owner");

    expect(
      await service().changeMember(
        { userId: "admin" },
        {
          ...request,
          administration: "administrator",
          role: "member",
        },
      ),
    ).toEqual({
      status: "ok",
      value: {
        userId: "owner",
        membershipId: request.expectedMembershipId,
        membershipVersion: request.expectedVersion + 1,
        removed: false,
      },
    });
    expect((await team()).subject).toMatchObject({ administration: "owner", role: "member" });

    const { rows } = await database.client.query<{
      details: { revokedInvitationIds: string[]; userId: string };
    }>("SELECT details FROM organization_events WHERE action='member_changed'");

    expect((rows[0] ?? assert.fail("Expected rows[0]")).details).toMatchObject({
      after: { administration: "owner", role: "member" },
      revokedInvitationIds: [],
    });
    expect((await service().accept({ userId: "waiting" }, { token: pending })).status).toBe("ok");
  });

  it("delivers the committed team invitation and retains its responsibilities when resending", async () => {
    const delivered: InvitationMessage[] = [];
    const invitations = createOrganizationService({
      database: (operation) => withDatabase(database.connectionString, operation),
      isOperator: () => false,
      verifiedEmails: async () => [],
      invitationUrl: (value) => `https://merit.example.test/invitations/${value}`,
      sendInvitation: async (message) => {
        // A separate connection must see the complete invitation before delivery starts.
        const { rows } = await database.client.query<{
          id: string;
          email: string;
          purpose: string;
          administration: string;
          role: string;
          invited_by: string;
          expires_at: Date;
          workspace: string;
        }>(
          `SELECT i.id, i.email, i.purpose, i.administration, i.role, i.invited_by,
            i.expires_at, o.slug AS workspace
          FROM organization_invitations i JOIN organizations o ON o.id = i.organization_id
          WHERE i.id = $1`,
          [message.id],
        );
        expect(rows).toEqual([
          {
            id: message.id,
            email: message.to,
            purpose: "team",
            administration: message.administration,
            role: message.role,
            invited_by: "owner",
            expires_at: message.expiresAt,
            workspace: "team",
          },
        ]);
        delivered.push(message);
      },
    });
    const request = {
      ...input,
      requestId: randomUUID(),
      email: "recipient@example.test",
      administration: "administrator" as const,
      role: "member" as const,
    };
    expect(await invitations.inviteMember({ userId: "owner" }, request)).toEqual({
      status: "ok",
      value: { invitationId: request.requestId },
    });
    expect(delivered).toHaveLength(1);
    const first = delivered[0] ?? assert.fail("Expected the first invitation delivery");
    expect(first).toMatchObject({
      id: request.requestId,
      to: request.email,
      organizationName: "Team",
      administration: "administrator",
      role: "member",
    });

    expect(await invitations.inviteMember({ userId: "owner" }, request)).toEqual({
      status: "ok",
      value: { invitationId: request.requestId },
    });
    expect(delivered).toHaveLength(1);
    await ageInvitations(request.email);
    const resent = await invitations.resendMemberInvitation(
      { userId: "owner" },
      {
        ...input,
        invitationId: first.id,
      },
    );
    assert(resent.status === "ok");
    expect(delivered).toHaveLength(2);
    const replacement = delivered[1] ?? assert.fail("Expected the replacement delivery");
    expect(replacement).toMatchObject({
      id: resent.value.invitationId,
      to: first.to,
      organizationName: first.organizationName,
      administration: first.administration,
      role: first.role,
    });
    expect(replacement.id).not.toBe(first.id);
    expect(
      await service().accept(
        { userId: "recipient" },
        {
          token: first.url.split("/").at(-1)!,
        },
      ),
    ).toEqual({ status: "revoked" });
    expect(
      (
        await service().accept(
          { userId: "recipient" },
          {
            token: replacement.url.split("/").at(-1)!,
          },
        )
      ).status,
    ).toBe("ok");
    expect((await team("recipient")).subject).toMatchObject({
      administration: "administrator",
      role: "member",
    });
  });

  it("recovers failed email delivery and replaces one invitation without revoking others", async () => {
    const first = await invite("first");
    await invite("second");
    const firstInvite = (await team()).invitations.find((i) => i.email === "first@example.test")!;
    sendingFails = true;
    await ageInvitations("first@example.test");

    expect(
      (
        await service().resendMemberInvitation(
          { userId: "owner" },
          { ...input, invitationId: firstInvite.id },
        )
      ).status,
    ).toBe("ok");
    expect(await service().accept({ userId: "first" }, { token: first })).toEqual({
      status: "revoked",
    });

    const pending = (await team()).invitations;

    expect(pending).toHaveLength(2);

    const failed = pending.find((i) => i.email === "first@example.test")!;

    expect(failed.delivery).toBe("failed");

    sendingFails = false;
    await ageInvitations("first@example.test");

    expect(
      (
        await service().resendMemberInvitation(
          { userId: "owner" },
          { ...input, invitationId: failed.id },
        )
      ).status,
    ).toBe("ok");
    expect(messages.at(-1)).toMatchObject({ administration: "none", role: "program_manager" });
    expect((await service().accept({ userId: "first" }, { token: token() })).status).toBe("ok");
  });

  it("revokes invitations on removal, preserves the user and events, and never restores membership through an accepted link", async () => {
    const accepted = await join("admin", "administrator");
    const pending = await invite("colleague", "none", "program_manager", "admin");
    const request = await memberRequest("admin");

    expect((await service().removeMember({ userId: "owner" }, request)).status).toBe("ok");
    expect(await service().workspaces({ userId: "admin" })).toEqual({
      status: "ok",
      value: [],
    });
    expect(await service().accept({ userId: "colleague" }, { token: pending })).toEqual({
      status: "revoked",
    });
    expect(await service().accept({ userId: "admin" }, { token: accepted })).toEqual({
      status: "forbidden",
    });
    expect(
      (await database.client.query("SELECT id FROM app_users WHERE clerk_user_id='admin'")).rows,
    ).toHaveLength(1);

    const event = (
      await database.client.query<{ details: { revokedInvitationIds: string[]; userId: string } }>(
        "SELECT details FROM organization_events WHERE action='member_removed'",
      )
    ).rows[0];

    assert.isDefined(event);
    expect(event.details.revokedInvitationIds).toEqual(request.expectedInvitationIds);
    expect(event.details.userId).toBe(request.userId);

    await ageInvitations("admin@example.test");
    await join("admin");

    expect((await team("admin")).subject.administration).toBe("none");
  });

  it("rejects stale edits and changed handover impacts, then revokes invitations when an administrator is demoted", async () => {
    await join("admin", "administrator");
    const stale = await memberRequest("admin");
    const link = await invite("colleague", "none", "program_manager", "admin");

    expect(await service().removeMember({ userId: "owner" }, stale)).toEqual({
      status: "conflict",
    });

    const request = await memberRequest("admin");
    const results = await Promise.all([
      service().changeMember(
        { userId: "owner" },
        { ...request, administration: "none", role: "program_manager" },
      ),
      service().changeMember(
        { userId: "owner" },
        { ...request, administration: "administrator", role: "member" },
      ),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(["conflict", "ok"]);

    if ((await team("admin")).subject.administration !== "none") {
      await service().changeMember(
        { userId: "owner" },
        {
          ...(await memberRequest("admin")),
          administration: "none",
          role: "program_manager",
        },
      );
    }

    expect(await service().accept({ userId: "colleague" }, { token: link })).toEqual({
      status: "revoked",
    });
  });

  it("rejects a form opened before removal and reinvitation of the same person", async () => {
    await join("manager");
    const old = await memberRequest("manager");

    expect((await service().removeMember({ userId: "owner" }, old)).status).toBe("ok");

    await ageInvitations("manager@example.test");
    await join("manager");

    expect(
      await service().changeMember(
        { userId: "owner" },
        {
          ...old,
          administration: "administrator",
          role: "program_manager",
        },
      ),
    ).toEqual({ status: "conflict" });
    expect(await service().removeMember({ userId: "owner" }, old)).toEqual({
      status: "conflict",
    });
    expect((await team("manager")).subject.administration).toBe("none");
  });

  it("keeps contact emails and membership scoped to each organization", async () => {
    await join("manager");

    expect(
      (
        await service().create(
          { userId: "operator" },
          {
            requestId: randomUUID(),
            name: "Other",
            slug: "other",
            email: "alternate@example.test",
          },
        )
      ).status,
    ).toBe("ok");
    expect(
      (await service(["alternate@example.test"]).accept({ userId: "manager" }, { token: token() }))
        .status,
    ).toBe("ok");
    expect((await team()).members.find((m) => m.name === "manager")?.email).toBe(
      "manager@example.test",
    );
    expect(
      (await service().removeMember({ userId: "owner" }, await memberRequest("manager"))).status,
    ).toBe("ok");
    expect(await service().workspaces({ userId: "manager" })).toMatchObject({
      status: "ok",
      value: [{ slug: "other", administration: "owner" }],
    });
  });

  it("serializes invitation acceptance against revocation", async () => {
    const link = await invite("manager");
    const invitationId = (
      (await team()).invitations[0] ?? assert.fail("Expected (await team()).invitations[0]")
    ).id;
    const results = await Promise.all([
      service().accept({ userId: "manager" }, { token: link }),
      service().revokeMemberInvitation({ userId: "owner" }, { ...input, invitationId }),
    ]);

    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(["revoked", "already_joined"]).toContain(results.find((r) => r.status !== "ok")?.status);
  });

  it("preserves the current link on cooldown and counts revoked invitations", async () => {
    const link = await invite("waiting");
    const invitationId = (
      (await team()).invitations[0] ?? assert.fail("Expected (await team()).invitations[0]")
    ).id;
    const before = messages.length;

    expect(
      await service().resendMemberInvitation({ userId: "owner" }, { ...input, invitationId }),
    ).toEqual({ status: "invitation_cooldown" });
    expect(await service().invitation({ userId: "waiting" }, { token: link })).toMatchObject({
      status: "ok",
    });
    expect(messages).toHaveLength(before);
    expect(
      ((await team()).invitations[0] ?? assert.fail("Expected (await team()).invitations[0]")).id,
    ).toBe(invitationId);

    await service().revokeMemberInvitation({ userId: "owner" }, { ...input, invitationId });

    expect(
      await service().inviteMember(
        { userId: "owner" },
        {
          ...input,
          requestId: randomUUID(),
          email: "WAITING@example.test",
          administration: "none",
          role: "program_manager",
        },
      ),
    ).toEqual({ status: "invitation_cooldown" });
    expect(messages).toHaveLength(before);

    await ageInvitations("waiting@example.test");
    await invite("waiting");

    expect(messages).toHaveLength(before + 1);
  });

  it("serializes the last hourly slot across callers and counts failed sends", async () => {
    // The accepted owner invitation and these 18 failed, revoked invitations use 19 slots.
    await database.client.query(`
      INSERT INTO organization_invitations
        (id, organization_id, email, token_hash, invited_by, expires_at, revoked_at, delivery)
      SELECT 'hour-' || n, organization_id, 'hour-' || n || '@example.test',
        'hour-hash-' || n, invited_by, expires_at, clock_timestamp(), 'failed'
      FROM organization_invitations CROSS JOIN generate_series(1, 18) n
    `);
    const results = await Promise.all(
      ["one", "two"].map((name) =>
        service().inviteMember(
          { userId: "owner" },
          {
            ...input,
            requestId: randomUUID(),
            email: `${name}@example.test`,
            administration: "none",
            role: "program_manager",
          },
        ),
      ),
    );

    expect(results.map((result) => result.status).sort()).toEqual([
      "invitation_hourly_limit",
      "ok",
    ]);
    expect(messages).toHaveLength(2);
    expect(
      (
        await database.client.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM organization_invitations",
        )
      ).rows[0]?.count,
    ).toBe(20);
  });

  it("enforces the rolling daily quota and releases it after the window", async () => {
    await database.client.query(`
      INSERT INTO organization_invitations
        (id, organization_id, email, token_hash, invited_by, expires_at, revoked_at, created_at)
      SELECT 'day-' || n, organization_id, 'day-' || n || '@example.test',
        'day-hash-' || n, invited_by, expires_at, clock_timestamp(), clock_timestamp()-interval '2 hours'
      FROM organization_invitations CROSS JOIN generate_series(1, 99) n
    `);
    const request = {
      ...input,
      requestId: randomUUID(),
      email: "next@example.test",
      administration: "none" as const,
      role: "program_manager" as const,
    };

    expect(await service().inviteMember({ userId: "owner" }, request)).toEqual({
      status: "invitation_daily_limit",
    });
    expect(messages).toHaveLength(1);
    // Another organization has its own allowance, even for the same recipient.
    expect(
      (
        await service().create(
          { userId: "operator" },
          {
            requestId: randomUUID(),
            name: "Other",
            slug: "other",
            email: "owner@example.test",
          },
        )
      ).status,
    ).toBe("ok");

    await database.client.query(
      "UPDATE organization_invitations SET created_at=clock_timestamp()-interval '25 hours'",
    );

    expect((await service().inviteMember({ userId: "owner" }, request)).status).toBe("ok");
  });

  it("checks resource organization and current active authority on every mutation", async () => {
    await join("admin", "administrator");
    await join("manager");
    const member = await memberRequest("manager");
    await database.client.query("UPDATE app_users SET active=false WHERE clerk_user_id='admin'");

    expect(await service().removeMember({ userId: "admin" }, member)).toEqual({
      status: "forbidden",
    });
    expect(
      (
        await service().create(
          { userId: "operator" },
          {
            requestId: randomUUID(),
            name: "Other",
            slug: "other",
            email: "other@example.test",
          },
        )
      ).status,
    ).toBe("ok");

    await service().accept({ userId: "other" }, { token: token() });

    expect(await service().removeMember({ userId: "other" }, member)).toEqual({
      status: "forbidden",
    });
    expect(
      await service().removeMember({ userId: "other" }, { ...member, workspaceSlug: "other" }),
    ).toEqual({
      status: "not_found",
    });
  });
});
