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
      isOperator: (actor) => actor.userId === "dana",
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

it("completes reviewer participation through MCP with private drafts, retries, amendments and access recovery", async ({
  db,
  database,
  rounds,
  parity: p,
}) => {
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
  expect(await p.saved("dana", "invite_reviewer", invitation)).toEqual(invited);
  expect(p.messages).toHaveLength(1);
  const assignmentId = (invited.value as ReviewerSummary).id;

  const read = async () =>
    (await p.saved("sam", "get_reviewer_assignment", { assignmentId })).value as ReviewerPage;

  const respond = async (action: string, note = "") =>
    p.saved("sam", "respond_to_review", {
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: (await read()).assignment.revision,
      action,
      note,
    });

  const manage = async (action: string, note = "") => {
    const list = await p.saved("dana", "list_application_reviewers", address);
    const current = (list.items as ReviewerSummary[]).find((item) => item.id === assignmentId)!;
    return p.saved("dana", "manage_reviewer_assignment", {
      ...address,
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: current.revision,
      action,
      note,
    });
  };

  expect((await p.saved("sam", "list_my_reviews")).items).toMatchObject([{ id: assignmentId }]);
  expect(await read()).toMatchObject({ material: null, draft: null });
  expect(await p.invoke("other", "get_reviewer_assignment", { assignmentId })).toEqual({
    status: "not_found",
  });
  await respond("accept");
  expect(
    (await database.client.query("SELECT 1 FROM memberships WHERE user_id='sam'")).rows,
  ).toEqual([]);
  const page = await read();
  expect(page.material?.requested).toEqual({ minorUnits: "8000", currency: "EUR" });
  assert(page.draft);
  const draft = {
    position: "Fund",
    amount: "40.50",
    reasoning: "PRIVATE: independent evidence",
    observations: [],
    note: "",
  };
  const draftCommand = {
    assignmentId,
    commandId: randomUUID(),
    expectedDraftRevision: page.draft.revision,
    draft,
  };
  expect(await p.saved("sam", "save_reviewer_draft", draftCommand)).toEqual({
    status: "ok",
    value: { revision: 1 },
  });
  expect(await p.saved("sam", "save_reviewer_draft", draftCommand)).toEqual({
    status: "ok",
    value: { revision: 1 },
  });
  expect(
    await p.invoke("sam", "save_reviewer_draft", { ...draftCommand, commandId: randomUUID() }),
  ).toEqual({ status: "conflict" });
  expect(
    JSON.stringify(await p.saved("dana", "list_application_reviewers", address)),
  ).not.toContain("PRIVATE");
  expect(await p.invoke("dana", "get_reviewer_assignment", { assignmentId })).toEqual({
    status: "not_found",
  });
  const submission = { assignmentId, commandId: randomUUID(), expectedDraftRevision: 1 };
  expect(await p.saved("sam", "submit_reviewer_assessment", submission)).toEqual({
    status: "ok",
    value: { revision: 2 },
  });
  expect(await p.saved("sam", "submit_reviewer_assessment", submission)).toEqual({
    status: "ok",
    value: { revision: 2 },
  });
  expect(p.messages).toHaveLength(2);
  const web = await getFundingApplicationPage(db, { userId: "dana" }, webAddress);
  expect(web?.application.reviews.assessments[0]).toMatchObject({
    authorUserId: "sam",
    versions: [
      {
        recorder: {
          userId: "sam",
          provenance: { interface: "mcp", clientId: "integration-client" },
        },
      },
    ],
  });
  const submitted = await read();
  assert(submitted.draft);
  await p.saved("sam", "save_reviewer_draft", {
    assignmentId,
    commandId: randomUUID(),
    expectedDraftRevision: submitted.draft.revision,
    draft: { ...draft, reasoning: "Amended evidence", note: "Clarify the basis" },
  });
  const amendment = await read();
  await p.saved("sam", "submit_reviewer_assessment", {
    assignmentId,
    commandId: randomUUID(),
    expectedDraftRevision: amendment.draft!.revision,
  });
  expect((await read()).assessment?.versions).toHaveLength(2);
  await p.saved("sam", "change_navigation_pin", {
    action: "pin",
    target: { kind: "review", id: assignmentId },
  });
  expect((await p.saved("sam", "get_navigation_pins")).pins).toMatchObject([
    { target: { kind: "review", id: assignmentId } },
  ]);
  await manage("cancel");
  expect(await read()).toMatchObject({ material: null, draft: null, assessment: null });
  expect((await p.saved("other", "get_navigation_pins")).pins).toEqual([]);
  expect(
    await p.invoke("sam", "save_reviewer_draft", { ...draftCommand, commandId: randomUUID() }),
  ).toEqual({ status: "not_found" });
  expect(
    await p.invoke("sam", "submit_reviewer_assessment", { ...submission, commandId: randomUUID() }),
  ).toEqual({ status: "not_found" });
  await manage("reinstate");
  await respond("report_conflict", "Possible connection");
  expect((await read()).material).toBeNull();
  await manage("clear_conflict", "Reviewed and cleared");
  await respond("accept");
  expect((await read()).assessment?.versions).toHaveLength(2);
});

it("provisions and joins organizations through MCP without granting operator or wrong-email access", async ({
  database,
  parity: p,
}) => {
  const create = {
    requestId: randomUUID(),
    name: "New Trust",
    slug: "new-trust",
    email: "sam@example.test",
  };
  expect(await p.invoke("sam", "create_organization", create)).toEqual({ status: "forbidden" });
  const created = await p.saved("dana", "create_organization", create);
  expect(await p.saved("dana", "create_organization", create)).toEqual(created);
  expect(p.messages).toHaveLength(1);
  const token = p.messages[0]!.text.match(/\/invitations\/([a-f0-9]{64})/)?.[1];
  assert(token);
  const organizationId = (created.value as { organizationId: string }).organizationId;
  expect((await p.saved("dana", "get_organization", { organizationId })).value).toMatchObject({
    hasOwner: false,
    invitation: { delivery: "sent", acceptedAt: null },
  });
  expect((await p.saved("dana", "list_organizations")).items).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: organizationId })]),
  );
  expect(await p.invoke("sam", "list_organizations")).toEqual({ status: "forbidden" });
  expect(await p.invoke("other", "accept_membership_invitation", { token })).toEqual({
    status: "wrong_account",
  });
  expect((await p.saved("sam", "get_membership_invitation", { token })).value).toMatchObject({
    administration: "owner",
    role: "program_manager",
    accepted: false,
  });
  expect((await p.saved("sam", "accept_membership_invitation", { token })).value).toMatchObject({
    id: organizationId,
    canWorkOnGrants: true,
  });
  await p.saved("sam", "accept_membership_invitation", { token });
  await p.saved("dana", "rename_organization", { organizationId, name: "Renamed Trust" });
  expect((await p.saved("dana", "get_organization", { organizationId })).value).toMatchObject({
    name: "Renamed Trust",
    hasOwner: true,
  });
  expect((await p.saved("dana", "list_workspaces")).workspaces).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: "new-trust" })]),
  );
  const history = await database.client.query(
    "SELECT provenance FROM organization_events WHERE organization_id=$1 ORDER BY recorded_at",
    [organizationId],
  );
  expect(history.rows).toHaveLength(3);
  expect(history.rows).toEqual(
    Array.from({ length: 3 }, () => ({
      provenance: { interface: "mcp", clientId: "integration-client" },
    })),
  );
  const pendingId = randomUUID();
  await p.saved("dana", "create_organization", {
    requestId: pendingId,
    name: "Pending Trust",
    slug: "pending-trust",
    email: "other@example.test",
  });
  await p.saved("dana", "replace_owner_invitation", {
    organizationId: pendingId,
    email: "sam@example.test",
  });
  await p.saved("dana", "revoke_owner_invitation", { organizationId: pendingId });
  const pendingHistory = await database.client.query(
    "SELECT action, provenance FROM organization_events WHERE organization_id=$1 ORDER BY recorded_at",
    [pendingId],
  );
  expect(pendingHistory.rows).toEqual(
    ["created", "invited", "revoked"].map((action) => ({
      action,
      provenance: { interface: "mcp", clientId: "integration-client" },
    })),
  );
  await p.saved("sam", "request_workspace_access", { email: "sam@example.test" });
  expect((await p.saved("dana", "list_access_requests")).items).toMatchObject([
    { email: "sam@example.test", reviewedAt: null },
  ]);
  expect(await p.invoke("sam", "list_access_requests")).toEqual({ status: "forbidden" });
  expect(
    (await p.saved("dana", "review_access_request", { email: "sam@example.test" })).value,
  ).toMatchObject({ reviewedBy: "dana" });
});

it("starts and resets only the authenticated account's demo with safe reset retries", async ({
  parity: p,
}) => {
  expect(await p.saved("sam", "get_demo")).toEqual({ status: "ok", value: { status: "empty" } });
  const first = await p.saved("sam", "start_demo");
  const initial = first.value as { workspaceId: string; workspaceSlug: string };
  expect(await p.saved("sam", "start_demo")).toEqual(first);
  expect(await p.saved("other", "get_demo")).toEqual({ status: "ok", value: { status: "empty" } });
  const reset = await p.saved("sam", "reset_demo", { resetWorkspaceId: initial.workspaceId });
  expect((reset.value as { workspaceId: string }).workspaceId).not.toBe(initial.workspaceId);
  expect(await p.saved("sam", "reset_demo", { resetWorkspaceId: initial.workspaceId })).toEqual(
    reset,
  );
  expect((await p.saved("sam", "get_demo")).value).toEqual(reset.value);
  expect(
    await p.invoke("sam", "list_funding_rounds", { workspaceSlug: initial.workspaceSlug }),
  ).toEqual({ status: "not_found" });
});
