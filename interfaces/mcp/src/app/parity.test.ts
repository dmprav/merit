import { expect, it, vi } from "vite-plus/test";

import { actor, connect, endpoint } from "../../tests/client";
import { testOperations } from "../../tests/operations";
import { handleWorkspaceMcp } from "../index";

const assignmentId = "00000000-0000-4000-a000-000000000001";
const commandId = "00000000-0000-4000-a000-000000000002";
const applicationId = "k7m2p9x4n6rt";
const address = { workspaceSlug: "alder", applicationId };
const summary = {
  id: assignmentId,
  requestId: commandId,
  revision: 3,
  status: "accepted" as const,
  reviewer: "Sam",
  hasSubmitted: false,
  email: "sam@example.test",
  applicationTitle: "Meals",
  applicant: "Neighbours",
  organization: "Alder",
  dueDate: null,
  managerName: "Dana",
  managerEmail: "dana@example.test",
  applicationVersion: 1,
  criteriaVersion: 1,
  basisComparison: {
    applicationVersion: "same" as const,
    criteriaVersion: "same" as const,
    criteriaContent: "same" as const,
  },
  materialChanged: false,
  criteriaChanged: false,
  conflict: "",
  delivery: "sent" as const,
  notification: null,
  expiresAt: "2026-12-01T00:00:00.000Z",
};
const draft = {
  position: "Fund" as const,
  amount: "40.50",
  reasoning: "Evidence",
  observations: [],
  note: "",
};

it("discovers and dispatches every new workflow with verified identity and original preconditions", async () => {
  const operations = testOperations();
  const cases = [
    {
      name: "list_my_reviews",
      args: {},
      fn: operations.reviewer.list,
      input: undefined,
      result: { status: "ok", value: [] },
    },
    {
      name: "get_reviewer_assignment",
      args: { assignmentId },
      fn: operations.reviewer.read,
      result: { status: "not_found" },
    },
    {
      name: "list_application_reviewers",
      args: address,
      fn: operations.reviewer.forApplication,
      input: { workspaceSlug: "alder", publicId: applicationId },
      result: { status: "ok", value: [] },
    },
    {
      name: "invite_reviewer",
      args: { ...address, commandId, requestId: assignmentId, dueDate: null },
      fn: operations.reviewer.invite,
      input: {
        workspaceSlug: "alder",
        publicId: applicationId,
        commandId,
        requestId: assignmentId,
        dueDate: null,
      },
      result: { status: "ok", value: summary },
    },
    {
      name: "manage_reviewer_assignment",
      args: {
        ...address,
        assignmentId,
        commandId,
        expectedRevision: 3,
        action: "clear_conflict",
        note: "Reviewed",
      },
      fn: operations.reviewer.manage,
      input: {
        workspaceSlug: "alder",
        publicId: applicationId,
        assignmentId,
        commandId,
        expectedRevision: 3,
        action: "clear_conflict",
        note: "Reviewed",
      },
      result: { status: "ok", value: summary },
    },
    {
      name: "respond_to_review",
      args: { assignmentId, commandId, expectedRevision: 3, action: "accept", note: "" },
      fn: operations.reviewer.respond,
      result: { status: "ok", value: summary },
    },
    {
      name: "save_reviewer_draft",
      args: { assignmentId, commandId, expectedDraftRevision: 7, draft },
      fn: operations.reviewer.saveDraft,
      result: { status: "ok", value: { revision: 8 } },
    },
    {
      name: "submit_reviewer_assessment",
      args: { assignmentId, commandId, expectedDraftRevision: 8 },
      fn: operations.reviewer.submit,
      result: { status: "ok", value: { revision: 9 } },
    },
    {
      name: "list_workspace_activity",
      args: { workspaceSlug: "alder", roundId: applicationId, personId: "dana", limit: 25 },
      fn: operations.grantmaking.listWorkspaceActivity,
      result: { status: "ok", entries: [], people: [], nextCursor: null },
    },
    {
      name: "get_team",
      args: { workspaceSlug: "alder" },
      fn: operations.organizations.teamOverview,
      result: {
        status: "ok",
        value: {
          organization: { name: "Alder", slug: "alder", kind: "standard" as const },
          subject: {
            userId: "dana",
            organizationId: "org",
            active: true,
            administration: "administrator" as const,
            role: "program_manager" as const,
          },
          canManageMembers: true,
        },
      },
    },
    {
      name: "list_team_members",
      args: { workspaceSlug: "alder" },
      fn: operations.organizations.membersPage,
      input: { workspaceSlug: "alder", limit: 20 },
      result: { status: "ok", value: { members: [], nextCursor: null } },
    },
    {
      name: "get_navigation_pins",
      args: {},
      fn: operations.navigation.read,
      input: undefined,
      result: { status: "ok", pins: [] },
    },
    {
      name: "change_navigation_pin",
      args: { action: "move", target: { kind: "review", id: assignmentId }, before: null },
      fn: operations.navigation.change,
      result: { status: "ok", pins: [] },
    },
    {
      name: "list_organizations",
      args: {},
      fn: operations.organizations.list,
      input: undefined,
      result: { status: "ok", value: [] },
    },
    {
      name: "get_organization",
      args: { organizationId: "org" },
      fn: operations.organizations.read,
      result: { status: "forbidden" },
    },
    {
      name: "create_organization",
      args: { requestId: commandId, name: "Alder", slug: "alder", email: "sam@example.test" },
      fn: operations.organizations.create,
      result: { status: "ok", value: { organizationId: "org" } },
    },
    {
      name: "rename_organization",
      args: { organizationId: "org", name: "Alder Trust" },
      fn: operations.organizations.rename,
      result: { status: "ok", value: null },
    },
    {
      name: "replace_owner_invitation",
      args: { organizationId: "org", email: "sam@example.test" },
      fn: operations.organizations.invite,
      result: { status: "ok", value: null },
    },
    {
      name: "revoke_owner_invitation",
      args: { organizationId: "org" },
      fn: operations.organizations.revoke,
      result: { status: "ok", value: null },
    },
    {
      name: "list_access_requests",
      args: {},
      fn: operations.organizations.accessRequests,
      input: undefined,
      result: { status: "ok", value: [] },
    },
    {
      name: "review_access_request",
      args: { email: "sam@example.test" },
      fn: operations.organizations.reviewAccessRequest,
      result: { status: "not_found" },
    },
    {
      name: "get_membership_invitation",
      args: { token: "a".repeat(64) },
      fn: operations.organizations.invitation,
      result: { status: "wrong_account" },
    },
    {
      name: "accept_membership_invitation",
      args: { token: "a".repeat(64) },
      fn: operations.organizations.accept,
      result: { status: "wrong_account" },
    },
    {
      name: "get_demo",
      args: {},
      fn: operations.demo.read,
      input: undefined,
      result: { status: "empty" },
    },
    {
      name: "start_demo",
      args: {},
      fn: operations.demo.start,
      input: { fresh: false },
      result: { status: "expired" },
    },
    {
      name: "reset_demo",
      args: { resetWorkspaceId: "old-demo" },
      fn: operations.demo.start,
      input: { fresh: true, resetWorkspaceId: "old-demo" },
      result: {
        status: "ready",
        workspaceId: "new-demo",
        workspaceSlug: "demo-new",
        expiresAt: summary.expiresAt,
      },
    },
  ];
  const client = await connect(operations);
  try {
    const tools = (await client.listTools()).tools;
    for (const test of cases) {
      vi.mocked<(...args: never[]) => Promise<unknown>>(test.fn).mockResolvedValueOnce(test.result);
      expect(tools.find((tool) => tool.name === test.name)?.outputSchema).toBeDefined();
      const response = await client.callTool({ name: test.name, arguments: test.args });
      expect(response.structuredContent, test.name).not.toMatchObject({ status: "unavailable" });
      const input = "input" in test ? test.input : test.args;
      expect(test.fn).toHaveBeenLastCalledWith(...(input === undefined ? [actor] : [actor, input]));
    }
    vi.mocked(operations.organizations.requestAccess).mockResolvedValueOnce({ status: "ok" });
    expect(
      (
        await client.callTool({
          name: "request_workspace_access",
          arguments: { email: "Sam@example.test" },
        })
      ).structuredContent,
    ).toEqual({ status: "ok" });
    expect(operations.organizations.requestAccess).toHaveBeenCalledWith({
      email: "sam@example.test",
    });
    expect(
      tools.find((tool) => tool.name === "replace_owner_invitation")?.annotations,
    ).toMatchObject({ openWorldHint: true, idempotentHint: false });
  } finally {
    await client.close();
  }
});

it.each([
  ["get_reviewer_assignment", "reviews:read"],
  ["submit_reviewer_assessment", "reviews:write"],
  ["get_navigation_pins", "profile:read"],
  ["change_navigation_pin", "profile:write"],
  ["get_membership_invitation", "onboarding:read"],
  ["accept_membership_invitation", "onboarding:write"],
  ["list_organizations", "admin:read"],
  ["create_organization", "admin:write"],
])("requires the dedicated scope for %s", async (name, scope) => {
  const operations = testOperations();
  const response = await handleWorkspaceMcp(
    new Request(endpoint, {
      method: "POST",
      headers: {
        host: endpoint.host,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: {} },
      }),
    }),
    endpoint.href,
    {
      ...operations,
      authenticate: async () => ({
        ...actor,
        scopes: ["workspace:read", "grants:write", "team:write"],
      }),
    },
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("WWW-Authenticate")).toContain(scope);
  for (const service of Object.values(operations)) {
    for (const operation of Object.values(service)) {
      expect(operation).not.toHaveBeenCalled();
    }
  }
});

it("returns the reviewer's complete validated page and strips uncontracted fields", async () => {
  const operations = testOperations();
  const page = {
    assignment: summary,
    material: null,
    criteria: null,
    draft: { revision: 7, content: draft },
    assessment: null,
    privateInternalField: "hidden",
  };
  vi.mocked(operations.reviewer.read).mockResolvedValue({ status: "ok", value: page });
  const client = await connect(operations);
  try {
    const result = await client.callTool({
      name: "get_reviewer_assignment",
      arguments: { assignmentId },
    });
    expect(result.structuredContent).toMatchObject({
      status: "ok",
      draft: { revision: 7, content: draft },
    });
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify(result.structuredContent) },
    ]);
  } finally {
    await client.close();
  }
});

it("paginates visible assignments in stable ID order", async () => {
  const operations = testOperations();
  vi.mocked(operations.reviewer.list).mockResolvedValue({
    status: "ok",
    value: [{ ...summary, id: commandId }, summary],
  });
  const client = await connect(operations);
  try {
    expect(
      (await client.callTool({ name: "list_my_reviews", arguments: { limit: 1 } }))
        .structuredContent,
    ).toEqual({ status: "ok", assignments: [summary], nextCursor: assignmentId });
    expect(
      (
        await client.callTool({
          name: "list_my_reviews",
          arguments: { limit: 1, after: assignmentId },
        })
      ).structuredContent,
    ).toEqual({ status: "ok", assignments: [{ ...summary, id: commandId }], nextCursor: null });
  } finally {
    await client.close();
  }
});

it("unwraps domain fields in reviewer, organization, and demo responses", async () => {
  const operations = testOperations();
  vi.mocked(operations.reviewer.saveDraft).mockResolvedValue({
    status: "ok",
    value: { revision: 8 },
  });
  vi.mocked(operations.organizations.create).mockResolvedValue({
    status: "ok",
    value: { organizationId: "org" },
  });
  vi.mocked(operations.demo.read).mockResolvedValue({ status: "empty" });
  const client = await connect(operations);
  try {
    expect(
      (
        await client.callTool({
          name: "save_reviewer_draft",
          arguments: { assignmentId, commandId, expectedDraftRevision: 7, draft },
        })
      ).structuredContent,
    ).toEqual({ status: "ok", draftRevision: 8 });
    expect(
      (
        await client.callTool({
          name: "create_organization",
          arguments: {
            requestId: commandId,
            name: "Alder",
            slug: "alder",
            email: "sam@example.test",
          },
        })
      ).structuredContent,
    ).toEqual({ status: "ok", organizationId: "org" });
    expect((await client.callTool({ name: "get_demo", arguments: {} })).structuredContent).toEqual({
      status: "ok",
      demo: { status: "empty" },
    });
  } finally {
    await client.close();
  }
});

it("rejects an empty review list page before listing assignments", async () => {
  const operations = testOperations();
  const client = await connect(operations);
  try {
    expect(
      (await client.callTool({ name: "list_my_reviews", arguments: { limit: 0 } })).isError,
    ).toBe(true);
    expect(operations.reviewer.list).not.toHaveBeenCalled();
  } finally {
    await client.close();
  }
});

it.each(["expired", "limited", "unavailable"] as const)(
  "reports demo %s as an unsuccessful start",
  async (status) => {
    const operations = testOperations();
    vi.mocked(operations.demo.start).mockResolvedValue({ status });
    const client = await connect(operations);
    try {
      const result = await client.callTool({ name: "start_demo", arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({ status });
    } finally {
      await client.close();
    }
  },
);
