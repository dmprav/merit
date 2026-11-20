import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import type { ReviewerPage, ReviewerSummary } from "@merit/reviews/api";

import type { EmailSender } from "../src/server/email-delivery.server";
import { createTransport } from "./fixtures/transport-test";

const it = roundTest.extend("parity", async ({ db, database }) => {
  await database.client.query(
    "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('sam','Sam Morgan','sam-account'), ('other','Other','other-account')",
  );
  const messages: Parameters<EmailSender>[0][] = [];
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
  );

  const invoke = async (userId: string, name: string, input: Record<string, unknown> = {}) =>
    (await transport.callMcp(userId, input, name)).structuredContent as Record<string, unknown>;

  const saved = async (userId: string, name: string, input: Record<string, unknown> = {}) => {
    const response = await invoke(userId, name, input);
    assert(response?.status === "ok", `${name}: ${JSON.stringify(response)}`);
    return response;
  };

  return { ...transport, messages, invoke, saved };
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
  },
);

const createOrganization = async (
  p: {
    saved: (
      userId: string,
      name: string,
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
  },
  email: string,
) => {
  const created = await p.saved("dana", "create_organization", {
    requestId: randomUUID(),
    name: "New Trust",
    slug: "new-trust",
    email,
  });
  return created.organizationId as string;
};

const invitationToken = (message: Parameters<EmailSender>[0] | undefined) => {
  const token = message?.text.match(/\/invitations\/([a-f0-9]{64})/)?.[1];
  assert(token);
  return token;
};

it.for([
  [
    "create_organization",
    { requestId: randomUUID(), name: "New Trust", slug: "new-trust", email: "sam@example.test" },
  ],
  ["list_organizations", {}],
  ["list_access_requests", {}],
] as const)("refuses %s to a non-operator through MCP", async ([name, input], { parity: p }) => {
  expect(await p.invoke("sam", name, input)).toEqual({ status: "forbidden" });
});

it("admits the invited owner through the emailed MCP invitation token", async ({ parity: p }) => {
  const organizationId = await createOrganization(p, "sam@example.test");
  expect(p.messages).toMatchObject([{ to: "sam@example.test" }]);
  const token = invitationToken(p.messages[0]);

  expect((await p.saved("sam", "get_membership_invitation", { token })).invitation).toMatchObject({
    administration: "owner",
    role: "program_manager",
    accepted: false,
  });
  expect(
    (await p.saved("sam", "accept_membership_invitation", { token })).organization,
  ).toMatchObject({ id: organizationId, canWorkOnGrants: true });
  expect(
    (await p.saved("dana", "get_organization", { organizationId })).organization,
  ).toMatchObject({ hasOwner: true });
});

it("rejects an owner invitation token presented by an account without the invited email", async ({
  parity: p,
}) => {
  const organizationId = await createOrganization(p, "sam@example.test");

  expect(
    await p.invoke("other", "accept_membership_invitation", {
      token: invitationToken(p.messages[0]),
    }),
  ).toEqual({ status: "wrong_account" });
  expect(
    (await p.saved("dana", "get_organization", { organizationId })).organization,
  ).toMatchObject({ hasOwner: false, invitation: { acceptedAt: null } });
});

it("records MCP provenance in organization administration history", async ({
  database,
  parity: p,
}) => {
  const organizationId = await createOrganization(p, "other@example.test");
  await p.saved("dana", "rename_organization", { organizationId, name: "Renamed Trust" });
  await p.saved("dana", "replace_owner_invitation", { organizationId, email: "sam@example.test" });
  await p.saved("dana", "revoke_owner_invitation", { organizationId });

  const history = await database.client.query(
    "SELECT action, provenance FROM audit_events WHERE organization_id=$1 ORDER BY recorded_at",
    [organizationId],
  );
  expect(history.rows).toEqual(
    [
      "organization.created",
      "organization.renamed",
      "team_invitation.replaced",
      "team_invitation.revoked",
    ].map((action) => ({
      action,
      provenance: { interface: "mcp", clientId: "integration-client" },
    })),
  );
});

it("records an operator's review of a workspace access request made through MCP", async ({
  parity: p,
}) => {
  await p.saved("sam", "request_workspace_access", { email: "sam@example.test" });
  expect((await p.saved("dana", "list_access_requests")).accessRequests).toMatchObject([
    { email: "sam@example.test", reviewedAt: null },
  ]);

  expect(
    (await p.saved("dana", "review_access_request", { email: "sam@example.test" })).accessRequest,
  ).toMatchObject({ reviewedBy: "dana" });
});

it("starts and resets only the authenticated account's demo with safe reset retries", async ({
  parity: p,
}) => {
  expect(await p.saved("sam", "get_demo")).toEqual({ status: "ok", demo: { status: "empty" } });
  const first = await p.saved("sam", "start_demo");
  const initial = first.demo as { workspaceId: string; workspaceSlug: string };
  expect(await p.saved("sam", "start_demo")).toEqual(first);
  expect(await p.saved("other", "get_demo")).toEqual({ status: "ok", demo: { status: "empty" } });
  const reset = await p.saved("sam", "reset_demo", { resetWorkspaceId: initial.workspaceId });
  expect((reset.demo as { workspaceId: string }).workspaceId).not.toBe(initial.workspaceId);
  expect(await p.saved("sam", "reset_demo", { resetWorkspaceId: initial.workspaceId })).toEqual(
    reset,
  );
  expect((await p.saved("sam", "get_demo")).demo).toEqual(reset.demo);
  expect(
    await p.invoke("sam", "list_funding_rounds", { workspaceSlug: initial.workspaceSlug }),
  ).toEqual({ status: "not_found" });
});
