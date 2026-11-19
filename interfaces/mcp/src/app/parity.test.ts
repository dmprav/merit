import { expect, it, vi } from "vite-plus/test";

import { actor, connect } from "../../tests/client";
import { testOperations } from "../../tests/operations";

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
  workspaceSlug: "alder",
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

type DispatchCase = {
  name: string;
  args: Record<string, unknown>;
  fn: (operations: ReturnType<typeof testOperations>) => (...args: never[]) => Promise<unknown>;
  input?: unknown;
  result: unknown;
};

const membership = {
  workspaceSlug: "alder",
  userId: "sam",
  expectedMembershipId: "00000000-0000-4000-a000-000000000003",
  expectedMembershipVersion: 3,
  expectedInvitationIds: [commandId],
};

const dispatchCases: DispatchCase[] = [
  {
    name: "list_my_reviews",
    args: {},
    fn: (o) => o.reviewer.list,
    input: undefined,
    result: { status: "ok", value: [] },
  },
  {
    name: "get_reviewer_assignment",
    args: { assignmentId },
    fn: (o) => o.reviewer.read,
    result: { status: "not_found" },
  },
  {
    name: "list_application_reviewers",
    args: address,
    fn: (o) => o.reviewer.forApplication,
    input: { workspaceSlug: "alder", publicId: applicationId },
    result: { status: "ok", value: [] },
  },
  {
    name: "invite_reviewer",
    args: { ...address, commandId, requestId: assignmentId, dueDate: null },
    fn: (o) => o.reviewer.invite,
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
    fn: (o) => o.reviewer.manage,
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
    fn: (o) => o.reviewer.respond,
    result: { status: "ok", value: summary },
  },
  {
    name: "save_reviewer_draft",
    args: { assignmentId, commandId, expectedDraftRevision: 7, draft },
    fn: (o) => o.reviewer.saveDraft,
    result: { status: "ok", value: { revision: 8 } },
  },
  {
    name: "submit_reviewer_assessment",
    args: { assignmentId, commandId, expectedDraftRevision: 8 },
    fn: (o) => o.reviewer.submit,
    result: { status: "ok", value: { revision: 9 } },
  },
  {
    name: "list_workspace_activity",
    args: { workspaceSlug: "alder", roundId: applicationId, personId: "dana", limit: 25 },
    fn: (o) => o.grantmaking.listWorkspaceActivity,
    result: { status: "ok", entries: [], people: [], nextCursor: null },
  },
  {
    name: "search_workspace",
    args: { workspaceSlug: "alder", query: "harbour trust" },
    fn: (o) => o.grantmaking.searchWorkspace,
    result: {
      status: "ok",
      rounds: { results: [], total: 0 },
      applications: {
        total: 1,
        results: [
          {
            id: applicationId,
            title: "Boat repairs",
            applicant: "Trust for the Harbour",
            roundId: "b8q3w5j7c2df",
            roundTitle: "Community grants",
            intakeStatus: "ready" as const,
            withdrawn: false,
            matchQuality: "contains" as const,
          },
        ],
      },
    },
  },
  {
    name: "get_team",
    args: { workspaceSlug: "alder" },
    fn: (o) => o.organizations.teamOverview,
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
    fn: (o) => o.organizations.membersPage,
    input: { workspaceSlug: "alder", limit: 20 },
    result: { status: "ok", value: { members: [], nextCursor: null } },
  },
  {
    name: "change_member",
    args: { ...membership, administration: "none", role: "reviewer" },
    fn: (o) => o.organizations.changeMember,
    result: { status: "conflict" },
  },
  {
    name: "remove_member",
    args: membership,
    fn: (o) => o.organizations.removeMember,
    result: { status: "conflict" },
  },
  {
    name: "get_navigation_pins",
    args: {},
    fn: (o) => o.navigation.read,
    input: undefined,
    result: { status: "ok", pins: [] },
  },
  {
    name: "change_navigation_pin",
    args: { action: "move", target: { kind: "review", id: assignmentId }, before: null },
    fn: (o) => o.navigation.change,
    result: { status: "ok", pins: [] },
  },
  {
    name: "list_organizations",
    args: {},
    fn: (o) => o.organizations.list,
    input: undefined,
    result: { status: "ok", value: [] },
  },
  {
    name: "get_organization",
    args: { organizationId: "org" },
    fn: (o) => o.organizations.read,
    result: { status: "forbidden" },
  },
  {
    name: "create_organization",
    args: { requestId: commandId, name: "Alder", slug: "alder", email: "sam@example.test" },
    fn: (o) => o.organizations.create,
    result: { status: "ok", value: { organizationId: "org" } },
  },
  {
    name: "rename_organization",
    args: { organizationId: "org", name: "Alder Trust" },
    fn: (o) => o.organizations.rename,
    result: { status: "ok", value: null },
  },
  {
    name: "replace_owner_invitation",
    args: { organizationId: "org", email: "sam@example.test" },
    fn: (o) => o.organizations.invite,
    result: { status: "ok", value: null },
  },
  {
    name: "revoke_owner_invitation",
    args: { organizationId: "org" },
    fn: (o) => o.organizations.revoke,
    result: { status: "ok", value: null },
  },
  {
    name: "list_access_requests",
    args: {},
    fn: (o) => o.organizations.accessRequests,
    input: undefined,
    result: { status: "ok", value: [] },
  },
  {
    name: "review_access_request",
    args: { email: "sam@example.test" },
    fn: (o) => o.organizations.reviewAccessRequest,
    result: { status: "not_found" },
  },
  {
    name: "get_membership_invitation",
    args: { token: "a".repeat(64) },
    fn: (o) => o.organizations.invitation,
    result: { status: "wrong_account" },
  },
  {
    name: "accept_membership_invitation",
    args: { token: "a".repeat(64) },
    fn: (o) => o.organizations.accept,
    result: { status: "wrong_account" },
  },
  {
    name: "get_demo",
    args: {},
    fn: (o) => o.demo.read,
    input: undefined,
    result: { status: "empty" },
  },
  {
    name: "start_demo",
    args: {},
    fn: (o) => o.demo.start,
    input: { fresh: false },
    result: { status: "expired" },
  },
  {
    name: "reset_demo",
    args: { resetWorkspaceId: "old-demo" },
    fn: (o) => o.demo.start,
    input: { fresh: true, resetWorkspaceId: "old-demo" },
    result: {
      status: "ready",
      workspaceId: "new-demo",
      workspaceSlug: "demo-new",
      expiresAt: summary.expiresAt,
    },
  },
];

it.each(dispatchCases)(
  "dispatches $name with the verified actor and original input",
  async ({ name, args, fn, result, ...test }) => {
    const operations = testOperations();
    const operation = fn(operations);
    vi.mocked(operation).mockResolvedValueOnce(result);
    const client = await connect(operations);
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.find((tool) => tool.name === name)?.outputSchema).toBeDefined();
      const response = await client.callTool({ name, arguments: args });
      expect(response.structuredContent).not.toMatchObject({ status: "unavailable" });
      const input = "input" in test ? test.input : args;
      expect(operation).toHaveBeenCalledExactlyOnceWith(
        ...(input === undefined ? [actor] : [actor, input]),
      );
    } finally {
      await client.close();
    }
  },
);

it("requests workspace access with a normalized email and no actor", async () => {
  const operations = testOperations();
  vi.mocked(operations.organizations.requestAccess).mockResolvedValueOnce({ status: "ok" });
  const client = await connect(operations);
  try {
    expect(
      (
        await client.callTool({
          name: "request_workspace_access",
          arguments: { email: "Sam@example.test" },
        })
      ).structuredContent,
    ).toEqual({ status: "ok" });
    expect(operations.organizations.requestAccess).toHaveBeenCalledExactlyOnceWith({
      email: "sam@example.test",
    });
  } finally {
    await client.close();
  }
});

it("marks owner invitation replacement as a non-idempotent external delivery", async () => {
  const client = await connect(testOperations());
  try {
    const tools = (await client.listTools()).tools;
    expect(
      tools.find((tool) => tool.name === "replace_owner_invitation")?.annotations,
    ).toMatchObject({ openWorldHint: true, idempotentHint: false });
  } finally {
    await client.close();
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

it.each([
  {
    name: "save_reviewer_draft",
    args: { assignmentId, commandId, expectedDraftRevision: 7, draft },
    fn: (o: ReturnType<typeof testOperations>) => o.reviewer.saveDraft,
    result: { status: "ok", value: { revision: 8 } },
    expected: { status: "ok", draftRevision: 8 },
  },
  {
    name: "create_organization",
    args: { requestId: commandId, name: "Alder", slug: "alder", email: "sam@example.test" },
    fn: (o: ReturnType<typeof testOperations>) => o.organizations.create,
    result: { status: "ok", value: { organizationId: "org" } },
    expected: { status: "ok", organizationId: "org" },
  },
  {
    name: "get_demo",
    args: {},
    fn: (o: ReturnType<typeof testOperations>) => o.demo.read,
    result: { status: "empty" },
    expected: { status: "ok", demo: { status: "empty" } },
  },
])(
  "unwraps the domain result in the $name response",
  async ({ name, args, fn, result, expected }) => {
    const operations = testOperations();
    vi.mocked(fn(operations) as (...args: never[]) => Promise<unknown>).mockResolvedValue(result);
    const client = await connect(operations);
    try {
      expect((await client.callTool({ name, arguments: args })).structuredContent).toEqual(
        expected,
      );
    } finally {
      await client.close();
    }
  },
);

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
