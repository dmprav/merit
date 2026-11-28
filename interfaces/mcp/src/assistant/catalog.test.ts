import { assert, expect, it, vi } from "vite-plus/test";

import { testOperations } from "../../tests/operations";
import { publication } from "../app/publication";
import { createAssistantCatalog, type AssistantOperations } from "./catalog";
import { describeResult } from "./evidence";

const actor = { userId: "manager" };
const workspaceSlug = "alder";
const workspace = {
  id: "alder-id",
  slug: workspaceSlug,
  name: "Alder",
  kind: "standard",
  role: "program_manager",
  administration: "none",
  canWorkOnGrants: true,
  canViewTeam: true,
  demoExpiresAt: null,
} as const;
const contactId = "00000000-0000-4000-a000-000000000001";
const applicationId = "k7m2p9x4n6rt";
const requestId = "00000000-0000-4000-a000-000000000002";
const commandId = "00000000-0000-4000-a000-000000000003";

const setup = () => {
  const ops = {
    ...testOperations(),
    readWorkspace: vi.fn<AssistantOperations["readWorkspace"]>().mockResolvedValue(workspace),
  };
  vi.mocked(ops.organizations.workspaceHomeUrl).mockReturnValue("https://merit.test/app/alder");
  const catalog = createAssistantCatalog(actor, workspaceSlug, ops, "https://merit.test");
  return { ops, catalog };
};

it("advertises every workspace tool with the provider's input schema and filters by the current actor", async () => {
  const { ops, catalog } = setup();
  const tools = await catalog.list();
  expect(tools.map((tool) => tool.name).sort()).toEqual(
    Object.keys(publication)
      .filter((name) => name !== "start_demo")
      .sort(),
  );
  expect(tools.find((tool) => tool.name === "invite_reviewer")).toMatchObject({
    write: true,
    inputSchema: { type: "object", properties: { requestId: { type: "string" } } },
  });
  for (const tool of tools) {
    expect(tool.inputSchema.properties).not.toHaveProperty("workspaceSlug");
  }
  ops.readWorkspace.mockResolvedValue({
    ...workspace,
    role: "reviewer",
    canWorkOnGrants: false,
    canViewTeam: false,
  });
  expect((await catalog.list()).map((tool) => tool.name).sort()).toEqual([
    "get_reviewer_assignment",
    "list_my_reviews",
    "list_workspaces",
    "respond_to_review",
    "save_reviewer_draft",
    "submit_reviewer_assessment",
  ]);
  expect((await catalog.read("get_application", { applicationId })).result.status).toBe(
    "forbidden",
  );
  expect(ops.grantmaking.readApplication).not.toHaveBeenCalled();
});

it("records team access for a member's team read and rechecks it after a role change", async () => {
  const { ops, catalog } = setup();
  const member = { ...workspace, role: "member", canWorkOnGrants: false } as const;
  ops.readWorkspace.mockResolvedValue(member);
  vi.mocked(ops.organizations.membersPage).mockResolvedValue({
    status: "ok",
    value: { members: [], nextCursor: null },
  });
  expect((await catalog.list()).map((tool) => tool.name)).toContain("list_team_members");
  const receipt = await catalog.read("list_team_members", {});
  expect(receipt.result.status).toBe("ok");
  expect(receipt.dependencies).toEqual([{ kind: "team" }]);
  expect(await catalog.permits(receipt.dependencies)).toBe(true);
  ops.readWorkspace.mockResolvedValue({ ...member, role: "reviewer", canViewTeam: false });
  expect(await catalog.permits(receipt.dependencies)).toBe(false);
});

it("keeps discovery, continuations and assignment reads inside the chat workspace", async () => {
  const { ops, catalog } = setup();
  expect((await catalog.read("list_workspaces", {})).result).toMatchObject({
    workspaces: [{ slug: "alder" }],
    nextPage: null,
  });
  expect(ops.organizations.workspacesPage).not.toHaveBeenCalled();
  vi.mocked(ops.reviewer.list).mockResolvedValue({ status: "ok", value: [] });
  await catalog.read("list_my_reviews", {});
  expect(ops.reviewer.list).toHaveBeenCalledExactlyOnceWith(actor, { workspaceSlug });
  expect(
    (
      await catalog.read("get_reviewer_assignment", {
        workspaceSlug: "other",
        assignmentId: commandId,
      })
    ).result.status,
  ).toBe("invalid_input");
  expect(ops.reviewer.read).not.toHaveBeenCalled();
});

it("checks each assignment returned by an uncited list, including loss of evidence access", async () => {
  const { ops, catalog } = setup();
  const observed = describeResult(
    "list_my_reviews",
    {},
    {
      status: "ok",
      assignments: [
        { id: commandId, basisComparison: { applicationVersion: "same" }, revision: 2 },
        { id: requestId, basisComparison: { applicationVersion: "unknown" }, revision: 1 },
      ],
    },
  );
  expect(observed.dependencies).toEqual([
    { kind: "reviewer" },
    { kind: "assignment", assignmentId: commandId, evidence: true },
    { kind: "assignment", assignmentId: requestId, evidence: false },
  ]);
  vi.mocked(ops.reviewer.read).mockResolvedValue({ status: "not_found" });
  expect(await catalog.permits(observed.dependencies)).toBe(false);
  expect(ops.reviewer.read).toHaveBeenCalledWith(actor, { workspaceSlug, assignmentId: commandId });
  ops.readWorkspace.mockResolvedValue(null);
  expect(await catalog.permits([])).toBe(false);
});

it("uses the version supplied by the source for material and assessment citations", async () => {
  const { ops, catalog } = setup();
  vi.mocked(ops.grantmaking.applicationContent).mockResolvedValue({
    status: "ok",
    fingerprint: "f".repeat(32),
    format: "json",
    offset: 0,
    nextOffset: null,
    totalCharacters: 2,
    content: "{}",
  });
  const result = await catalog.read("get_application_content", {
    applicationId,
    section: "material",
    materialVersion: 2,
  });
  expect(result.citations).toEqual([
    { kind: "material", recordId: applicationId, label: "material", version: "2" },
  ]);
  expect(
    describeResult(
      "list_application_reviews",
      { applicationId },
      {
        status: "ok",
        reviews: [
          {
            kind: "assessment",
            id: requestId,
            assessmentVersion: 3,
            reviewRevision: 8,
            reviewer: "Jo",
          },
        ],
      },
    ).citations,
  ).toContainEqual({ kind: "assessment", recordId: requestId, label: "Jo", version: "3" });
});

it("binds an invitation to its exact recipient and refuses a changed contact", async () => {
  const { ops, catalog } = setup();
  vi.mocked(ops.grantmaking.readApplication).mockImplementation(
    vi.fn().mockResolvedValue({
      status: "ok",
      application: { applicationId, title: "Community garden", intakeRevision: 2 },
    }),
  );
  const content = JSON.stringify({ id: requestId, contactId, status: "outstanding" });
  vi.mocked(ops.grantmaking.applicationContent).mockResolvedValue({
    status: "ok",
    format: "json",
    fingerprint: "0".repeat(32),
    content,
    totalCharacters: content.length,
    offset: 0,
    nextOffset: null,
  });
  const contact = {
    contactId,
    name: "Jo",
    email: "jo@example.test",
    affiliation: "",
    archived: false,
    contactRevision: 3,
  };
  vi.mocked(ops.contacts.getContact).mockResolvedValue({ status: "ok", contact });
  const input = { applicationId, requestId, commandId, dueDate: null };
  const { preview } = await catalog.preview("invite_reviewer", input);
  assert(preview);
  expect(preview.effects).toEqual(["Send invitation email to jo@example.test."]);
  expect(preview.targets).toContainEqual({
    kind: "contact",
    label: "Jo",
    id: contactId,
    version: "3",
  });
  expect((await catalog.read("invite_reviewer", input)).result.status).toBe("invalid_input");
  vi.mocked(ops.contacts.getContact).mockResolvedValue({
    status: "ok",
    contact: { ...contact, email: "different@example.test", contactRevision: 4 },
  });
  expect((await catalog.execute(preview)).result.status).toBe("stale");
  expect(ops.reviewer.invite).not.toHaveBeenCalled();
  const updated = await catalog.preview("invite_reviewer", input);
  assert(updated.preview);
  vi.mocked(ops.reviewer.invite).mockResolvedValue({ status: "limited" });
  const outcome = await catalog.execute(updated.preview);
  expect(outcome.result.status).toBe("limited");
  expect(ops.reviewer.invite).toHaveBeenCalledExactlyOnceWith(actor, {
    publicId: applicationId,
    workspaceSlug,
    requestId,
    commandId,
    dueDate: null,
  });
});

it("returns the new revision for a separate approval before archiving a changed contact", async () => {
  const { catalog, ops } = setup();
  const contact = {
    contactId,
    name: "Jo",
    email: "jo@example.test",
    affiliation: "",
    archived: false,
    contactRevision: 2,
  };
  vi.mocked(ops.contacts.getContact).mockResolvedValue({ status: "ok", contact });
  const original = await catalog.preview("archive_contact", {
    contactId,
    expectedContactRevision: 2,
  });
  assert(original.preview);
  vi.mocked(ops.contacts.getContact).mockResolvedValue({
    status: "ok",
    contact: { ...contact, contactRevision: 3 },
  });
  const stale = await catalog.execute(original.preview);
  expect(stale.result.status).toBe("stale");
  assert(stale.retry);
  expect(stale.retry.input.expectedContactRevision).toBe(3);
  expect(ops.contacts.changeContact).not.toHaveBeenCalled();
  vi.mocked(ops.contacts.changeContact).mockResolvedValue({
    status: "ok",
    contact: {
      id: contactId,
      organizationId: workspace.id,
      name: contact.name,
      email: contact.email,
      affiliation: "",
      revision: 4,
      archived: true,
    },
  });
  expect((await catalog.execute(stale.retry)).result).toMatchObject({
    status: "ok",
    contact: { archived: true },
  });
  expect(ops.contacts.changeContact).toHaveBeenCalledExactlyOnceWith(actor, {
    action: "archive",
    workspaceSlug,
    contactId,
    expectedContactRevision: 3,
  });
});

it("prevents an unrelated optional selector from relabeling a source citation", async () => {
  const { catalog, ops } = setup();
  vi.mocked(ops.grantmaking.applicationContent).mockResolvedValue({
    status: "ok",
    fingerprint: "a".repeat(32),
    format: "json",
    offset: 0,
    nextOffset: null,
    totalCharacters: 2,
    content: "{}",
  });
  const observed = await catalog.read("get_application_content", {
    applicationId,
    section: "submission",
    materialVersion: 8,
    entryId: requestId,
  });
  expect(observed.citations).toEqual([
    { kind: "submission", label: "submission", recordId: applicationId, version: "a".repeat(32) },
  ]);
});

it("shows the review requests and assignments that an application withdrawal will close", async () => {
  const { catalog, ops } = setup();
  vi.mocked(ops.grantmaking.readApplication).mockImplementation(
    vi.fn().mockResolvedValue({
      status: "ok",
      application: { applicationId, title: "Meals", intakeRevision: 5 },
    }),
  );
  vi.mocked(ops.grantmaking.listReviews).mockImplementation(
    vi.fn().mockResolvedValue({
      status: "ok",
      reviews: [{ kind: "request", id: requestId, reviewer: "Jo", reviewRevision: 2 }],
      nextCursor: null,
    }),
  );
  vi.mocked(ops.reviewer.forApplication).mockImplementation(
    vi.fn().mockResolvedValue({
      status: "ok",
      value: [{ id: commandId, requestId, reviewer: "Jo", revision: 4 }],
    }),
  );
  const { preview } = await catalog.preview("withdraw_application", {
    applicationId,
    expectedIntakeRevision: 5,
    withdrawnOn: "2026-10-01",
    reason: "Applicant asked to withdraw",
  });
  assert(preview);
  expect(preview.targets).toEqual([
    { kind: "application", id: applicationId, label: "Meals", version: "5" },
    { kind: "review_request", id: requestId, label: "Jo", version: "2" },
    { kind: "assignment", id: commandId, label: "Jo", version: "4" },
  ]);
  expect(preview.effects).toContain(
    "Close every outstanding review request and end access for its reviewers.",
  );
  expect(ops.applications.editApplication).not.toHaveBeenCalled();
});

it("loses an active invitation dependency when the business read still returns a cancelled summary", async () => {
  const { catalog, ops } = setup();
  const original = describeResult(
    "list_my_reviews",
    {},
    {
      status: "ok",
      assignments: [
        {
          id: commandId,
          status: "invited",
          revision: 1,
          basisComparison: { applicationVersion: "unknown" },
        },
      ],
    },
  );
  const summary = {
    workspaceSlug,
    status: "cancelled",
  };
  vi.mocked(ops.reviewer.read).mockImplementation(
    vi.fn().mockResolvedValue({
      status: "ok",
      value: { assignment: summary, material: null },
    }),
  );
  expect(await catalog.permits(original.dependencies)).toBe(false);
});

it("gives changed aggregate facts a new evidence reference while preserving the round revision", () => {
  const cite = (round: Record<string, unknown>) =>
    describeResult(
      "get_funding_round",
      { roundId: applicationId },
      {
        status: "ok",
        round,
      },
    ).citations;

  const one = {
    roundId: applicationId,
    preparationRevision: 3,
    title: "Spring",
    applicationCount: 1,
    totals: { requested: "10", proposed: "5" },
  };
  const two = { ...one, applicationCount: 2, totals: { requested: "20", proposed: "5" } };
  const reordered = {
    totals: { proposed: "5", requested: "20" },
    title: "Spring",
    applicationCount: 2,
    preparationRevision: 3,
    roundId: applicationId,
  };
  const first = cite(one);
  const second = cite(two);
  expect(first.find((item) => item.kind === "round")).toEqual(
    second.find((item) => item.kind === "round"),
  );
  expect(first.find((item) => item.kind === "observation")?.version).toMatch(/^[a-f0-9]{64}$/);
  expect(second.find((item) => item.kind === "observation")?.version).not.toBe(
    first.find((item) => item.kind === "observation")?.version,
  );
  expect(cite(reordered)).toEqual(second);
});

it("distinguishes a proposed round from the public record id assigned on creation", async () => {
  const { catalog, ops } = setup();
  const prepared = await catalog.preview("create_funding_round", { requestId, title: "Spring" });
  assert(prepared.preview);
  expect(prepared.preview.targets).toEqual([
    { kind: "round", requestId, label: "Spring", version: "proposed" },
  ]);
  vi.mocked(ops.rounds.createRound).mockResolvedValue({ status: "ok", publicId: applicationId });
  expect((await catalog.execute(prepared.preview)).result).toEqual({
    status: "ok",
    roundId: applicationId,
  });
});

it.each(["invited", "accepted"])(
  "previews cancellation of the linked review request for a %s assignment",
  async (status) => {
    const { catalog, ops } = setup();
    vi.mocked(ops.reviewer.read).mockImplementation(
      vi.fn().mockResolvedValue({
        status: "ok",
        value: {
          assignment: {
            workspaceSlug,
            status,
            requestId,
            applicationTitle: "Gardens",
            revision: 2,
          },
          material: null,
          draft: null,
        },
      }),
    );
    const answer = await catalog.preview("respond_to_review", {
      assignmentId: commandId,
      commandId,
      expectedRevision: 2,
      action: "decline",
      note: "",
    });
    expect(answer.preview?.targets).toContainEqual({
      kind: "review_request",
      id: requestId,
      label: "Gardens",
      version: "assignment revision 2",
    });
    expect(answer.preview?.effects).toContain(
      "Cancel the linked review request and update the application's review revision.",
    );
    expect(ops.reviewer.respond).not.toHaveBeenCalled();
  },
);

it("keeps a refused draft operation from invalidating the reviewer's conversation", async () => {
  const { catalog, ops } = setup();
  vi.mocked(ops.reviewer.read).mockImplementation(
    vi.fn().mockResolvedValue({
      status: "ok",
      value: {
        assignment: { workspaceSlug, status: "invited", requestId, revision: 0 },
        material: null,
        draft: null,
      },
    }),
  );
  const refused = await catalog.preview("submit_reviewer_assessment", {
    assignmentId: commandId,
    commandId,
    expectedDraftRevision: 0,
  });
  expect(refused.result.status).toBe("forbidden");
  expect(await catalog.permits(refused.dependencies)).toBe(true);
  expect(
    (
      await catalog.preview("respond_to_review", {
        assignmentId: commandId,
        commandId,
        expectedRevision: 0,
        action: "accept",
        note: "",
      })
    ).preview,
  ).toBeDefined();
});
