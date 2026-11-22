import { randomUUID } from "node:crypto";

import { assert, expect, vi } from "vite-plus/test";

import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import { actor } from "@merit/organizations/testing/workspace";
import type { ReviewerPage, ReviewerSummary } from "@merit/reviews/api";

import type { EmailSender } from "../src/server/email-delivery.server";
import { createTransport } from "./fixtures/transport-test";

const it = roundTest.extend("parity", async ({ db, database }, { onCleanup }) => {
  await database.client.query(
    "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('sam','Sam Morgan','sam-account'), ('other','Other','other-account')",
  );
  const messages: Parameters<EmailSender>[0][] = [];
  const captureGrantOutcome = vi.fn();
  const transport = createTransport(
    db,
    {
      isOperator: async (actor) => actor.userId === "dana",
      verifiedEmails: async (actor) => [`${actor.userId}@example.test`],
      displayName: async (actor) => actor.userId,
    },
    async (message) => {
      messages.push(message);
    },
    { captureGrantOutcome, captureMcpToolFinished: vi.fn() },
  );

  onCleanup(async () => {
    await transport.close();
  });

  const invoke = async (userId: string, name: string, input: Record<string, unknown> = {}) =>
    (await transport.callMcp(userId, input, name)).structuredContent as Record<string, unknown>;

  const saved = async (userId: string, name: string, input: Record<string, unknown> = {}) => {
    const response = await invoke(userId, name, input);
    assert(response?.status === "ok", `${name}: ${JSON.stringify(response)}`);
    return response;
  };

  return { ...transport, captureGrantOutcome, messages, invoke, saved };
});

const reviewerTest = it.extend("assignment", async ({ database, rounds, parity: p }) => {
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'sam', 'sam@example.test', 'reviewer')",
  );
  const webAddress = await rounds.createApplication("Independent assessment");
  const address = { workspaceSlug: webAddress.workspaceSlug, applicationId: webAddress.publicId };
  const contactId = randomUUID();
  await p.saved("dana", "create_contact", {
    workspaceSlug: "alder",
    contactId,
    details: { name: "Sam", email: "sam@example.test", affiliation: "" },
  });
  const requestId = randomUUID();
  await p.saved("dana", "request_review", {
    ...address,
    expectedReviewRevision: 0,
    expectedApplicationVersion: 1,
    expectedCriteriaVersion: 1,
    id: requestId,
    contactId,
    replacesId: null,
  });
  const invitation = { ...address, commandId: randomUUID(), requestId, dueDate: null };
  const invited = await p.saved("dana", "invite_reviewer", invitation);
  const assignmentId = (invited.assignment as ReviewerSummary).id;

  const read = async () =>
    (await p.saved("sam", "get_reviewer_assignment", { assignmentId })) as unknown as ReviewerPage;

  const respond = async (action: string) =>
    p.saved("sam", "respond_to_review", {
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: (await read()).assignment.revision,
      action,
      note: "",
    });

  const cancel = async () => {
    const list = await p.saved("dana", "list_application_reviewers", address);
    const current = (list.assignments as ReviewerSummary[]).find(
      (item) => item.id === assignmentId,
    );
    assert(current);
    return p.saved("dana", "manage_reviewer_assignment", {
      ...address,
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: current.revision,
      action: "cancel",
      note: "",
    });
  };

  const draft = {
    position: "Fund",
    amount: "40.50",
    reasoning: "Independent evidence",
    observations: [],
    note: "",
  };

  const draftCommand = async (content: Record<string, unknown> = draft) => {
    const page = await read();
    assert(page.draft);
    return {
      assignmentId,
      commandId: randomUUID(),
      expectedDraftRevision: page.draft.revision,
      draft: content,
    };
  };

  const submission = async () => {
    const page = await read();
    assert(page.draft);
    return { assignmentId, commandId: randomUUID(), expectedDraftRevision: page.draft.revision };
  };

  return {
    webAddress,
    address,
    invitation,
    invited,
    assignmentId,
    draft,
    read,
    respond,
    cancel,
    draftCommand,
    submission,
  };
});

reviewerTest(
  "invites a requested reviewer by email once when the MCP invitation is retried",
  async ({ parity: p, assignment: a }) => {
    expect(await p.saved("dana", "invite_reviewer", a.invitation)).toEqual(a.invited);
    expect(p.messages).toMatchObject([{ to: "sam@example.test" }]);
  },
);

reviewerTest(
  "gives the reviewer the application material only while the assignment is accepted",
  async ({ assignment: a }) => {
    expect(await a.read()).toMatchObject({ material: null, draft: null });
    await a.respond("accept");
    expect((await a.read()).material?.requested).toEqual({ minorUnits: "8000", currency: "EUR" });
    await a.cancel();
    expect(await a.read()).toMatchObject({ material: null, draft: null, assessment: null });
  },
);

reviewerTest(
  "rejects a cancelled reviewer's draft and submission through MCP",
  async ({ parity: p, assignment: a }) => {
    await a.respond("accept");
    const command = await a.draftCommand();
    const submission = await a.submission();
    await a.cancel();

    expect(await p.invoke("sam", "save_reviewer_draft", command)).toEqual({
      status: "not_found",
    });
    expect(await p.invoke("sam", "submit_reviewer_assessment", submission)).toEqual({
      status: "not_found",
    });
  },
);

reviewerTest(
  "keeps a reviewer's assignment and private draft from other accounts",
  async ({ parity: p, assignment: a }) => {
    await a.respond("accept");
    await p.saved(
      "sam",
      "save_reviewer_draft",
      await a.draftCommand({ ...a.draft, reasoning: "PRIVATE: independent evidence" }),
    );

    for (const userId of ["other", "dana"]) {
      expect(
        await p.invoke(userId, "get_reviewer_assignment", { assignmentId: a.assignmentId }),
      ).toEqual({ status: "not_found" });
    }
    expect(
      JSON.stringify(await p.saved("dana", "list_application_reviewers", a.address)),
    ).not.toContain("PRIVATE");
  },
);

reviewerTest(
  "rejects a reviewer draft saved against a stale draft revision without changing it",
  async ({ parity: p, assignment: a }) => {
    await a.respond("accept");
    const stale = await a.draftCommand({ ...a.draft, reasoning: "Stale device" });
    expect(await p.saved("sam", "save_reviewer_draft", await a.draftCommand())).toEqual({
      status: "ok",
      draftRevision: stale.expectedDraftRevision + 1,
    });

    expect(await p.invoke("sam", "save_reviewer_draft", stale)).toEqual({ status: "conflict" });
    expect((await a.read()).draft?.content.reasoning).toBe(a.draft.reasoning);
  },
);

reviewerTest(
  "records an MCP-submitted assessment under the reviewer with MCP provenance",
  async ({ db, parity: p, assignment: a }) => {
    await a.respond("accept");
    await p.saved("sam", "save_reviewer_draft", await a.draftCommand());

    await p.saved("sam", "submit_reviewer_assessment", await a.submission());

    const web = await getFundingApplicationPage(db, { userId: "dana" }, a.webAddress);
    expect(web?.application.reviews.assessments).toMatchObject([
      {
        authorUserId: "sam",
        versions: [
          {
            content: { amount: { minorUnits: "4050", currency: "EUR" } },
            recorder: {
              userId: "sam",
              provenance: { interface: "mcp", clientId: "integration-client" },
            },
          },
        ],
      },
    ]);
  },
);

reviewerTest(
  "notifies the manager once when the reviewer retries the MCP submission",
  async ({ parity: p, assignment: a }) => {
    await a.respond("accept");
    await p.saved("sam", "save_reviewer_draft", await a.draftCommand());
    const submission = await a.submission();

    const submitted = await p.saved("sam", "submit_reviewer_assessment", submission);
    expect(await p.saved("sam", "submit_reviewer_assessment", submission)).toEqual(submitted);
    expect(p.messages.slice(1)).toMatchObject([{ to: "dana@example.test" }]);
    expect(p.captureGrantOutcome.mock.calls).toEqual([
      [
        {
          event: "assessment_submitted",
          surface: "mcp",
          workspaceKind: "standard",
          workspaceId: "alder",
        },
      ],
    ]);
  },
);

it("starts an isolated fictional demo and resumes it for the same account", async ({
  parity: p,
}) => {
  const first = await p.saved("sam", "start_demo");
  const demo = first.demo;
  assert(demo && typeof demo === "object" && "workspaceSlug" in demo && "roundRef" in demo);
  const round = await p.saved("sam", "get_funding_round", {
    workspaceSlug: demo.workspaceSlug,
    roundId: demo.roundRef,
  });
  expect(round.round).toMatchObject({ roundId: demo.roundRef, title: "Local Connections 2027" });
  expect(await p.saved("sam", "start_demo")).toEqual(first);
  expect(
    await p.invoke("other", "list_funding_rounds", { workspaceSlug: demo.workspaceSlug }),
  ).toEqual({ status: "not_found" });
});

const webWorkspace = { workspaceKind: "standard", workspaceId: "alder", surface: "web" };

it("counts a web round creation once when its receipt is replayed", async ({ parity: p }) => {
  const { createRound } = p.mcpOperations.rounds;
  const request = { workspaceSlug: "alder", title: "Autumn", requestId: randomUUID() };
  const created = await createRound(actor, request);
  assert(created.status === "ok");
  expect(p.captureGrantOutcome).toHaveBeenCalledExactlyOnceWith({
    ...webWorkspace,
    event: "round_created",
  });

  expect(await createRound(actor, request)).toEqual(created);
  expect(p.captureGrantOutcome).toHaveBeenCalledTimes(1);
});

it("counts a web application once when its receipt is replayed", async ({ parity: p, rounds }) => {
  const { createApplication } = p.mcpOperations.applications;
  const request = {
    workspaceSlug: rounds.pageInput.workspaceSlug,
    publicId: rounds.pageInput.publicId,
    title: "Community theatre",
    requestId: randomUUID(),
  };
  const recorded = await createApplication(actor, request);
  assert(recorded.status === "ok");
  expect(p.captureGrantOutcome).toHaveBeenCalledExactlyOnceWith({
    ...webWorkspace,
    event: "application_recorded",
  });

  expect(await createApplication(actor, request)).toEqual(recorded);
  expect(p.captureGrantOutcome).toHaveBeenCalledTimes(1);
});

const recommendationTest = it.extend("proposal", async ({ rounds }) => {
  const address = await rounds.createApplication("Community garden");
  await rounds.recommendApplication(address, "3000");
  return {
    ...address,
    expectedRevision: 1,
    expectedApplicationVersion: 1,
    recommendation: {
      position: "Fund" as const,
      allocation: { currency: "EUR" as const, minorUnits: "5000" },
      reasoning: "Expanded access",
    },
  };
});

recommendationTest("ignores a conflicting web recommendation", async ({ parity: p, proposal }) => {
  const result = await p.mcpOperations.recommendations.saveRecommendation(actor, {
    ...proposal,
    expectedRevision: 0,
  });
  expect(result).toEqual({ status: "conflict" });
  expect(p.captureGrantOutcome).not.toHaveBeenCalled();
});

recommendationTest(
  "counts a web recommendation only when its content changes",
  async ({ parity: p, proposal }) => {
    const { saveRecommendation } = p.mcpOperations.recommendations;
    const saved = await saveRecommendation(actor, proposal);
    assert(saved.status === "ok");
    expect(p.captureGrantOutcome).toHaveBeenCalledExactlyOnceWith({
      ...webWorkspace,
      event: "funding_recommendation_saved",
    });

    const unchanged = await saveRecommendation(actor, {
      ...proposal,
      expectedRevision: saved.recommendationVersion,
    });
    assert(unchanged.status === "ok");
    expect(p.captureGrantOutcome).toHaveBeenCalledTimes(1);
  },
);

it("counts a visitor's own MCP write in the demo and ignores prepared grant records", async ({
  database,
  parity: p,
}) => {
  const { demo } = await p.saved("sam", "start_demo");
  assert(demo && typeof demo === "object" && "workspaceSlug" in demo);
  await p.saved("sam", "create_funding_round", {
    workspaceSlug: demo.workspaceSlug,
    title: "New demo round",
    requestId: randomUUID(),
  });
  const workspace = await database.client.query<{ id: string }>(
    "SELECT id FROM organizations WHERE slug = $1",
    [demo.workspaceSlug],
  );
  expect(p.captureGrantOutcome.mock.calls).toEqual([
    [
      {
        event: "round_created",
        workspaceKind: "demo",
        surface: "mcp",
        workspaceId: workspace.rows[0]?.id,
      },
    ],
  ]);
});

it("returns the committed result when the analytics observer fails", async ({ parity: p }) => {
  p.captureGrantOutcome.mockImplementationOnce(() => {
    throw new Error("offline");
  });
  const request = { workspaceSlug: "alder", title: "Autumn", requestId: randomUUID() };
  const created = await p.saved("dana", "create_funding_round", request);
  expect(await p.saved("dana", "create_funding_round", request)).toEqual(created);
  expect(p.captureGrantOutcome).toHaveBeenCalledTimes(1);
});
