import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vite-plus/test";

import { withDatabase } from "@merit/db";
import { migrate } from "@merit/db/migrate";
import type { InvitationMessage } from "@merit/organizations/api";
import { createOrganizationService } from "@merit/organizations/server";
import { createTestDatabase } from "@merit/test-support/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let messages: InvitationMessage[];
let sendingFails = false;

const service = (emails = ["recipient@example.test"], name?: string | null) =>
  createOrganizationService({
    database: (operation) => withDatabase(database.connectionString, operation),
    isOperator: (actor) => actor.userId === "operator",
    verifiedEmails: async () => emails,
    displayName: name === undefined ? undefined : async () => name,
    sendInvitation: async (message) => {
      if (sendingFails) {
        throw new Error("offline");
      }

      messages.push(message);
    },
    invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.example.test").href,
  });

const create = async (slug = "new-foundation") => {
  const input = {
    requestId: randomUUID(),
    name: "New Foundation",
    slug,
    email: "recipient@example.test",
  };
  const result = await service().create({ userId: "operator" }, input);

  expect(result.status).toBe("ok");

  return {
    input,
    organizationId: input.requestId,
    token: messages.at(-1)?.url.split("/").at(-1) ?? "",
  };
};

beforeAll(async () => {
  database = await createTestDatabase();
  await migrate(database.client);
});
afterAll(async () => {
  await database.dispose();
});
beforeEach(async () => {
  await database.client.query("TRUNCATE organizations, app_users CASCADE");
  await database.client.query(
    "INSERT INTO app_users(id, clerk_user_id, name) SELECT value, value, value FROM unnest($1::text[]) value",
    [["another-recipient", "colleague", "operator", "recipient", "wrong"]],
  );
  messages = [];
  sendingFails = false;
});

describe("organization provisioning", () => {
  it("delivers a working invitation at the host's configured address", async () => {
    const operations = createOrganizationService({
      database: (operation) => withDatabase(database.connectionString, operation),
      isOperator: () => true,
      verifiedEmails: async () => ["recipient@example.test"],
      sendInvitation: async (message) => {
        messages.push(message);
      },
      invitationUrl: (token) => `https://merit.example.test/join?code=${token}`,
    });

    const result = await operations.create(
      { userId: "operator" },
      {
        requestId: randomUUID(),
        name: "Alder",
        slug: "alder",
        email: "recipient@example.test",
      },
    );

    expect(result.status).toBe("ok");
    expect(messages).toHaveLength(1);
    assert.isDefined(messages[0]);
    expect(messages[0].to).toBe("recipient@example.test");
    expect(messages[0].url).toMatch(/^https:\/\/merit\.example\.test\/join\?code=[a-f0-9]{64}$/);
    const token = new URL(messages[0].url).searchParams.get("code");

    assert(token !== null);
    expect((await operations.accept({ userId: "recipient" }, { token })).status).toBe("ok");
  });

  it.each([false, true])(
    "preserves creation when recording delivery fails (sendingFails=%s)",
    async (fails) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      sendingFails = fails;
      await database.client.query(
        "ALTER TABLE organization_invitations ADD CONSTRAINT reject_delivery_test CHECK (delivery = 'pending')",
      );
      try {
        const { input, organizationId } = await create();
        expect(await service().read({ userId: "operator" }, { organizationId })).toMatchObject({
          status: "ok",
          value: { invitation: { delivery: "pending" } },
        });
        expect(log).toHaveBeenCalledExactlyOnceWith(
          "Invitation delivery outcome could not be recorded.",
        );
        expect(await service().create({ userId: "operator" }, input)).toEqual({
          status: "ok",
          value: { organizationId },
        });
        expect(messages).toHaveLength(fails ? 0 : 1);
      } finally {
        await database.client.query(
          "ALTER TABLE organization_invitations DROP CONSTRAINT reject_delivery_test",
        );
        log.mockRestore();
      }
    },
  );

  it("retries creation without changing the organization or sending another invitation", async () => {
    const { input, organizationId } = await create();
    const before = await service().read({ userId: "operator" }, { organizationId });

    const result = await service().create({ userId: "operator" }, input);

    expect(result).toEqual({
      status: "ok",
      value: { organizationId },
    });
    expect(await service().read({ userId: "operator" }, { organizationId })).toEqual(before);
    expect(messages).toHaveLength(1);
    expect(
      (
        await database.client.query<{ organization_id: string }>(
          "SELECT organization_id FROM organization_invitations",
        )
      ).rows,
    ).toEqual([{ organization_id: organizationId }]);
  });

  it("rejects creation by a non-operator without creating records or sending an invitation", async () => {
    const result = await service().create(
      { userId: "recipient" },
      {
        requestId: randomUUID(),
        name: "New Foundation",
        slug: "new-foundation",
        email: "recipient@example.test",
      },
    );

    expect(result).toEqual({ status: "forbidden" });
    expect(await service().list({ userId: "operator" })).toEqual({ status: "ok", value: [] });
    expect(
      (await database.client.query<{ id: string }>("SELECT id FROM organization_invitations")).rows,
    ).toEqual([]);
    expect(messages).toEqual([]);
  });

  it("hides the organization directory from non-operators", async () => {
    await create();

    expect(await service().list({ userId: "recipient" })).toEqual({ status: "forbidden" });
  });

  it("rejects a taken workspace address without changing its organization or invitation", async () => {
    const { input, organizationId } = await create();
    const before = await service().read({ userId: "operator" }, { organizationId });

    const result = await service().create(
      { userId: "operator" },
      { ...input, requestId: randomUUID() },
    );

    expect(result).toEqual({ status: "address_taken" });
    expect(await service().read({ userId: "operator" }, { organizationId })).toEqual(before);
    expect(
      (
        await database.client.query<{ organization_id: string }>(
          "SELECT organization_id FROM organization_invitations",
        )
      ).rows,
    ).toEqual([{ organization_id: organizationId }]);
    expect(messages).toHaveLength(1);
  });

  it("creates an invitation without granting membership before acceptance", async () => {
    const { organizationId } = await create();

    expect(await service().read({ userId: "operator" }, { organizationId })).toMatchObject({
      status: "ok",
      value: { hasOwner: false, invitation: { acceptedAt: null } },
    });
    expect(
      (await database.client.query<{ user_id: string }>("SELECT user_id FROM memberships")).rows,
    ).toEqual([]);
  });

  it("keeps the stored invitation hash out of the delivered link", async () => {
    await create();
    const stored = (
      await database.client.query<{ token_hash: string }>(
        "SELECT token_hash FROM organization_invitations",
      )
    ).rows[0]?.token_hash;

    assert.isDefined(stored);
    assert.isDefined(messages[0]);
    expect(messages[0].url).not.toContain(stored);
  });

  it("retains the organization and invitation when email delivery fails", async () => {
    sendingFails = true;

    const { organizationId } = await create();

    expect(await service().read({ userId: "operator" }, { organizationId })).toMatchObject({
      status: "ok",
      value: { name: "New Foundation", invitation: { delivery: "failed", revokedAt: null } },
    });
    expect(messages).toEqual([]);
  });

  it("preserves the failed invitation when a delivery retry is still in cooldown", async () => {
    sendingFails = true;
    const { organizationId } = await create();
    const before = await service().read({ userId: "operator" }, { organizationId });
    sendingFails = false;

    const result = await service().invite(
      { userId: "operator" },
      { organizationId, email: "recipient@example.test" },
    );

    expect(result).toEqual({ status: "invitation_cooldown" });
    expect(await service().read({ userId: "operator" }, { organizationId })).toEqual(before);
    expect(messages).toEqual([]);
  });

  it("delivers a working replacement after a failed invitation's cooldown expires", async () => {
    sendingFails = true;
    const { organizationId } = await create();
    await database.client.query(
      "UPDATE organization_invitations SET created_at=clock_timestamp()-interval '2 minutes' WHERE organization_id=$1",
      [organizationId],
    );
    sendingFails = false;

    const result = await service().invite(
      { userId: "operator" },
      { organizationId, email: "recipient@example.test" },
    );

    expect(result.status).toBe("ok");
    expect(messages).toHaveLength(1);
    assert.isDefined(messages[0]);
    expect(messages[0].to).toBe("recipient@example.test");
    expect(await service().read({ userId: "operator" }, { organizationId })).toMatchObject({
      status: "ok",
      value: { invitation: { delivery: "sent", revokedAt: null } },
    });
    const token = messages[0].url.split("/").at(-1)!;
    expect((await service().accept({ userId: "recipient" }, { token })).status).toBe("ok");
  });

  it("invalidates the previous link when replacing the invitation recipient", async () => {
    const { organizationId, token } = await create();

    const result = await service().invite(
      { userId: "operator" },
      { organizationId, email: "replacement@example.test" },
    );

    expect(result.status).toBe("ok");
    expect(await service().accept({ userId: "recipient" }, { token })).toEqual({
      status: "revoked",
    });
    expect(messages).toHaveLength(2);
    expect(messages.at(-1)?.to).toBe("replacement@example.test");
    expect(await service().read({ userId: "operator" }, { organizationId })).toMatchObject({
      status: "ok",
      value: { invitation: { email: "replacement@example.test", revokedAt: null } },
    });
  });

  it("revokes an invitation so its link can no longer grant membership", async () => {
    const { organizationId, token } = await create();

    const result = await service().revoke({ userId: "operator" }, { organizationId });

    expect(result.status).toBe("ok");
    const detail = await service().read({ userId: "operator" }, { organizationId });
    assert(detail.status === "ok");
    expect(detail.value.invitation?.revokedAt).toBeInstanceOf(Date);
    expect(await service().accept({ userId: "recipient" }, { token })).toEqual({
      status: "revoked",
    });
    expect(
      (await database.client.query<{ user_id: string }>("SELECT user_id FROM memberships")).rows,
    ).toEqual([]);
  });

  it("records a name change without changing the workspace address", async () => {
    const { organizationId } = await create();

    const result = await service().rename(
      { userId: "operator" },
      { organizationId, name: "Renamed" },
    );

    expect(result.status).toBe("ok");
    expect(await service().read({ userId: "operator" }, { organizationId })).toMatchObject({
      status: "ok",
      value: { name: "Renamed", slug: "new-foundation" },
    });
    expect(
      (
        await database.client.query<{ action: string }>(
          "SELECT action FROM audit_events WHERE organization_id=$1",
          [organizationId],
        )
      ).rows.map((row) => row.action),
    ).toContain("organization.renamed");
    await service().rename({ userId: "operator" }, { organizationId, name: "Renamed" });
    expect(
      (
        await database.client.query(
          "SELECT id FROM audit_events WHERE action='organization.renamed'",
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("rejects acceptance by an account without the invited email", async () => {
    const { organizationId, token } = await create();
    const before = await service().read({ userId: "operator" }, { organizationId });

    const result = await service(["wrong@example.test"]).accept({ userId: "wrong" }, { token });

    expect(result).toEqual({ status: "wrong_account" });
    expect(
      (await database.client.query<{ user_id: string }>("SELECT user_id FROM memberships")).rows,
    ).toEqual([]);
    expect(await service().read({ userId: "operator" }, { organizationId })).toEqual(before);
  });

  it.each([
    { name: undefined, storedName: "recipient" },
    { name: null, storedName: "recipient" },
    { name: "", storedName: "recipient" },
    { name: "Dana Reed", storedName: "Dana Reed" },
  ])(
    "grants ownership to the existing recipient identity with display name $name",
    async ({ name, storedName }) => {
      const { organizationId, token } = await create();

      const result = await service(undefined, name).accept({ userId: "recipient" }, { token });

      expect(result).toMatchObject({
        status: "ok",
        value: { id: organizationId, canWorkOnGrants: true },
      });
      expect(
        (
          await database.client.query<{ id: string; clerk_user_id: string; name: string }>(
            "SELECT id, clerk_user_id, name FROM app_users WHERE id='recipient'",
          )
        ).rows,
      ).toEqual([{ id: "recipient", clerk_user_id: "recipient", name: storedName }]);
      expect(await service().workspaces({ userId: "recipient" })).toMatchObject({
        status: "ok",
        value: [{ id: organizationId, administration: "owner", role: "program_manager" }],
      });
      expect(await service().workspaces({ userId: "operator" })).toEqual({
        status: "ok",
        value: [],
      });
    },
  );

  it("retries acceptance without duplicating membership or its audit event", async () => {
    const { token } = await create();
    const accepted = await service(undefined, "Dana Reed").accept(
      { userId: "recipient" },
      { token },
    );
    assert(accepted.status === "ok");
    const before = (
      await database.client.query("SELECT accepted_at, accepted_by FROM organization_invitations")
    ).rows;

    const retried = await service(undefined, "Changed later").accept(
      { userId: "recipient" },
      { token },
    );

    expect(retried).toEqual(accepted);
    expect(
      (await database.client.query("SELECT name FROM app_users WHERE id='recipient'")).rows,
    ).toEqual([{ name: "Dana Reed" }]);
    expect(
      (await database.client.query("SELECT accepted_at, accepted_by FROM organization_invitations"))
        .rows,
    ).toEqual(before);
    expect(
      (await database.client.query<{ user_id: string }>("SELECT user_id FROM memberships")).rows,
    ).toEqual([{ user_id: "recipient" }]);
    expect(
      (
        await database.client.query<{ action: string }>(
          "SELECT action FROM audit_events WHERE action='team_invitation.accepted'",
        )
      ).rows,
    ).toEqual([{ action: "team_invitation.accepted" }]);
  });

  it("adds a second workspace without replacing the recipient's existing membership", async () => {
    const first = await create("first");
    assert(
      (await service().accept({ userId: "recipient" }, { token: first.token })).status === "ok",
    );
    const second = await create("second");

    const result = await service().accept({ userId: "recipient" }, { token: second.token });

    expect(result.status).toBe("ok");
    const workspaces = await service().workspaces({ userId: "recipient" });
    assert(workspaces.status === "ok");
    expect(workspaces.value.map((workspace) => workspace.id).sort()).toEqual(
      [first.organizationId, second.organizationId].sort(),
    );
    expect(
      (
        await database.client.query<{ organization_id: string }>(
          "SELECT organization_id FROM audit_events WHERE action='team_invitation.accepted' ORDER BY organization_id",
        )
      ).rows,
    ).toEqual(
      [first.organizationId, second.organizationId]
        .sort()
        .map((organization_id) => ({ organization_id })),
    );
  });

  it.each(["replace", "revoke"] as const)(
    "cannot %s an invitation after ownership is accepted",
    async (action) => {
      const { organizationId, token } = await create();
      assert((await service().accept({ userId: "recipient" }, { token })).status === "ok");
      const before = await service().read({ userId: "operator" }, { organizationId });

      const result =
        action === "replace"
          ? await service().invite(
              { userId: "operator" },
              { organizationId, email: "next@example.test" },
            )
          : await service().revoke({ userId: "operator" }, { organizationId });

      expect(result).toEqual({
        status: "already_joined",
      });
      expect(await service().read({ userId: "operator" }, { organizationId })).toEqual(before);
      expect(messages).toHaveLength(1);
    },
  );

  it("rejects an expired invitation without granting membership", async () => {
    const { organizationId, token } = await create();
    await database.client.query(
      "UPDATE organization_invitations SET expires_at=now()-interval '1 second', created_at=now()-interval '8 days'",
    );
    const before = await service().read({ userId: "operator" }, { organizationId });

    const result = await service().accept({ userId: "recipient" }, { token });

    expect(result).toEqual({
      status: "expired",
    });
    expect(
      (await database.client.query<{ user_id: string }>("SELECT user_id FROM memberships")).rows,
    ).toEqual([]);
    expect(await service().read({ userId: "operator" }, { organizationId })).toEqual(before);
  });

  it("replaces an expired invitation with a link the recipient can accept", async () => {
    const { organizationId } = await create();
    await database.client.query(
      "UPDATE organization_invitations SET expires_at=now()-interval '1 second', created_at=now()-interval '8 days'",
    );

    const result = await service().invite(
      { userId: "operator" },
      { organizationId, email: "recipient@example.test" },
    );

    expect(result.status).toBe("ok");
    expect(messages).toHaveLength(2);
    const replacement = messages.at(-1);
    assert.isDefined(replacement);
    const token = replacement.url.split("/").at(-1)!;
    expect(await service().accept({ userId: "recipient" }, { token })).toMatchObject({
      status: "ok",
      value: { id: organizationId },
    });
  });

  it("rejects a disabled recipient without accepting their invitation", async () => {
    const { organizationId, token } = await create();
    await database.client.query("UPDATE app_users SET active=false WHERE id='recipient'");
    const before = await service().read({ userId: "operator" }, { organizationId });

    const result = await service().accept({ userId: "recipient" }, { token });

    expect(result).toEqual({
      status: "disabled",
    });
    expect(
      (await database.client.query<{ user_id: string }>("SELECT user_id FROM memberships")).rows,
    ).toEqual([]);
    expect(await service().read({ userId: "operator" }, { organizationId })).toEqual(before);
  });

  it("does not restore removed membership through an already accepted invitation", async () => {
    const { token } = await create();
    assert((await service().accept({ userId: "recipient" }, { token })).status === "ok");
    await database.client.query("DELETE FROM memberships");

    const result = await service().accept({ userId: "recipient" }, { token });

    expect(result).toEqual({
      status: "forbidden",
    });
    expect(
      (await database.client.query<{ user_id: string }>("SELECT user_id FROM memberships")).rows,
    ).toEqual([]);
  });

  it("does not grant membership when an accepted invitation belongs to someone else", async () => {
    const invitation = await create();

    expect(
      (await service().accept({ userId: "recipient" }, { token: invitation.token })).status,
    ).toBe("ok");
    expect(
      await service().accept({ userId: "another-recipient" }, { token: invitation.token }),
    ).toEqual({ status: "forbidden" });
    expect(
      (
        await database.client.query<{ clerk_user_id: string | null }>(
          "SELECT clerk_user_id FROM app_users WHERE id='recipient'",
        )
      ).rows,
    ).toEqual([{ clerk_user_id: "recipient" }]);
    expect(
      (
        await database.client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM memberships",
        )
      ).rows[0]?.count,
    ).toBe(1);
    expect(
      (
        await database.client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM audit_events WHERE action='team_invitation.accepted'",
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it("rolls back acceptance while preserving the authenticated identity when its audit write fails", async () => {
    const invitation = await create();
    await database.client.query(
      "ALTER TABLE audit_events ADD CONSTRAINT reject_acceptance_test CHECK (action <> 'team_invitation.accepted')",
    );

    try {
      await expect(
        service(undefined, "Dana Reed").accept(
          { userId: "recipient" },
          { token: invitation.token },
        ),
      ).rejects.toThrow();
      expect(
        (
          await database.client.query(
            "SELECT id, clerk_user_id, name FROM app_users WHERE id='recipient'",
          )
        ).rows,
      ).toEqual([{ id: "recipient", clerk_user_id: "recipient", name: "recipient" }]);
      expect((await database.client.query("SELECT user_id FROM memberships")).rows).toEqual([]);
      expect(
        (
          await database.client.query(
            "SELECT accepted_at, accepted_by FROM organization_invitations",
          )
        ).rows,
      ).toEqual([{ accepted_at: null, accepted_by: null }]);
    } finally {
      await database.client.query(
        "ALTER TABLE audit_events DROP CONSTRAINT reject_acceptance_test",
      );
    }

    expect(
      (
        await service(undefined, "Dana Reed").accept(
          { userId: "recipient" },
          { token: invitation.token },
        )
      ).status,
    ).toBe("ok");
    expect(
      (await database.client.query("SELECT name FROM app_users WHERE id='recipient'")).rows,
    ).toEqual([{ name: "Dana Reed" }]);
  });

  it("serializes acceptance against invitation replacement", async () => {
    const first = await create();
    const results = await Promise.all([
      service().accept({ userId: "recipient" }, { token: first.token }),
      service().invite(
        { userId: "operator" },
        { organizationId: first.organizationId, email: "replacement@example.test" },
      ),
    ]);

    expect(results.map((result) => result.status)).toEqual(expect.arrayContaining(["ok"]));
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(["revoked", "already_joined"]).toContain(
      results.find((result) => result.status !== "ok")?.status,
    );
  });

  it("accepts concurrent retries with only one membership", async () => {
    const { organizationId, token } = await create();

    const accepted = await Promise.all([
      service().accept({ userId: "recipient" }, { token }),
      service().accept({ userId: "recipient" }, { token }),
    ]);

    expect(accepted.every((result) => result.status === "ok")).toBe(true);
    expect(
      (
        await database.client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM memberships WHERE organization_id=$1",
          [organizationId],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it("provisions and accepts with the documented restricted runtime grants", async () => {
    const role = `provision_test_${randomUUID().replaceAll("-", "")}`;
    const rollback = new Error("Rollback temporary role and records");

    await expect(
      withDatabase(database.connectionString, (db) =>
        db.transaction(async (tx) => {
          await tx.execute(
            sql.raw(
              `CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
            ),
          );
          await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
          await tx.execute(
            sql.raw(
              `GRANT SELECT ON app_users, memberships, organizations, organization_invitations, audit_events TO ${role}`,
            ),
          );
          await tx.execute(
            sql.raw(
              `GRANT INSERT ON app_users, memberships, organizations, organization_invitations, audit_events TO ${role}`,
            ),
          );
          await tx.execute(sql.raw(`GRANT UPDATE (id, name) ON app_users TO ${role}`));
          await tx.execute(
            sql.raw(
              `GRANT UPDATE (user_id, role, administration, version) ON memberships TO ${role}`,
            ),
          );
          await tx.execute(sql.raw(`GRANT UPDATE (name) ON organizations TO ${role}`));
          await tx.execute(sql.raw(`GRANT DELETE ON memberships TO ${role}`));
          await tx.execute(
            sql.raw(
              `GRANT UPDATE (revoked_at, accepted_at, accepted_by, delivery) ON organization_invitations TO ${role}`,
            ),
          );
          await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
          let actor = "operator";
          const operations = createOrganizationService({
            database: (operation) => operation(tx),
            isOperator: (identity) => identity.userId === "operator",
            verifiedEmails: async () => [`${actor}@example.test`],
            sendInvitation: async (message) => {
              messages.push(message);
            },
            invitationUrl: (token) =>
              new URL(`/invitations/${token}`, "https://merit.example.test").href,
          });
          const id = randomUUID();

          expect(
            (
              await operations.create(
                { userId: actor },
                {
                  requestId: id,
                  name: "Restricted",
                  slug: "restricted",
                  email: "original@example.test",
                },
              )
            ).status,
          ).toBe("ok");
          expect((await operations.list({ userId: actor })).status).toBe("ok");
          expect((await operations.read({ userId: actor }, { organizationId: id })).status).toBe(
            "ok",
          );
          expect(
            (await operations.rename({ userId: actor }, { organizationId: id, name: "Renamed" }))
              .status,
          ).toBe("ok");
          expect((await operations.revoke({ userId: actor }, { organizationId: id })).status).toBe(
            "ok",
          );
          expect(
            (
              await operations.invite(
                { userId: actor },
                { organizationId: id, email: "recipient@example.test" },
              )
            ).status,
          ).toBe("ok");

          actor = "recipient";

          expect(
            (
              await operations.accept(
                { userId: actor },
                { token: messages.at(-1)!.url.split("/").at(-1)! },
              )
            ).status,
          ).toBe("ok");
          expect((await operations.workspaces({ userId: actor })).status).toBe("ok");
          expect(
            (
              await operations.inviteMember(
                { userId: actor },
                {
                  workspaceSlug: "restricted",
                  requestId: randomUUID(),
                  email: "colleague@example.test",
                  administration: "none",
                  role: "program_manager",
                },
              )
            ).status,
          ).toBe("ok");

          actor = "colleague";

          expect(
            (
              await operations.accept(
                { userId: actor },
                { token: messages.at(-1)!.url.split("/").at(-1)! },
              )
            ).status,
          ).toBe("ok");

          actor = "recipient";
          const team = await operations.team({ userId: actor }, { workspaceSlug: "restricted" });

          if (team.status !== "ok") {
            throw new Error(team.status);
          }

          const member = team.value.members.find((m) => m.email === "colleague@example.test")!;
          const request = {
            workspaceSlug: "restricted",
            userId: member.userId,
            expectedMembershipId: member.membershipId,
            expectedVersion: member.version,
            expectedInvitationIds: [],
          };

          expect(
            (
              await operations.changeMember(
                { userId: actor },
                {
                  ...request,
                  administration: "administrator",
                  role: "member",
                },
              )
            ).status,
          ).toBe("ok");
          expect(
            (
              await operations.removeMember(
                { userId: actor },
                {
                  ...request,
                  expectedMembershipId: member.membershipId,
                  expectedVersion: member.version + 1,
                },
              )
            ).status,
          ).toBe("ok");

          throw rollback;
        }),
      ),
    ).rejects.toBe(rollback);
  });
});
