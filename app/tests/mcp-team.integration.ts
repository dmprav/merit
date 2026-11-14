import { randomUUID } from "node:crypto";

import { expect } from "vite-plus/test";

import { actor } from "@merit/organizations/testing/workspace";

import { transportTest as it } from "./fixtures/transport-test";

it("creates, retries, lists and revokes an invitation through MCP", async ({
  database,
  transport: { callMcp },
}) => {
  await database.client.query(
    "UPDATE memberships SET administration='administrator' WHERE user_id='dana'",
  );
  const invitation = {
    workspaceSlug: "alder",
    requestId: randomUUID(),
    email: "mcp-colleague@example.test",
    administration: "none",
    role: "program_manager",
  };

  expect((await callMcp(actor.userId, invitation, "invite_member")).isError).toBe(false);
  expect((await callMcp(actor.userId, invitation, "invite_member")).isError).toBe(false);

  const state = await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_team_invitations");

  expect(state.structuredContent).toMatchObject({
    status: "ok",
    invitations: [expect.objectContaining({ id: invitation.requestId })],
  });
  expect(
    (
      await callMcp(
        actor.userId,
        { workspaceSlug: "alder", invitationId: invitation.requestId },
        "revoke_member_invitation",
      )
    ).isError,
  ).toBe(false);

  const after = await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_team_invitations");
  expect(after.structuredContent).toMatchObject({ status: "ok", invitations: [] });
  const { rows } = await database.client.query(
    "SELECT actor_user_id, provenance FROM audit_events WHERE organization_id='alder' AND action LIKE '%revoked' AND target_id=$1",
    [invitation.requestId],
  );
  expect(rows).toEqual([
    {
      actor_user_id: actor.userId,
      provenance: { interface: "mcp", clientId: "integration-client" },
    },
  ]);
});

it("requires team OAuth scope even for a workspace administrator", async ({
  database,
  transport: { callMcp },
}) => {
  await database.client.query(
    "UPDATE memberships SET administration='administrator' WHERE user_id='dana'",
  );
  const invitation = {
    workspaceSlug: "alder",
    requestId: randomUUID(),
    email: "mcp-colleague@example.test",
    administration: "none",
    role: "program_manager",
  };
  await expect(
    callMcp(actor.userId, invitation, "invite_member", ["workspace:read", "grants:write"]),
  ).rejects.toThrow();
});

it("requires current team authority even with granted MCP scopes", async ({
  database,
  transport: { callMcp },
}) => {
  const invitation = {
    workspaceSlug: "alder",
    requestId: randomUUID(),
    email: "mcp-colleague@example.test",
    administration: "none",
    role: "program_manager",
  };
  await database.client.query("UPDATE memberships SET administration='none' WHERE user_id='dana'");

  expect(
    (await callMcp(actor.userId, { ...invitation, requestId: randomUUID() }, "invite_member"))
      .structuredContent,
  ).toEqual({ status: "forbidden" });
});

it("rejects grant writes from a read-only MCP client", async ({ transport: { callMcp } }) => {
  await expect(
    callMcp(
      actor.userId,
      { workspaceSlug: "alder", requestId: randomUUID(), title: "Read-only client" },
      "create_funding_round",
      ["workspace:read"],
    ),
  ).rejects.toThrow();
});
