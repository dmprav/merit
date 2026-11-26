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
  /** The structured tool result; a result the tool passes through unchanged when omitted. */
  response?: unknown;
};

const roundId = "b8q3w5j7c2df";
const listedRound = {
  roundId,
  title: "Community grants",
  preparationRevision: 0,
  criteriaVersion: 1,
  budget: null,
  applicationCount: 0,
};
const recommendation = {
  position: "Fund",
  allocation: { minorUnits: "4050", currency: "EUR" },
  reasoning: "Local benefit",
};
const contactId = "00000000-0000-4000-a000-000000000004";
const contact = {
  contactId,
  contactRevision: 2,
  name: "Sam",
  email: "sam@example.test",
  affiliation: "Review panel",
  archived: false,
};
const dispatchCases: DispatchCase[] = [
  {
    name: "list_my_reviews",
    args: {},
    fn: (o) => o.reviewer.list,
    input: undefined,
    result: { status: "ok", value: [] },
    response: { status: "ok", assignments: [], nextPage: null },
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
    response: { status: "ok", assignments: [], nextPage: null },
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
    response: { status: "ok", assignment: summary },
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
    response: { status: "ok", assignment: summary },
  },
  {
    name: "respond_to_review",
    args: { assignmentId, commandId, expectedRevision: 3, action: "accept", note: "" },
    fn: (o) => o.reviewer.respond,
    result: { status: "ok", value: summary },
    response: { status: "ok", assignment: summary },
  },
  {
    name: "save_reviewer_draft",
    args: { assignmentId, commandId, expectedDraftRevision: 7, draft },
    fn: (o) => o.reviewer.saveDraft,
    result: { status: "ok", value: { revision: 8 } },
    response: { status: "ok", draftRevision: 8 },
  },
  {
    name: "submit_reviewer_assessment",
    args: { assignmentId, commandId, expectedDraftRevision: 8 },
    fn: (o) => o.reviewer.submit,
    result: { status: "ok", value: { revision: 9 } },
    response: { status: "ok", draftRevision: 9 },
  },
  {
    name: "list_team_members",
    args: { workspaceSlug: "alder" },
    fn: (o) => o.organizations.membersPage,
    input: { workspaceSlug: "alder", limit: 20 },
    result: { status: "ok", value: { members: [], nextCursor: null } },
    response: { status: "ok", members: [], nextPage: null },
  },
  {
    name: "start_demo",
    args: {},
    fn: (o) => o.demo.start,
    input: { fresh: false },
    result: { status: "expired" },
  },
  {
    name: "create_application",
    args: { workspaceSlug: "alder", roundId, requestId: commandId, title: "Meals" },
    fn: (o) => o.applications.createApplication,
    input: { workspaceSlug: "alder", publicId: roundId, requestId: commandId, title: "Meals" },
    result: { status: "ok", publicId: applicationId },
    response: { status: "ok", applicationId },
  },
  {
    name: "select_application_contact",
    args: { ...address, expectedIntakeRevision: 4, contactId },
    fn: (o) => o.applications.selectContact,
    input: { workspaceSlug: "alder", publicId: applicationId, expectedRevision: 4, contactId },
    result: { status: "ok", revision: 5 },
    response: { status: "ok", applicationId, intakeRevision: 5 },
  },
  {
    name: "discard_application_revision",
    args: { ...address, expectedIntakeRevision: 4 },
    fn: (o) => o.applications.editApplication,
    input: {
      workspaceSlug: "alder",
      publicId: applicationId,
      expectedRevision: 4,
      change: { action: "discard_revision" },
    },
    result: { status: "ok", revision: 5 },
    response: { status: "ok", applicationId, intakeRevision: 5 },
  },
  {
    name: "delete_funding_round",
    args: { workspaceSlug: "alder", roundId, expectedPreparationRevision: 2 },
    fn: (o) => o.rounds.deleteRound,
    input: { workspaceSlug: "alder", publicId: roundId, expectedRevision: 2 },
    result: { status: "ok" },
    response: { status: "ok", roundId, deleted: true },
  },
  {
    name: "cancel_review_request",
    args: {
      ...address,
      expectedReviewRevision: 3,
      expectedApplicationVersion: 1,
      expectedCriteriaVersion: 2,
      id: assignmentId,
    },
    fn: (o) => o.reviews.saveReview,
    input: {
      workspaceSlug: "alder",
      publicId: applicationId,
      expectedRevision: 3,
      expectedApplicationVersion: 1,
      expectedCriteriaVersion: 2,
      change: { action: "cancel", id: assignmentId },
    },
    result: { status: "ok", revision: 4 },
    response: { status: "ok", applicationId, reviewRevision: 4 },
  },
  {
    name: "save_recommendation",
    args: {
      ...address,
      expectedRecommendationRevision: 2,
      expectedApplicationVersion: 1,
      expectedCurrentAssessment: { id: "5c9c099c-fb4f-426c-81a0-5fa354b5bd0a", version: 2 },
      recommendation,
    },
    fn: (o) => o.recommendations.saveRecommendation,
    input: {
      workspaceSlug: "alder",
      publicId: applicationId,
      expectedRevision: 2,
      expectedApplicationVersion: 1,
      expectedCurrentAssessment: { id: "5c9c099c-fb4f-426c-81a0-5fa354b5bd0a", version: 2 },
      recommendation,
    },
    result: { status: "conflict" },
  },
  {
    name: "record_committee_decision",
    args: {
      ...address,
      outcome: "Fund with conditions",
      amount: { minorUnits: "2400000", currency: "EUR" },
      conditions: "Confirm the venue.",
      reason: "Strong plan.",
      decidedBy: "Funding committee",
      decisionDate: "2027-01-19",
      changeExplanation: "Corrected the amount.",
      expectedDecisionRevision: 2,
    },
    fn: (o) => o.decisions.recordDecision,
    input: {
      workspaceSlug: "alder",
      publicId: applicationId,
      expectedRevision: 2,
      decision: {
        outcome: "Fund with conditions",
        amount: { minorUnits: "2400000", currency: "EUR" },
        conditions: "Confirm the venue.",
        reason: "Strong plan.",
        decidedBy: "Funding committee",
        decisionDate: "2027-01-19",
        changeExplanation: "Corrected the amount.",
      },
    },
    result: { status: "conflict" },
  },
  {
    name: "list_reviewer_history",
    args: { ...address, assignmentId },
    fn: (o) => o.reviewer.history,
    input: { workspaceSlug: "alder", publicId: applicationId, assignmentId, limit: 20 },
    result: {
      status: "ok",
      value: {
        entries: [{ action: "accepted", actor: "Sam", at: summary.expiresAt, note: "" }],
        nextCursor: null,
      },
    },
    response: {
      status: "ok",
      entries: [{ action: "accepted", actor: "Sam", at: summary.expiresAt, note: "" }],
      nextPage: null,
    },
  },
  {
    name: "list_contacts",
    args: { workspaceSlug: "alder", archived: false },
    fn: (o) => o.contacts.listContactSummaries,
    input: { workspaceSlug: "alder", archived: false, limit: 20 },
    result: { status: "ok", contacts: [contact], nextCursor: contactId },
    response: {
      status: "ok",
      contacts: [contact],
      nextPage: { workspaceSlug: "alder", archived: false, limit: 20, after: contactId },
    },
  },
  {
    name: "get_contact",
    args: { workspaceSlug: "alder", contactId },
    fn: (o) => o.contacts.getContact,
    result: { status: "ok", contact },
  },
  {
    name: "list_application_reviews",
    args: address,
    fn: (o) => o.grantmaking.listReviews,
    input: { ...address, limit: 20 },
    result: { status: "ok", reviews: [], nextCursor: null },
    response: { status: "ok", reviews: [], nextPage: null },
  },
  {
    name: "list_funding_rounds",
    args: { workspaceSlug: "alder", limit: 1 },
    fn: (o) => o.grantmaking.listRoundSummaries,
    result: { status: "ok", rounds: [listedRound], nextCursor: roundId },
    response: {
      status: "ok",
      rounds: [listedRound],
      nextPage: { workspaceSlug: "alder", limit: 1, after: roundId },
    },
  },
  {
    name: "list_funding_round_history",
    args: { workspaceSlug: "alder", roundId, limit: 1 },
    fn: (o) => o.grantmaking.roundHistory,
    result: {
      status: "ok",
      entries: [
        { revision: 0, action: "round.created", recordedAt: summary.expiresAt, budgetChange: null },
      ],
      nextRevision: 0,
    },
    response: {
      status: "ok",
      entries: [
        { revision: 0, action: "round.created", recordedAt: summary.expiresAt, budgetChange: null },
      ],
      nextPage: { workspaceSlug: "alder", roundId, limit: 1, afterRevision: 0 },
    },
  },
  {
    name: "list_funding_round_history",
    args: { workspaceSlug: "alder", roundId },
    fn: (o) => o.grantmaking.roundHistory,
    input: { workspaceSlug: "alder", roundId, limit: 20 },
    result: {
      status: "ok",
      entries: [
        {
          revision: 1,
          action: "round.budget_changed",
          recordedAt: summary.expiresAt,
          budgetChange: {
            before: null,
            after: { currency: "EUR", minorUnits: "105025" },
            reason: "New grant",
          },
        },
      ],
      nextRevision: null,
    },
    response: {
      status: "ok",
      entries: [
        {
          revision: 1,
          action: "round.budget_changed",
          recordedAt: summary.expiresAt,
          budgetChange: {
            before: null,
            beforeDisplay: null,
            after: { currency: "EUR", minorUnits: "105025" },
            afterDisplay: "€1,050.25",
            reason: "New grant",
          },
        },
      ],
      nextPage: null,
    },
  },
  {
    name: "get_funding_round_content",
    args: { workspaceSlug: "alder", roundId, section: "criteria" },
    fn: (o) => o.grantmaking.roundContent,
    input: { workspaceSlug: "alder", roundId, section: "criteria", offset: 0, length: 8000 },
    result: {
      status: "ok",
      format: "json",
      content: "[]",
      fingerprint: "0".repeat(32),
      offset: 0,
      nextOffset: null,
      totalCharacters: 2,
    },
  },
];

it.each(dispatchCases)(
  "translates $name between its MCP contract and the operation for the verified actor",
  async ({ name, args, fn, result, response = result, ...test }) => {
    const operations = testOperations();
    const operation = fn(operations);
    vi.mocked(operation).mockResolvedValueOnce(result);
    const client = await connect(operations);
    try {
      const tools = await client.tools();
      expect(tools.find((tool) => tool.name === name)?.outputSchema).toBeDefined();
      const called = await client.callTool(name, args);
      expect(called.structuredContent).toEqual(response);
      const input = "input" in test ? test.input : args;
      expect(operation).toHaveBeenCalledExactlyOnceWith(
        ...(input === undefined ? [actor] : [actor, input]),
      );
    } finally {
      await client.close();
    }
  },
);

it.each([
  { author: { name: "Another manager" } },
  { recorded: { date: "1999-04-05", applicationVersion: 1 } },
])("rejects server-assigned recommendation fields %j before saving", async (fields) => {
  const operations = testOperations();
  const client = await connect(operations);
  try {
    const result = await client.callTool("save_recommendation", {
      ...address,
      expectedRecommendationRevision: 0,
      expectedApplicationVersion: 1,
      recommendation: { ...recommendation, ...fields },
    });
    expect(result.isError).toBe(true);
    expect(operations.recommendations.saveRecommendation).not.toHaveBeenCalled();
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
    const result = await client.callTool("get_reviewer_assignment", { assignmentId });
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
    expect((await client.callTool("list_my_reviews", { limit: 1 })).structuredContent).toEqual({
      status: "ok",
      assignments: [summary],
      nextPage: { limit: 1, after: assignmentId },
    });
    expect(
      (await client.callTool("list_my_reviews", { limit: 1, after: assignmentId }))
        .structuredContent,
    ).toEqual({ status: "ok", assignments: [{ ...summary, id: commandId }], nextPage: null });
  } finally {
    await client.close();
  }
});

it("rejects an empty review list page before listing assignments", async () => {
  const operations = testOperations();
  const client = await connect(operations);
  try {
    expect((await client.callTool("list_my_reviews", { limit: 0 })).isError).toBe(true);
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
      const result = await client.callTool("start_demo", {});
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({ status });
    } finally {
      await client.close();
    }
  },
);
